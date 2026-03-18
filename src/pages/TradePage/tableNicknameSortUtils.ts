/**
 * Проверка ников текущей таблицы по другим таблицам и перерасстановка столбцов.
 * «Сортировка имён»: для каждого пользователя в текущей таблице ищется столбец в других таблицах
 * (тот же userId или тот же/схожий ник), и текущая таблица переставляется так, чтобы индексы совпадали.
 */

export type UserLike = { id: string; nickname: string };

export type SimilarNickEntry = {
  columnIndex: number;
  userId: string;
  nickname: string;
};

export type SimilarNicknameReport = {
  /** Столбец текущего пользователя */
  columnIndex: number;
  userId: string;
  nickname: string;
  /** Схожие ники в других столбцах этой же таблицы */
  similarInOtherColumns: SimilarNickEntry[];
  /** Стоит ли текущий пользователь в том же столбце, что и схожий (в одной таблице разные пользователи — всегда разные столбцы) */
  inSameColumn: boolean;
};

function isSimilarNickname(a: string, b: string): boolean {
  const na = (a ?? '').trim().toLowerCase();
  const nb = (b ?? '').trim().toLowerCase();
  if (na === nb) return false;
  return na.length > 0 && nb.length > 0 && (na.startsWith(nb) || nb.startsWith(na));
}

/**
 * Проверяет в переданных слотах одной таблицы: у кого есть схожие ники в других столбцах.
 * Принимает только данные одной таблицы, чтобы не нагружать систему.
 *
 * @param tableTitle — название таблицы (для логов/отчёта)
 * @param slots — слоты таблицы (userId или null по столбцам)
 * @param usersById — маппинг id → пользователь (достаточно id и nickname)
 * @returns отчёт по столбцам, где у пользователя есть схожий ник в другом столбце
 */
export function checkSimilarNicknamesInTable(
  _tableTitle: string,
  slots: (string | null)[],
  usersById: Record<string, UserLike>,
): SimilarNicknameReport[] {
  const reports: SimilarNicknameReport[] = [];

  for (let columnIndex = 0; columnIndex < slots.length; columnIndex++) {
    const userId = slots[columnIndex];
    if (!userId) continue;
    const user = usersById[userId];
    if (!user) continue;

    const nickname = (user.nickname ?? '').trim();
    if (!nickname) continue;

    const similarInOtherColumns: SimilarNickEntry[] = [];

    for (let otherCol = 0; otherCol < slots.length; otherCol++) {
      if (otherCol === columnIndex) continue;
      const otherId = slots[otherCol];
      if (!otherId) continue;
      const otherUser = usersById[otherId];
      if (!otherUser) continue;
      const otherNick = (otherUser.nickname ?? '').trim();
      if (!otherNick) continue;
      if (userId === otherId) continue;
      if (!isSimilarNickname(nickname, otherNick)) continue;

      similarInOtherColumns.push({
        columnIndex: otherCol,
        userId: otherId,
        nickname: otherUser.nickname,
      });
    }

    if (similarInOtherColumns.length === 0) continue;

    reports.push({
      columnIndex,
      userId,
      nickname: user.nickname,
      similarInOtherColumns,
      inSameColumn: false,
    });
  }

  return reports;
}

/** Нормализация ника для сравнения (lowercase, trim). */
function norm(a: string): string {
  return (a ?? '').trim().toLowerCase();
}

export type RearrangedSlotsResult = {
  /** Новые слоты только для текущей таблицы. */
  newSlots: (string | null)[];
  /**
   * Пользователи, которых из‑за конфликтов отправили "в конец" (по глобальному максимальному столбцу).
   * Этих пользователей нужно синхронно сдвинуть в тот же столбец и в других таблицах.
   */
  movedToTail: Array<{ userId: string; columnIndex: number }>;
};

/**
 * Для текущей таблицы проверяет ники по другим таблицам и возвращает новый порядок слотов,
 * чтобы пользователи стояли в тех же индексах столбцов, что и в других таблицах.
 * Также возвращает список пользователей, которых из‑за конфликтов пришлось сдвинуть "в конец",
 * чтобы остальные таблицы могли подстроиться под те же индексы.
 */
