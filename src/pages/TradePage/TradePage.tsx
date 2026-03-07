import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PencilIcon, TrashIcon, PlusIcon, ChevronDownIcon, CrossIcon } from './icons';
import { getItemStyleClass } from './itemStyles';
import RatioBubble from './RatioBubble';
import UserModal from './UserModal';
import styles from './TradePage.module.css';
import tablesRaw from '../temp.txt?raw';

type TradeTable = {
  title: string;
  items: string[];
};

/** Убираем служебное "2-", "10 -", если пользователь нумеровал таблицы вручную. */
const normalizeTableTitle = (value: string): string =>
  value.replace(/^\d+\s*-\s*/, '').trim();

/** temp.txt: [название таблицы] + [список предметов] + пустые строки-разделители. */
const parseTables = (raw: string): TradeTable[] => {
  const lines = raw.split(/\r?\n/);
  const tables: TradeTable[] = [];
  let index = 0;

  while (index < lines.length) {
    while (index < lines.length && lines[index].trim() === '') index += 1;
    if (index >= lines.length) break;

    const title = normalizeTableTitle(lines[index].trim());
    index += 1;

    while (index < lines.length && lines[index].trim() === '') index += 1;

    const items: string[] = [];
    while (index < lines.length && lines[index].trim() !== '') {
      items.push(lines[index].trim());
      index += 1;
    }

    if (title && items.length > 0) {
      tables.push({ title, items });
    }
  }

  return tables;
};

const TABLE_DEFINITIONS = parseTables(tablesRaw);
const TEMPLATE_ITEMS = Array.from(new Set(TABLE_DEFINITIONS.flatMap((table) => table.items)));

type UserId = string;
type TradeCategory = 'main' | 'less' | 'vacation' | 'completed';
type TradeCategoryTab = { key: TradeCategory; label: string };

const CATEGORY_TABS: TradeCategoryTab[] = [
  { key: 'main', label: 'Основные (текущий)' },
  { key: 'less', label: 'Менее интересные' },
  { key: 'vacation', label: 'Отпуск' },
  { key: 'completed', label: 'Завершенные' },
];
const UI_SCALE_OPTIONS = [1, 0.9, 0.7] as const;

export type User = {
  id: UserId;
  nickname: string;
  discordNickname: string;
  accountLink: string;
  category: TradeCategory;
};
type UserFormData = Omit<User, 'id' | 'category'>;

const createUserId = () => `u${Date.now()}`;
const normalizeNickname = (nickname: string): string => nickname.trim().toLowerCase();

const createSeedNickname = (index: number): string => `test_user_${index + 1}`;

const DEFAULT_USERS: User[] = TABLE_DEFINITIONS.map((_, index) => ({
  id: `seed_u_${index + 1}`,
  nickname: createSeedNickname(index),
  discordNickname: '',
  accountLink: '',
  category: 'main',
}));

type TableUserSlots = Record<string, Array<UserId | null>>;
type ColorTag =
  | ''
  | 'ua'
  | 'super'
  | 'medium'
  | 'last'
  | 'price_top'
  | 'price_mid'
  | 'price_none'
  | 'fast'
  | 'stopped'
  | 'gone'
  | 'other_trades'
  | 'bad_reviews'
  | 'carry';

const DEFAULT_TABLE_USERS: TableUserSlots = TABLE_DEFINITIONS.reduce<TableUserSlots>(
  (acc, table, index) => {
    acc[table.title] = [DEFAULT_USERS[index].id];
    return acc;
  },
  {},
);

/** Соотношения: tableTitle -> userId -> item -> ratio. */
type RatioOverrides = Record<string, Record<UserId, Record<string, string>>>;
/** Примечания: tableTitle -> userId -> item -> note. */
type RatioNotes = Record<string, Record<UserId, Record<string, string>>>;
/** Цветовые метки: tableTitle -> userId -> item -> tag. */
type RatioColors = Record<string, Record<UserId, Record<string, string>>>;
/** Цвет фона хедера пользователя: tableTitle -> userId -> tag. */
type UserHeaderColors = Record<string, Record<UserId, string>>;
type TradeUsersApiPayload = {
  users?: User[];
  tableUsers?: TableUserSlots;
  ratioOverrides?: RatioOverrides;
  ratioNotes?: RatioNotes;
  ratioColors?: RatioColors;
  userHeaderColors?: UserHeaderColors;
};
type UserPopupType = 'created' | 'exists' | 'linked';
type UserPopupState = { id: number; message: string; type: UserPopupType };

const HEADER_COLOR_OPTIONS: Array<{ value: ColorTag; title: string }> = [
  { value: 'ua', title: 'Украинец' },
  { value: 'super', title: 'Супер выгодно' },
  { value: 'medium', title: 'Средне выгодно' },
  { value: 'last', title: 'Последний вариант' },
  { value: 'price_top', title: 'Моя цена топ' },
  { value: 'price_mid', title: 'Моя цена средняя' },
  { value: 'price_none', title: 'Без описания' },
  { value: 'fast', title: 'Быстро' },
  { value: 'stopped', title: 'Перестал трейдиться' },
  { value: 'gone', title: 'Пропал' },
  { value: 'other_trades', title: 'Есть другие трейды ниже в один столбец' },
  { value: 'bad_reviews', title: 'Плохие отзывы' },
  { value: 'carry', title: 'carry' },
];