export function rearrangeSlotsByOtherTables(
  currentTableTitle: string,
  currentSlots: (string | null)[],
  tableUsers: Record<string, (string | null)[]>,
  orderedTableTitles: string[],
  usersById: Record<string, UserLike>,
): RearrangedSlotsResult {
  const otherTitles = orderedTableTitles.filter((t) => t !== currentTableTitle);
  const userIdsInCurrent = currentSlots.filter((id): id is string => id != null && id !== '');

  /** Предпочитаемый индекс столбца для userId (из другой таблицы: тот же userId или тот же/схожий ник). */
  const preferredIndex = new Map<string, number>();

  for (const userId of userIdsInCurrent) {
    const user = usersById[userId];
    const nickname = user ? (user.nickname ?? '').trim() : '';
    const nickNorm = norm(nickname);

    let found = -1;

    for (const tableTitle of otherTitles) {
      const slots = tableUsers[tableTitle];
      if (!Array.isArray(slots)) continue;
      for (let col = 0; col < slots.length; col++) {
        const id = slots[col];
        if (!id) continue;
        if (id === userId) {
          found = col;
          break;
        }
        const other = usersById[id];
        const otherNick = other ? (other.nickname ?? '').trim() : '';
        if (!otherNick) continue;
        if (norm(otherNick) === nickNorm) {
          found = col;
          break;
        }
        if (nickNorm && isSimilarNickname(nickname, otherNick)) {
          found = col;
          break;
        }
      }
      if (found >= 0) break;
    }

    if (found >= 0) preferredIndex.set(userId, found);
  }

  // Максимальная длина берётся по "самой длинной таблице", а не только по текущей.
  const columnCount = Object.values(tableUsers).reduce((max, slots) => {
    if (!Array.isArray(slots)) return max;
    return Math.max(max, slots.length);
  }, currentSlots.length);

  const newSlots: (string | null)[] = Array.from({ length: columnCount }, () => null);
  const movedToTail: Array<{ userId: string; columnIndex: number }> = [];

  // Для каждого пользователя считаем, в скольких таблицах он стоит в конкретном индексе столбца.
  const userLinkedByColumn: Record<string, Record<number, number>> = {};
  Object.values(tableUsers).forEach((slots) => {
    if (!Array.isArray(slots)) return;
    slots.forEach((id, col) => {
      if (!id) return;
      if (!userLinkedByColumn[id]) userLinkedByColumn[id] = {};
      userLinkedByColumn[id][col] = (userLinkedByColumn[id][col] ?? 0) + 1;
    });
  });

  const getLinkedCount = (userId: string, col: number): number =>
    userLinkedByColumn[userId]?.[col] ?? 0;

  // Предварительно найдём индексы столбцов, которые полностью пусты во всех таблицах.
  const fullyEmptyColumns: number[] = [];
  for (let col = 0; col < columnCount; col++) {
    let allNull = true;
    for (const slots of Object.values(tableUsers)) {
      if (!Array.isArray(slots)) continue;
      const id = slots[col];
      if (id != null && id !== '') {
        allNull = false;
        break;
      }
    }
    if (allNull) {
      fullyEmptyColumns.push(col);
    }
  }

  const getFallbackTailColumn = (slots: (string | null)[]): number => {
    // 1) Пытаемся использовать первый полностью пустой столбец (если он ещё свободен в текущей таблице).
    for (const col of fullyEmptyColumns) {
      if (col < slots.length && slots[col] === null) {
        return col;
      }
    }
    // 2) Иначе ищем свободное место с конца.
    for (let col = slots.length - 1; col >= 0; col -= 1) {
      if (slots[col] === null) return col;
    }
    // 3) Если вообще нет свободных ячеек — создаём новый столбец в конце.
    slots.push(null);
    return slots.length - 1;
  };

  const withPreferred = userIdsInCurrent.filter((id) => preferredIndex.has(id));
  const withoutPreferred = userIdsInCurrent.filter((id) => !preferredIndex.has(id));
  withPreferred.sort((a, b) => (preferredIndex.get(a) ?? 0) - (preferredIndex.get(b) ?? 0));
  const orderToPlace = [...withPreferred, ...withoutPreferred];

  for (const userId of orderToPlace) {
    const want = preferredIndex.get(userId);
    const wantValid = want !== undefined && want < columnCount;
    let col: number;

    if (wantValid) {
      // Есть целевой индекс из других таблиц.
      const target = want;
      const existingUserId = newSlots[target];

      if (existingUserId == null) {
        // В этом столбце ещё никого нет — просто ставим пользователя сюда.
        col = target;
      } else {
        // В этом столбце уже стоит другой пользователь.
        const existingLinkedCount = getLinkedCount(existingUserId, target);

        if (existingLinkedCount > 1) {
          // У "старого" пользователя есть повторения в этом столбце по другим таблицам,
          // поэтому НЕ трогаем его, а текущего отправляем "в конец".
          const fallbackCol = getFallbackTailColumn(newSlots);
          col = fallbackCol;
          movedToTail.push({ userId, columnIndex: fallbackCol });
        } else {
          // У "старого" пользователя нет "цепочки" в этом столбце —
          // его переносим в конец, а текущего ставим на целевой индекс.
          const fallbackCol = getFallbackTailColumn(newSlots);
          newSlots[fallbackCol] = existingUserId;
          movedToTail.push({ userId: existingUserId, columnIndex: fallbackCol });
          col = target;
        }
      }
    } else {
      // Нет предпочтительного столбца — ставим в первый свободный слот слева направо.
      col = 0;
      while (col < columnCount && newSlots[col] !== null) col += 1;
      if (col >= columnCount) col = columnCount - 1;
    }

    newSlots[col] = userId;
  }

  return { newSlots, movedToTail };
}