const TradePage = () => {
  const [items, setItems] = useState<string[]>(() => [...TEMPLATE_ITEMS]);
  const [users, setUsers] = useState<User[]>(() => [...DEFAULT_USERS]);
  const [tableUsers, setTableUsers] = useState<TableUserSlots>(() => ({ ...DEFAULT_TABLE_USERS }));
  const [newItemInput, setNewItemInput] = useState('');
  const [selectedTableName, setSelectedTableName] = useState<string>('');
  const [activeCategory, setActiveCategory] = useState<TradeCategory>('main');
  const [uiScale, setUiScale] = useState<(typeof UI_SCALE_OPTIONS)[number]>(0.9);
  const [ratioOverrides, setRatioOverrides] = useState<RatioOverrides>({});
  const [ratioNotes, setRatioNotes] = useState<RatioNotes>({});
  const [ratioColors, setRatioColors] = useState<RatioColors>({});
  const [userHeaderColors, setUserHeaderColors] = useState<UserHeaderColors>({});
  const [isEditMode, setIsEditMode] = useState(false);
  const [colorLegendOpen, setColorLegendOpen] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [editingItemValue, setEditingItemValue] = useState('');
  const [addPopupOpen, setAddPopupOpen] = useState(false);
  const [selectOpen, setSelectOpen] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<UserId | null>(null);
  const [activeTableForUserModal, setActiveTableForUserModal] = useState<string | null>(null);
  const [activeHeaderColorPickerKey, setActiveHeaderColorPickerKey] = useState<string | null>(null);
  const [highlightedItem, setHighlightedItem] = useState<string>('');
  const [userCreatePopups, setUserCreatePopups] = useState<UserPopupState[]>([]);
  const popupRef = useRef<HTMLDivElement>(null);
  const selectDropdownRef = useRef<HTMLDivElement>(null);
  const hasLoadedDbRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);

  const addItem = () => {
    const trimmed = newItemInput.trim();
    if (!trimmed || items.includes(trimmed)) return;
    setItems((prev) => [...prev, trimmed]);
    setNewItemInput('');
  };

  const removeItem = (item: string) => {
    setItems((prev) => prev.filter((i) => i !== item));
    setRatioOverrides((prev) => {
      const next = { ...prev };
      TABLE_DEFINITIONS.forEach((table) => {
        const tableRatios = next[table.title];
        if (!tableRatios) return;
        users.forEach((u) => {
          if (tableRatios[u.id]) {
            const userRatios = { ...tableRatios[u.id] };
            delete userRatios[item];
            tableRatios[u.id] = userRatios;
          }
        });
      });
      return next;
    });
    setRatioNotes((prev) => {
      const next = { ...prev };
      TABLE_DEFINITIONS.forEach((table) => {
        const tableNotes = next[table.title];
        if (!tableNotes) return;
        users.forEach((u) => {
          if (tableNotes[u.id]) {
            const userNotes = { ...tableNotes[u.id] };
            delete userNotes[item];
            tableNotes[u.id] = userNotes;
          }
        });
      });
      return next;
    });
    setRatioColors((prev) => {
      const next = { ...prev };
      TABLE_DEFINITIONS.forEach((table) => {
        const tableColors = next[table.title];
        if (!tableColors) return;
        users.forEach((u) => {
          if (tableColors[u.id]) {
            const userColors = { ...tableColors[u.id] };
            delete userColors[item];
            tableColors[u.id] = userColors;
          }
        });
      });
      return next;
    });
  };

  const startEditName = (index: number) => {
    setEditingItemIndex(index);
    setEditingItemValue(items[index]);
  };

  const saveEditName = () => {
    if (editingItemIndex === null) return;
    const oldName = items[editingItemIndex];
    const newName = editingItemValue.trim();
    if (!newName || newName === oldName) {
      setEditingItemIndex(null);
      return;
    }
    setItems((prev) => {
      const next = [...prev];
      next[editingItemIndex] = newName;
      return next;
    });
    setRatioOverrides((prev) => {
      const next = { ...prev };
      TABLE_DEFINITIONS.forEach((table) => {
        const tableRatios = next[table.title];
        if (!tableRatios) return;
        users.forEach((u) => {
          if (tableRatios[u.id]?.[oldName] !== undefined) {
            const userRatios = { ...tableRatios[u.id] };
            userRatios[newName] = userRatios[oldName];
            delete userRatios[oldName];
            tableRatios[u.id] = userRatios;
          }
        });
      });
      return next;
    });
    setRatioNotes((prev) => {
      const next = { ...prev };
      TABLE_DEFINITIONS.forEach((table) => {
        const tableNotes = next[table.title];
        if (!tableNotes) return;
        users.forEach((u) => {
          if (tableNotes[u.id]?.[oldName] !== undefined) {
            const userNotes = { ...tableNotes[u.id] };
            userNotes[newName] = userNotes[oldName];
            delete userNotes[oldName];
            tableNotes[u.id] = userNotes;
          }
        });
      });
      return next;
    });
    setRatioColors((prev) => {
      const next = { ...prev };
      TABLE_DEFINITIONS.forEach((table) => {
        const tableColors = next[table.title];
        if (!tableColors) return;
        users.forEach((u) => {
          if (tableColors[u.id]?.[oldName] !== undefined) {
            const userColors = { ...tableColors[u.id] };
            userColors[newName] = userColors[oldName];
            delete userColors[oldName];
            tableColors[u.id] = userColors;
          }
        });
      });
      return next;
    });
    setEditingItemIndex(null);
  };

  const getRatio = (tableTitle: string, userId: UserId, item: string): string =>
    ratioOverrides[tableTitle]?.[userId]?.[item] ?? '';

  const getNote = (tableTitle: string, userId: UserId, item: string): string =>
    ratioNotes[tableTitle]?.[userId]?.[item] ?? '';

  const normalizeColorTag = (value: string | undefined): ColorTag => {
    if (!value) return '';
    if (value === 'c1') return 'super';
    if (value === 'c2') return 'medium';
    if (value === 'c3') return 'last';
    if (value === 'c4') return 'price_top';
    if (value === 'c5') return 'price_mid';
    if (value === 'c6') return 'price_none';
    if (value === 'c7') return 'fast';
    if (value === 'c8') return 'bad_reviews';
    if (
      [
        'ua',
        'super',
        'medium',
        'last',
        'price_top',
        'price_mid',
        'price_none',
        'fast',
        'stopped',
        'gone',
        'other_trades',
        'bad_reviews',
        'carry',
      ].includes(value)
    ) {
      return value as ColorTag;
    }
    return '';
  };

  const getColorTag = (
    tableTitle: string,
    userId: UserId,
    item: string,
  ): ColorTag => normalizeColorTag(ratioColors[tableTitle]?.[userId]?.[item]);

  const handleRatioChange = (tableTitle: string, userId: UserId, item: string, value: string) => {
    setRatioOverrides((prev) => ({
      ...prev,
      [tableTitle]: {
        ...(prev[tableTitle] ?? {}),
        [userId]: {
          ...(prev[tableTitle]?.[userId] ?? {}),
          [item]: value,
        },
      },
    }));
  };

  const handleNoteChange = (tableTitle: string, userId: UserId, item: string, value: string) => {
    setRatioNotes((prev) => ({
      ...prev,
      [tableTitle]: {
        ...(prev[tableTitle] ?? {}),
        [userId]: {
          ...(prev[tableTitle]?.[userId] ?? {}),
          [item]: value,
        },
      },
    }));
  };

  const handleColorTagChange = (
    tableTitle: string,
    userId: UserId,
    item: string,
    value: ColorTag,
  ) => {
    setRatioColors((prev) => ({
      ...prev,
      [tableTitle]: {
        ...(prev[tableTitle] ?? {}),
        [userId]: {
          ...(prev[tableTitle]?.[userId] ?? {}),
          [item]: value,
        },
      },
    }));
  };

  const getUserHeaderColorTag = (tableTitle: string, userId: UserId): ColorTag =>
    normalizeColorTag(userHeaderColors[tableTitle]?.[userId]);

  const handleUserHeaderColorTagChange = (tableTitle: string, userId: UserId, value: ColorTag) => {
    setUserHeaderColors((prev) => ({
      ...prev,
      [tableTitle]: {
        ...(prev[tableTitle] ?? {}),
        [userId]: value,
      },
    }));
  };

  const getHeaderColorClass = (tag: ColorTag): string => {
    if (tag === 'ua') return 'headerColorUa';
    if (tag === 'super') return 'headerColorSuper';
    if (tag === 'medium') return 'headerColorMedium';
    if (tag === 'last') return 'headerColorLast';
    if (tag === 'price_top') return 'headerColorPriceTop';
    if (tag === 'price_mid') return 'headerColorPriceMid';
    if (tag === 'price_none') return 'headerColorPriceNone';
    if (tag === 'fast') return 'headerColorFast';
    if (tag === 'stopped') return 'headerColorStopped';
    if (tag === 'gone') return 'headerColorGone';
    if (tag === 'other_trades') return 'headerColorOtherTrades';
    if (tag === 'bad_reviews') return 'headerColorBadReviews';
    if (tag === 'carry') return 'headerColorCarry';
    return '';
  };

  const usersById = users.reduce<Record<UserId, User>>((acc, user) => {
    acc[user.id] = user;
    return acc;
  }, {});
  const orderedTables = TABLE_DEFINITIONS;

  const updateUser = (userId: UserId, data: UserFormData) => {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...data } : u)));
    setUserModalOpen(false);
    setEditingUserId(null);
    setActiveTableForUserModal(null);
  };

  const enqueueUserPopup = (message: string, type: UserPopupType) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setUserCreatePopups((prev) => [...prev, { id, message, type }].slice(-3));
    window.setTimeout(() => {
      setUserCreatePopups((prev) => prev.filter((popup) => popup.id !== id));
    }, 3000);
  };

  const addUserToTable = (tableTitle: string, data: UserFormData) => {
    const normalizedNick = normalizeNickname(data.nickname);
    const existingUser = users.find(
      (u) =>
        normalizeNickname(u.nickname) === normalizedNick &&
        (u.category ?? 'main') === activeCategory,
    );
    const userId = existingUser?.id ?? createUserId();
    const alreadyInCurrentTable = (tableUsers[tableTitle] ?? []).includes(userId);

    if (!existingUser) {
      setUsers((prev) => [...prev, { id: userId, ...data, category: activeCategory }]);
    }

    setTableUsers((prev) => {
      const currentSlots = [...(prev[tableTitle] ?? [])];
      if (currentSlots.includes(userId)) return prev;

      let linkedIndex = -1;
      for (const [otherTableTitle, otherSlots] of Object.entries(prev)) {
        if (otherTableTitle === tableTitle) continue;
        const indexInOther = otherSlots.indexOf(userId);
        if (indexInOther >= 0) {
          linkedIndex = indexInOther;
          break;
        }
      }

      if (existingUser && linkedIndex >= 0) {
        while (currentSlots.length <= linkedIndex) {
          currentSlots.push(null);
        }
        if (currentSlots[linkedIndex] === null) {
          currentSlots[linkedIndex] = userId;
        } else {
          currentSlots.splice(linkedIndex, 0, userId);
        }
      } else {
        const firstEmptyIndex = currentSlots.indexOf(null);
        if (firstEmptyIndex >= 0) {
          currentSlots[firstEmptyIndex] = userId;
        } else {
          currentSlots.push(userId);
        }
      }

      return {
        ...prev,
        [tableTitle]: currentSlots,
      };
    });

    setUserModalOpen(false);
    setEditingUserId(null);
    setActiveTableForUserModal(null);
    if (existingUser && alreadyInCurrentTable) {
      enqueueUserPopup('Такой пользователь уже есть в этой таблице', 'exists');
    } else if (existingUser) {
      enqueueUserPopup('Такой пользователь уже есть, привязан к нужному столбцу', 'linked');
    } else {
      enqueueUserPopup('Пользователь создан', 'created');
    }
  };

  const moveUserColumn = (
    tableTitle: string,
    columnIndex: number,
    direction: 'left' | 'right',
  ) => {
    setTableUsers((prev) => {
      const targetIndex = direction === 'left' ? columnIndex - 1 : columnIndex + 1;
      if (columnIndex < 0 || targetIndex < 0) return prev;

      const orderedTitles = orderedTables.map((table) => table.title);
      const maxColumns = orderedTitles.reduce(
        (max, title) => Math.max(max, (prev[title] ?? []).length),
        0,
      );
      if (targetIndex >= maxColumns) return prev;

      const currentSlots = [...(prev[tableTitle] ?? [])];
      while (currentSlots.length < maxColumns) {
        currentSlots.push(null);
      }
      const movingId = currentSlots[columnIndex];
      const neighborId = currentSlots[targetIndex];
      const movingLinkedCount = movingId ? linkedUserTableCount[movingId] ?? 0 : 0;
      const neighborLinkedCount = neighborId ? linkedUserTableCount[neighborId] ?? 0 : 0;
      const shouldMoveWholeColumn =
        movingLinkedCount > 1 || neighborLinkedCount > 1;

      // Если затронут связанный пользователь (в нескольких таблицах), двигаем весь столбец.
      if (!shouldMoveWholeColumn) {
        const localSlots = [...currentSlots];
        [localSlots[columnIndex], localSlots[targetIndex]] = [
          localSlots[targetIndex],
          localSlots[columnIndex],
        ];
        return { ...prev, [tableTitle]: localSlots };
      }

      const next: TableUserSlots = { ...prev };
      orderedTitles.forEach((title) => {
        const slots = [...(prev[title] ?? [])];
        while (slots.length < maxColumns) {
          slots.push(null);
        }
        [slots[columnIndex], slots[targetIndex]] = [
          slots[targetIndex],
          slots[columnIndex],
        ];
        next[title] = slots;
      });

      return next;
    });
  };

  const removeUserColumn = (tableTitle: string, columnIndex: number) => {
    setTableUsers((prev) => {
      const slots = [...(prev[tableTitle] ?? [])];
      if (columnIndex < 0 || columnIndex >= slots.length) return prev;
      slots.splice(columnIndex, 1);
      return {
        ...prev,
        [tableTitle]: slots,
      };
    });
  };

  const confirmAndRemoveUserColumn = (
    tableTitle: string,
    columnIndex: number,
    userNickname?: string,
  ) => {
    const columnLabel = `столбец №${columnIndex + 1}`;
    const userLabel = userNickname ? `пользователь: ${userNickname}` : 'пустой столбец';
    const confirmed = window.confirm(
      `Хотите удалить ${columnLabel}?\nТаблица: ${tableTitle}\n(${userLabel})`,
    );
    if (!confirmed) return;
    removeUserColumn(tableTitle, columnIndex);
  };

  const enabledItems = new Set(items);
  const customItems = items.filter((item) => !TEMPLATE_ITEMS.includes(item));

  const getTableItems = (table: TradeTable): string[] => {
    const tableItems = table.items.filter((item) => enabledItems.has(item));
    return [...tableItems, ...customItems];
  };

  const selectedTable =
    selectedTableName === ''
      ? null
      : orderedTables.find((table) => table.title === selectedTableName) ?? null;

  const getUserSlotsForTable = (tableTitle: string): Array<UserId | null> => tableUsers[tableTitle] ?? [];
  const getVisibleUserSlotsForTable = (tableTitle: string): Array<UserId | null> =>
    getUserSlotsForTable(tableTitle).map((slot) => {
      if (!slot) return null;
      const user = usersById[slot];
      if (!user) return null;
      return (user.category ?? 'main') === activeCategory ? slot : null;
    });

  const getUsersForTable = (tableTitle: string): User[] =>
    getVisibleUserSlotsForTable(tableTitle)
      .filter((id): id is UserId => id !== null)
      .map((id) => usersById[id])
      .filter(Boolean);

  const usersWithOfferInSelected = selectedTable
    ? getUsersForTable(selectedTable.title).filter((user) =>
        getTableItems(selectedTable).some((item) => getRatio(selectedTable.title, user.id, item).trim() !== ''),
      )
    : [];

  const usersWithOfferInSelectedIds = new Set(usersWithOfferInSelected.map((u) => u.id));

  const visibleTables = selectedTable
    ? [
        { table: selectedTable, userSlots: getVisibleUserSlotsForTable(selectedTable.title) },
        ...orderedTables.filter((table) => table.title !== selectedTable.title).map((table) => ({
          table,
          userSlots: getVisibleUserSlotsForTable(table.title).map((slot) =>
            slot !== null && usersWithOfferInSelectedIds.has(slot) ? slot : null,
          ),
        })),
      ]
    : orderedTables.map((table) => ({ table, userSlots: getVisibleUserSlotsForTable(table.title) }));

  const linkedUserTableCount = orderedTables.reduce<Record<UserId, number>>((acc, table) => {
    (tableUsers[table.title] ?? []).forEach((id) => {
      if (!id) return;
      acc[id] = (acc[id] ?? 0) + 1;
    });
    return acc;
  }, {});
  const maxUserColumns = orderedTables.reduce(
    (max, table) => Math.max(max, (tableUsers[table.title] ?? []).length),
    0,
  );
  const columnNicknameCount: Record<number, Record<string, number>> = {};
  const columnNicknameOrder: Record<number, string[]> = {};
  visibleTables.forEach((entry) => {
    entry.userSlots.forEach((slot, columnIndex) => {
      if (!slot) return;
      const user = usersById[slot];
      if (!user) return;
      const normalizedNick = normalizeNickname(user.nickname);
      if (!columnNicknameCount[columnIndex]) columnNicknameCount[columnIndex] = {};
      columnNicknameCount[columnIndex][normalizedNick] =
        (columnNicknameCount[columnIndex][normalizedNick] ?? 0) + 1;
      if (!columnNicknameOrder[columnIndex]) columnNicknameOrder[columnIndex] = [];
      if (!columnNicknameOrder[columnIndex].includes(normalizedNick)) {
        columnNicknameOrder[columnIndex].push(normalizedNick);
      }
    });
  });

  const columnRepeatedNicknames: Record<number, string[]> = {};
  Object.entries(columnNicknameCount).forEach(([columnKey, nicknameCount]) => {
    const columnIndex = Number(columnKey);
    columnRepeatedNicknames[columnIndex] = Object.entries(nicknameCount)
      .filter(([, count]) => count > 1)
      .map(([nickname]) => nickname);
  });

  const getNicknameShadeIndex = (columnIndex: number, normalizedNickname: string): number => {
    const order = columnNicknameOrder[columnIndex] ?? [];
    const index = order.indexOf(normalizedNickname);
    return index >= 0 ? index + 1 : 1;
  };

  useEffect(() => {
    const loadInitialUsersFromLocalDb = async () => {
      try {
        const response = await fetch('http://localhost:4000/api/trade-table-users');
        if (!response.ok) {
          hasLoadedDbRef.current = true;
          return;
        }
        const payload = (await response.json()) as TradeUsersApiPayload;
        const dbUsers = Array.isArray(payload.users)
          ? payload.users.map((u) => ({ ...u, category: u.category ?? 'main' }))
          : [];
        const dbTableUsers = payload.tableUsers && typeof payload.tableUsers === 'object'
          ? payload.tableUsers
          : {};
        const hasUsersInDb = dbUsers.length > 0;
        const hasUserSlotsInDb = Object.values(dbTableUsers).some(
          (slots) => Array.isArray(slots) && slots.some((slot) => slot !== null && slot !== ''),
        );

        if (!hasUsersInDb || !hasUserSlotsInDb) {
          hasLoadedDbRef.current = true;
          return;
        }

        setUsers(dbUsers);
        setTableUsers((prev) => ({
          ...prev,
          ...dbTableUsers,
        }));
        if (payload.ratioOverrides && typeof payload.ratioOverrides === 'object') {
          setRatioOverrides(payload.ratioOverrides);
        }
        if (payload.ratioNotes && typeof payload.ratioNotes === 'object') {
          setRatioNotes(payload.ratioNotes);
        }
        if (payload.ratioColors && typeof payload.ratioColors === 'object') {
          setRatioColors(payload.ratioColors);
        }
        if (payload.userHeaderColors && typeof payload.userHeaderColors === 'object') {
          setUserHeaderColors(payload.userHeaderColors);
        }
        hasLoadedDbRef.current = true;
      } catch {
        // fallback to default test users
        hasLoadedDbRef.current = true;
      }
    };

    void loadInitialUsersFromLocalDb();
  }, []);

  useEffect(() => {
    if (!hasLoadedDbRef.current) return;

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      void fetch('http://localhost:4000/api/trade-table-users', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          users,
          tableUsers,
          ratioOverrides,
          ratioNotes,
          ratioColors,
          userHeaderColors,
        }),
      }).catch(() => {
        // Keep UI responsive even if backend is down.
      });
    }, 500);

    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [users, tableUsers, ratioOverrides, ratioNotes, ratioColors, userHeaderColors]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (addPopupOpen && popupRef.current && !popupRef.current.contains(target)) {
        setAddPopupOpen(false);
      }
      if (selectOpen && editingItemIndex === null && selectDropdownRef.current && !selectDropdownRef.current.contains(target)) {
        setSelectOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [addPopupOpen, selectOpen, editingItemIndex]);

  const toggleEditMode = () => {
    const nextMode = !isEditMode;
    setIsEditMode(nextMode);
    if (!nextMode) {
      setActiveHeaderColorPickerKey(null);
    }
  };

  return (
    <div className={styles.root} style={{ zoom: uiScale }}>
      <div className={styles.header}>
        <Link to="/" className={styles.linkToTrade}>
          ← На главную
        </Link>
        <div className={styles.categoryTabs}>
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`${styles.categoryTabBtn} ${activeCategory === tab.key ? styles.categoryTabBtnActive : ''}`}
              onClick={() => setActiveCategory(tab.key)}
            >
              {tab.label}
            </button>
          ))}
          <button
            type="button"
            className={styles.colorLegendBtn}
            onClick={() => setColorLegendOpen(true)}
            title="Информация по цветам"
            aria-label="Информация по цветам"
          >
            i
          </button>
          <div className={styles.zoomControls}>
            {UI_SCALE_OPTIONS.map((scale) => (
              <button
                key={scale}
                type="button"
                className={`${styles.zoomBtn} ${uiScale === scale ? styles.zoomBtnActive : ''}`}
                onClick={() => setUiScale(scale)}
              >
                {Math.round(scale * 100)}%
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.mainLayout}>
        <section className={styles.giveSection}>
          <label className={styles.label} htmlFor="give-select">
            Я даю
          </label>
          <div className={styles.selectWithPopup}>
            <div className={styles.selectRow} ref={selectDropdownRef}>
              <button
                type="button"
                id="give-select"
                className={styles.selectTrigger}
                onClick={() => setSelectOpen((v) => !v)}
                aria-expanded={selectOpen}
                aria-haspopup="listbox"
              >
                <span className={styles.selectValue}>
                  {selectedTableName || '— все таблицы —'}
                </span>
                <ChevronDownIcon className={selectOpen ? styles.selectArrowOpen : ''} />
              </button>
              {selectOpen && (
                <div className={styles.selectDropdown}>
                  <button
                    type="button"
                    className={`${styles.selectOption} ${!selectedTableName ? styles.selectOptionActive : ''}`}
                    onClick={() => {
                      setSelectedTableName('');
                      setSelectOpen(false);
                    }}
                  >
                    — все таблицы —
                  </button>
                  {orderedTables.map((table) => (
                    <div key={table.title} className={styles.selectOptionRow}>
                      <button
                        type="button"
                        className={`${styles.selectOption} ${selectedTableName === table.title ? styles.selectOptionActive : ''}`}
                        onClick={() => {
                          setSelectedTableName(table.title);
                          setSelectOpen(false);
                        }}
                      >
                        {table.title}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                className={styles.plusBtn}
                onClick={() => {
                  setAddPopupOpen((v) => !v);
                  setSelectOpen(false);
                }}
                title="Добавить предмет"
              >
                <PlusIcon />
              </button>
            </div>

            {addPopupOpen && (
              <div className={styles.popupOverlay}>
                <div ref={popupRef} className={styles.popup}>
                  <div className={styles.popupTitle}>Новый предмет</div>
                  <div className={styles.addRow}>
                    <input
                      type="text"
                      className={styles.addInput}
                      placeholder="Название предмета"
                      value={newItemInput}
                      onChange={(e) => setNewItemInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addItem()}
                    />
                    <button type="button" className={styles.btn} onClick={addItem}>
                      Добавить
                    </button>
                  </div>
                  {isEditMode && items.length > 0 && (
                    <div className={styles.popupList}>
                      <div className={styles.popupListTitle}>Существующие</div>
                      {items.map((item, index) => (
                        <div key={`${item}-${index}`} className={styles.itemRow}>
                          {editingItemIndex === index ? (
                            <input
                              type="text"
                              className={styles.itemNameInput}
                              value={editingItemValue}
                              onChange={(e) => setEditingItemValue(e.target.value)}
                              onBlur={saveEditName}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveEditName();
                                if (e.key === 'Escape') {
                                  setEditingItemIndex(null);
                                  setEditingItemValue('');
                                }
                              }}
                              autoFocus
                            />
                          ) : (
                            <span className={styles.itemName}>{item}</span>
                          )}
                          <div className={styles.itemActions}>
                            {editingItemIndex !== index && (
                              <button
                                type="button"
                                className={styles.iconBtn}
                                onClick={() => startEditName(index)}
                                title="Редактировать название"
                              >
                                <PencilIcon />
                              </button>
                            )}
                            <button
                              type="button"
                              className={`${styles.iconBtn} ${styles.iconBtnTrash}`}
                              onClick={() => removeItem(item)}
                              title="Удалить"
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        <div className={styles.separator} />

        <section className={styles.tableSection}>
          {visibleTables.map(({ table, userSlots }, index) => {
            const tableItems = getTableItems(table);
            const hasAnyUser = userSlots.some((slot) => slot !== null);
            if (!hasAnyUser || tableItems.length === 0) return null;

            return (
              <div key={`${table.title}-${index}`} className={styles.tableBlock}>
                <div className={styles.tableScrollWrap}>
                  <table className={styles.usersTable}>
                    <thead>
                      <tr>
                        <th className={styles.stickyCol}>
                          <div className={styles.stickyHeaderCellContent}>
                            <div
                              className={`${styles.blockTitle} ${
                                getItemStyleClass(table.title) ? styles[getItemStyleClass(table.title)] : ''
                              }`}
                            >
                              {table.title}
                            </div>
                            <button
                              type="button"
                              className={`${styles.addUserBtn} ${styles.addUserBtnCompact}`}
                              onClick={() => {
                                setEditingUserId(null);
                                setActiveTableForUserModal(table.title);
                                setUserModalOpen(true);
                              }}
                              title="Добавить игрока"
                              aria-label="Добавить игрока"
                            >
                              <PlusIcon />
                            </button>
                          </div>
                        </th>
                        {userSlots.map((slot, columnIndex) => {
                          if (slot === null) {
                            return (
                              <th key={`empty-${table.title}-${columnIndex}`} className={`${styles.userTh} ${styles.placeholderUserTh}`}>
                                <div className={styles.emptyUserPlaceholder}>—</div>
                              </th>
                            );
                          }
                          const user = usersById[slot];
                          if (!user) {
                            return (
                              <th key={`missing-${table.title}-${columnIndex}`} className={`${styles.userTh} ${styles.placeholderUserTh}`}>
                                <div className={styles.emptyUserPlaceholder}>—</div>
                              </th>
                            );
                          }
                          return (
                            <th key={user.id} className={styles.userTh}>
                              {(() => {
                                const linkedCount = linkedUserTableCount[user.id] ?? 0;
                                const normalizedNickname = normalizeNickname(user.nickname);
                                const sameNickRepeatCount =
                                  columnNicknameCount[columnIndex]?.[normalizedNickname] ?? 0;
                                const hasOtherRepeatedNickInColumn =
                                  (columnRepeatedNicknames[columnIndex] ?? []).some(
                                    (nick) => nick !== normalizedNickname,
                                  );
                                const duplicateInSameColumn = sameNickRepeatCount > 1;
                                const shadeIndex = getNicknameShadeIndex(
                                  columnIndex,
                                  normalizedNickname,
                                );
                                const shadeClass =
                                  shadeIndex % 3 === 1
                                    ? styles.nicknameLinkedShade1
                                    : shadeIndex % 3 === 2
                                      ? styles.nicknameLinkedShade2
                                      : styles.nicknameLinkedShade3;
                                const linkedClass =
                                  linkedCount > 1 ||
                                  duplicateInSameColumn ||
                                  hasOtherRepeatedNickInColumn
                                    ? `${styles.nicknameLinked} ${shadeClass}`
                                    : '';
                                const headerColorTag = getUserHeaderColorTag(table.title, user.id);
                                const headerColorClass = getHeaderColorClass(headerColorTag);
                                const pickerKey = `${table.title}:${user.id}`;
                                const isHeaderColorPickerOpen = activeHeaderColorPickerKey === pickerKey;
                                return (
                                  <div
                                    className={`${styles.userHeaderPanel} ${
                                      headerColorClass ? styles[headerColorClass] : ''
                                    }`}
                                  >
                                    {isEditMode ? (
                                      <div className={styles.moveUserActions}>
                                        <button
                                          type="button"
                                          className={styles.moveUserBtn}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            moveUserColumn(table.title, columnIndex, 'left');
                                          }}
                                          disabled={columnIndex === 0}
                                          title="Сдвинуть пользователя влево"
                                        >
                                          ←
                                        </button>
                                        <button
                                          type="button"
                                          className={styles.moveUserBtn}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            moveUserColumn(table.title, columnIndex, 'right');
                                          }}
                                          disabled={columnIndex >= maxUserColumns - 1}
                                          title="Сдвинуть пользователя вправо"
                                        >
                                          →
                                        </button>
                                      </div>
                                    ) : (
                                      <div className={styles.ratioLabel}>(его:мое)</div>
                                    )}
                                    <div className={styles.nicknameCell}>
                                      {user.accountLink ? (
                                        <a
                                          href={user.accountLink}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className={`${styles.nicknameLink} ${linkedClass}`}
                                          title={[
                                            `Ник: ${user.nickname}`,
                                            user.discordNickname && `Discord: ${user.discordNickname}`,
                                          ]
                                            .filter(Boolean)
                                            .join('\n')}
                                        >
                                          {user.nickname}
                                        </a>
                                      ) : (
                                        <span
                                          className={`${styles.nickname} ${linkedClass}`}
                                          title={[
                                            `Ник: ${user.nickname}`,
                                            user.discordNickname && `Discord: ${user.discordNickname}`,
                                          ]
                                            .filter(Boolean)
                                            .join('\n')}
                                        >
                                          {user.nickname}
                                        </span>
                                      )}
                                    </div>
                                    {isEditMode ? (
                                      <div className={styles.userHeaderTools}>
                                        <button
                                          type="button"
                                          className={styles.nicknameEditBtn}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingUserId(user.id);
                                            setActiveTableForUserModal(table.title);
                                            setUserModalOpen(true);
                                          }}
                                          title="Редактировать"
                                        >
                                          <PencilIcon />
                                        </button>
                                        <div className={styles.headerColorPickerWrap}>
                                          <button
                                            type="button"
                                            className={`${styles.headerCurrentColorBtn} ${
                                              headerColorClass
                                                ? styles[headerColorClass]
                                                : styles.headerCurrentColorBtnEmpty
                                            }`}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setActiveHeaderColorPickerKey((prev) =>
                                                prev === pickerKey ? null : pickerKey,
                                              );
                                            }}
                                            title="Цвет фона колонки"
                                          />
                                          {isHeaderColorPickerOpen && (
                                            <div
                                              className={styles.headerColorPalette}
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              {HEADER_COLOR_OPTIONS.map((option) => (
                                                <button
                                                  key={option.value}
                                                  type="button"
                                                  className={`${styles.headerColorTagBtn} ${
                                                    styles[getHeaderColorClass(option.value)]
                                                  }`}
                                                  onClick={() => {
                                                    handleUserHeaderColorTagChange(
                                                      table.title,
                                                      user.id,
                                                      option.value,
                                                    );
                                                    setActiveHeaderColorPickerKey(null);
                                                  }}
                                                  title={option.title}
                                                />
                                              ))}
                                              <button
                                                type="button"
                                                className={styles.headerColorClearBtn}
                                                onClick={() => {
                                                  handleUserHeaderColorTagChange(table.title, user.id, '');
                                                  setActiveHeaderColorPickerKey(null);
                                                }}
                                                title="Сбросить цвет"
                                              >
                                                ×
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                        <button
                                          type="button"
                                          className={styles.columnDeleteBtn}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            confirmAndRemoveUserColumn(
                                              table.title,
                                              columnIndex,
                                              user.nickname,
                                            );
                                          }}
                                          title="Удалить этот столбец"
                                          aria-label="Удалить этот столбец"
                                        >
                                          <CrossIcon />
                                        </button>
                                      </div>
                                    ) : (
                                      <div className={styles.userHeaderToolsSpacer} />
                                    )}
                                  </div>
                                );
                              })()}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {tableItems.map((item) => (
                        <tr
                          key={`${table.title}-${item}`}
                          className={highlightedItem === item ? styles.highlightedItemRow : ''}
                        >
                          <td
                            className={`${styles.stickyCol} ${
                              highlightedItem === item ? styles.highlightedItemStickyCell : ''
                            }`}
                          >
                            <div
                              className={`${styles.itemNameCell} ${
                                getItemStyleClass(item) ? styles[getItemStyleClass(item)] : ''
                              } ${styles.itemNameCellClickable} ${
                                highlightedItem === item ? styles.highlightedItemNameCell : ''
                              }`}
                              onClick={() =>
                                setHighlightedItem((prev) => (prev === item ? '' : item))
                              }
                              title="Выделить эту строку во всех таблицах"
                            >
                              {item}
                            </div>
                          </td>
                          {userSlots.map((slot, columnIndex) => {
                            if (slot === null || !usersById[slot]) {
                              return (
                                <td
                                  key={`empty-ratio-${table.title}-${item}-${columnIndex}`}
                                  className={`${styles.ratioTd} ${styles.placeholderRatioTd} ${
                                    highlightedItem === item ? styles.highlightedItemRatioCell : ''
                                  }`}
                                />
                              );
                            }
                            const user = usersById[slot];
                            return (
                              <td
                                key={user.id}
                                className={`${styles.ratioTd} ${
                                  highlightedItem === item ? styles.highlightedItemRatioCell : ''
                                }`}
                              >
                                <RatioBubble
                                  ratio={getRatio(table.title, user.id, item)}
                                  note={getNote(table.title, user.id, item)}
                                  colorTag={getColorTag(table.title, user.id, item)}
                                  onRatioChange={(v) => handleRatioChange(table.title, user.id, item, v)}
                                  onNoteChange={(v) => handleNoteChange(table.title, user.id, item, v)}
                                  onColorTagChange={(v) => handleColorTagChange(table.title, user.id, item, v)}
                                  isEditMode={isEditMode}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </section>
      </div>

      {userModalOpen && (
        <UserModal
          user={editingUserId ? users.find((u) => u.id === editingUserId) ?? null : null}
          onSave={(data) => {
            if (editingUserId) {
              updateUser(editingUserId, data);
            } else {
              const tableTitle =
                activeTableForUserModal ||
                selectedTableName ||
                TABLE_DEFINITIONS[0]?.title ||
                '';
              if (!tableTitle) return;
              addUserToTable(tableTitle, data);
            }
          }}
          onClose={() => {
            setUserModalOpen(false);
            setEditingUserId(null);
            setActiveTableForUserModal(null);
          }}
        />
      )}
      <div className={styles.userCreatePopupStack}>
        {userCreatePopups.map((popup, index) => (
          <div
            key={popup.id}
            className={`${styles.userCreatePopup} ${
              popup.type === 'created'
                ? styles.userCreatePopupCreated
                : popup.type === 'linked'
                  ? styles.userCreatePopupLinked
                  : styles.userCreatePopupExists
            }`}
            style={{
              top: `${16 + index * 66}px`,
              right: `${16 + index * 8}px`,
            }}
          >
            <div>{popup.message}</div>
            <div className={styles.userCreatePopupProgress} />
          </div>
        ))}
      </div>
      {colorLegendOpen && (
        <div className={styles.colorLegendOverlay} onClick={() => setColorLegendOpen(false)}>
          <div className={styles.colorLegendModal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.colorLegendTitle}>Значения цветов</h3>
            <div className={styles.colorLegendGrid}>
              <div>
                <div className={`${styles.colorLegendTag} ${styles.colorLegendUa}`}>Украинец</div>
                <div className={`${styles.colorLegendTag} ${styles.colorLegendSuper}`}>Супер выгодно</div>
                <div className={`${styles.colorLegendTag} ${styles.colorLegendMedium}`}>Средне выгодно</div>
                <div className={`${styles.colorLegendTag} ${styles.colorLegendLast}`}>Последний вариант</div>
              </div>
              <div>
                <div className={`${styles.colorLegendTag} ${styles.colorLegendPriceTop}`}>Моя цена топ</div>
                <div className={`${styles.colorLegendTag} ${styles.colorLegendPriceMid}`}>Моя цена средняя</div>
                <div className={`${styles.colorLegendTag} ${styles.colorLegendPriceNone}`}>Без описания</div>
              </div>
              <div>
                <div className={`${styles.colorLegendTag} ${styles.colorLegendFast}`}>Быстро</div>
                <div className={`${styles.colorLegendTag} ${styles.colorLegendStopped}`}>Перестал трейдиться</div>
                <div className={`${styles.colorLegendTag} ${styles.colorLegendGone}`}>Пропал</div>
                <div className={`${styles.colorLegendTag} ${styles.colorLegendOtherTrades}`}>
                  Есть другие трейды ниже в один столбец (обратить внимание на никнеймы)
                </div>
                <div className={`${styles.colorLegendTag} ${styles.colorLegendBadReviews}`}>Плохие отзывы</div>
                <div className={`${styles.colorLegendTag} ${styles.colorLegendCarry}`}>carry</div>
              </div>
            </div>
          </div>
        </div>
      )}
      <button
        type="button"
        className={`${styles.floatingEditBtn} ${isEditMode ? styles.floatingEditBtnActive : ''}`}
        onClick={toggleEditMode}
        title={isEditMode ? 'Выключить режим редактирования' : 'Режим редактирования'}
        aria-label={isEditMode ? 'Выключить режим редактирования' : 'Режим редактирования'}
      >
        <PencilIcon />
      </button>
    </div>
  );
};

export default TradePage;
