import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { PencilIcon, TrashIcon, PlusIcon, ChevronDownIcon, CrossIcon, BurgerIcon, GearIcon, EyeIcon, EyeOffIcon, FolderMoveIcon } from './icons';
import { getItemStyleClass, getShortItemName } from './itemStyles';
import RatioBubble from './RatioBubble';
import UserModal from './UserModal';
import {
  rearrangeSlotsByOtherTables,
  type RearrangedSlotsResult,
} from './tableNicknameSortUtils';
import styles from './TradePage.module.css';
import tablesRaw from '../temp.txt?raw';

const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '') || 'http://localhost:4000';

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

/** id по нику: u_<нормализованный_ник>, единое правило с бэкендом */
const normalizeNickname = (nickname: string): string => nickname.trim().toLowerCase();
const normalizeNicknameForId = (nickname: string): string =>
  nickname.trim().toLowerCase().replace(/\s+/g, '');
const createUserId = (nickname: string): string => {
  const base = normalizeNicknameForId(nickname);
  return base ? `u_${base}` : `u_${Date.now()}`;
};

/** Схожий ник: один является началом другого (после trim+toLowerCase), но не равны. */
const isSimilarNickname = (a: string, b: string): boolean => {
  const na = (a ?? '').trim().toLowerCase();
  const nb = (b ?? '').trim().toLowerCase();
  if (na === nb) return false;
  return na.length > 0 && nb.length > 0 && (na.startsWith(nb) || nb.startsWith(na));
};

const createSeedNickname = (index: number): string => `test_user_${index + 1}`;

const DEFAULT_USERS: User[] = TABLE_DEFINITIONS.map((_, index) => {
  const nickname = createSeedNickname(index);
  return {
    id: createUserId(nickname),
    nickname,
    discordNickname: '',
    accountLink: '',
    category: 'main',
  };
});

type TableUserSlots = Record<string, Array<UserId | null>>;
type TableUsersByCategory = Record<TradeCategory, TableUserSlots>;
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
  tableUsersByCategory?: TableUsersByCategory;
  ratioOverrides?: RatioOverrides;
  ratioNotes?: RatioNotes;
  ratioColors?: RatioColors;
  userHeaderColors?: UserHeaderColors;
};
type UserPopupType = 'created' | 'exists' | 'linked';
type UserPopupState = { id: number; message: string; type: UserPopupType };

/** Цвета только для блока пользователя (ник, малый блок). */
const HEADER_COLOR_OPTIONS: Array<{ value: ColorTag; title: string }> = [
  { value: 'ua', title: 'Украинец' },
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
  const [tableUsersByCategory, setTableUsersByCategory] = useState<TableUsersByCategory>(() => ({
    main: { ...DEFAULT_TABLE_USERS },
    less: {},
    vacation: {},
    completed: {},
  }));
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
  const [lastCreatedDiscord, setLastCreatedDiscord] = useState('');
  const [lastCreatedAccountLink, setLastCreatedAccountLink] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [collapsedTables, setCollapsedTables] = useState<Record<string, boolean>>({});
  const [categoryMismatchModal, setCategoryMismatchModal] = useState<null | {
    tableTitle: string;
    existingUserId: UserId;
    existingNickname: string;
    existingCategory: TradeCategory;
    existingCategories: TradeCategory[];
    existingLocations: Array<{ tableTitle: string; columnIndex: number }>;
    pendingData: UserFormData;
    initialRatios?: Record<string, string>;
    initialRatioNotes?: Record<string, string>;
    initialRatioColors?: Record<string, string>;
  }>(null);
  const [categoryJumpModal, setCategoryJumpModal] = useState<null | {
    tableTitle: string;
    nickname: string;
    categories: TradeCategory[];
    pendingData: UserFormData;
    initialRatios?: Record<string, string>;
    initialRatioNotes?: Record<string, string>;
    initialRatioColors?: Record<string, string>;
  }>(null);
  const [activeHeaderColorPickerKey, setActiveHeaderColorPickerKey] = useState<string | null>(null);
  const [activeMoveCategoryKey, setActiveMoveCategoryKey] = useState<string | null>(null);
  const [moveCategoryDropdownPosition, setMoveCategoryDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  const [highlightedItem, setHighlightedItem] = useState<string>('');
  const [userCreatePopups, setUserCreatePopups] = useState<UserPopupState[]>([]);
  const [burgerOpen, setBurgerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [maskContent, setMaskContent] = useState(false);
  const [editModeBlockedPopup, setEditModeBlockedPopup] = useState(false);
  const [headerPalettePosition, setHeaderPalettePosition] = useState<{ top: number; left: number } | null>(null);
  const [shortItemNames, setShortItemNames] = useState(false);
  type DeleteColumnOccurrence = { tableTitle: string; columnIndex: number };
  const [deleteColumnModal, setDeleteColumnModal] = useState<{
    tableTitle: string;
    columnIndex: number;
    userId: UserId;
    userNickname: string;
    otherOccurrences: DeleteColumnOccurrence[];
  } | null>(null);
  const [deleteColumnAlsoFrom, setDeleteColumnAlsoFrom] = useState<Set<string>>(new Set());
  const [focusedEditRow, setFocusedEditRow] = useState<{ tableTitle: string; item: string } | null>(null);
  const headerPaletteRef = useRef<HTMLDivElement>(null);
  const moveCategoryDropdownRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
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

  const applySearchFilter = () => {
    const trimmed = searchInput.trim();
    setActiveSearch(trimmed);
  };

  const isTableCollapsed = (tableTitle: string): boolean => !!collapsedTables[tableTitle];
  const toggleTableCollapsed = (tableTitle: string) => {
    setCollapsedTables((prev) => ({ ...prev, [tableTitle]: !prev[tableTitle] }));
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

  const handleRatioNavigate = (
    _e: React.KeyboardEvent,
    direction: 'down' | 'right',
    tableTitle: string,
    item: string,
    userId: UserId,
    tableItems: string[],
    userSlots: Array<UserId | null>,
  ) => {
    const esc = (s: string) => CSS.escape(s);
    if (direction === 'down') {
      const itemIndex = tableItems.indexOf(item);
      const nextIndex = itemIndex + 1;
      if (nextIndex < tableItems.length) {
        const nextItem = tableItems[nextIndex];
        const el = document.querySelector(
          `input[data-ratio-table="${esc(tableTitle)}"][data-ratio-item="${esc(nextItem)}"][data-ratio-user="${esc(userId)}"]`,
        ) as HTMLInputElement | null;
        el?.focus();
      }
    } else {
      const colIndex = userSlots.findIndex((s) => s === userId);
      const nextColIndex = colIndex + 1;
      if (nextColIndex < userSlots.length && userSlots[nextColIndex]) {
        const nextUserId = userSlots[nextColIndex] as UserId;
        const el = document.querySelector(
          `input[data-ratio-table="${esc(tableTitle)}"][data-ratio-item="${esc(item)}"][data-ratio-user="${esc(nextUserId)}"]`,
        ) as HTMLInputElement | null;
        el?.focus();
      }
    }
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
    const dataTrimmed: UserFormData = {
      nickname: (data.nickname ?? '').trim(),
      discordNickname: (data.discordNickname ?? '').trim(),
      accountLink: (data.accountLink ?? '').trim(),
    };
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...dataTrimmed } : u)));
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

  const applyInitialDataForUserInTable = (
    tableTitle: string,
    userId: UserId,
    initialRatios?: Record<string, string>,
    initialRatioNotes?: Record<string, string>,
    initialRatioColors?: Record<string, string>,
  ) => {
    if (initialRatios && Object.keys(initialRatios).length > 0) {
      setRatioOverrides((prev) => ({
        ...prev,
        [tableTitle]: {
          ...(prev[tableTitle] ?? {}),
          [userId]: { ...(prev[tableTitle]?.[userId] ?? {}), ...initialRatios },
        },
      }));
    }
    if (initialRatioNotes && Object.keys(initialRatioNotes).length > 0) {
      setRatioNotes((prev) => ({
        ...prev,
        [tableTitle]: {
          ...(prev[tableTitle] ?? {}),
          [userId]: { ...(prev[tableTitle]?.[userId] ?? {}), ...initialRatioNotes },
        },
      }));
    }
    if (initialRatioColors && Object.keys(initialRatioColors).length > 0) {
      setRatioColors((prev) => ({
        ...prev,
        [tableTitle]: {
          ...(prev[tableTitle] ?? {}),
          [userId]: { ...(prev[tableTitle]?.[userId] ?? {}), ...initialRatioColors },
        },
      }));
    }
  };

  const addUserToTable = (
    tableTitle: string,
    data: UserFormData,
    initialRatios?: Record<string, string>,
    initialRatioNotes?: Record<string, string>,
    initialRatioColors?: Record<string, string>,
    categoryOverride?: TradeCategory,
  ): void | { reason: 'similar_nickname'; similarNickname: string; locations: Array<{ tableTitle: string; columnIndex: number }> } => {
    const targetCategory = categoryOverride ?? activeCategory;
    const targetTables = tableUsersByCategory[targetCategory] ?? {};
    const dataTrimmed: UserFormData = {
      nickname: (data.nickname ?? '').trim(),
      discordNickname: (data.discordNickname ?? '').trim(),
      accountLink: (data.accountLink ?? '').trim(),
    };
    const nicknameLower = (dataTrimmed.nickname ?? '').toLowerCase();
    const existingUser = users.find(
      (u) =>
        (u.nickname ?? '').toLowerCase() === nicknameLower &&
        (u.category ?? 'main') === targetCategory,
    );
    if (!existingUser) {
      const similarUser = users.find(
        (u) =>
          (u.category ?? 'main') === targetCategory &&
          u.nickname !== dataTrimmed.nickname &&
          isSimilarNickname(dataTrimmed.nickname, u.nickname),
      );
      if (similarUser) {
        const locations: Array<{ tableTitle: string; columnIndex: number }> = [];
        orderedTables.forEach((t) => {
          const slots = targetTables[t.title] ?? [];
          slots.forEach((slot, columnIndex) => {
            if (slot === similarUser.id) locations.push({ tableTitle: t.title, columnIndex });
          });
        });
        return {
          reason: 'similar_nickname',
          similarNickname: similarUser.nickname,
          locations,
        };
      }
    }
    const userId = existingUser?.id ?? createUserId(dataTrimmed.nickname);
    const alreadyInCurrentTable = (targetTables[tableTitle] ?? []).includes(userId);

    if (!existingUser) {
      setUsers((prev) => [
        ...prev,
        {
          id: userId,
          nickname: dataTrimmed.nickname,
          discordNickname: dataTrimmed.discordNickname,
          accountLink: dataTrimmed.accountLink,
          category: targetCategory,
        },
      ]);
    } else {
      // Существующий пользователь:
      // - ник обновляем (в т.ч. регистр)
      // - discord/link обновляем ТОЛЬКО если пользователь ввёл их (не пусто),
      //   иначе сохраняем старые значения (не затираем пустыми).
      const resolvedDiscord =
        dataTrimmed.discordNickname.trim() !== ''
          ? dataTrimmed.discordNickname
          : (existingUser.discordNickname ?? '');
      const resolvedAccountLink =
        dataTrimmed.accountLink.trim() !== ''
          ? dataTrimmed.accountLink
          : (existingUser.accountLink ?? '');

      const hasNewData =
        dataTrimmed.nickname !== existingUser.nickname ||
        resolvedDiscord !== (existingUser.discordNickname ?? '') ||
        resolvedAccountLink !== (existingUser.accountLink ?? '');
      if (hasNewData) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === userId
              ? {
                  ...u,
                  nickname: dataTrimmed.nickname,
                  discordNickname: resolvedDiscord,
                  accountLink: resolvedAccountLink,
                }
              : u,
          ),
        );
      }
    }

    setTableUsersByCategory((allPrev) => {
      const prev = allPrev[targetCategory] ?? {};
      const currentSlots = [...(prev[tableTitle] ?? [])];
      if (currentSlots.includes(userId)) return allPrev;

      let targetColumnIndex = -1;

      // 1) Есть ли в других таблицах столбец с этим же пользователем — подставляем в этот столбец (порядок таблиц фиксированный)
      if (existingUser) {
        for (const t of orderedTables) {
          if (t.title === tableTitle) continue;
          const otherSlots = prev[t.title];
          if (!Array.isArray(otherSlots)) continue;
          const indexInOther = otherSlots.indexOf(userId);
          if (indexInOther >= 0) {
            targetColumnIndex = indexInOther;
            break;
          }
        }
      }

      if (targetColumnIndex >= 0) {
        while (currentSlots.length <= targetColumnIndex) {
          currentSlots.push(null);
        }
        if (currentSlots[targetColumnIndex] === null) {
          currentSlots[targetColumnIndex] = userId;
        } else {
          currentSlots.splice(targetColumnIndex, 0, userId);
        }
      } else {
        // 2) Есть ли свободное место (заглушка), где был удалён пользователь или ещё не добавлен
        const firstEmptyIndex = currentSlots.indexOf(null);
        if (firstEmptyIndex >= 0) {
          currentSlots[firstEmptyIndex] = userId;
        } else {
          // 3) Вставляем в конец таблицы
          currentSlots.push(userId);
        }
      }

      return {
        ...allPrev,
        [targetCategory]: {
          ...prev,
          [tableTitle]: currentSlots,
        },
      };
    });

    if (initialRatios && Object.keys(initialRatios).length > 0) {
      setRatioOverrides((prev) => ({
        ...prev,
        [tableTitle]: {
          ...(prev[tableTitle] ?? {}),
          [userId]: { ...(prev[tableTitle]?.[userId] ?? {}), ...initialRatios },
        },
      }));
    }
    if (initialRatioNotes && Object.keys(initialRatioNotes).length > 0) {
      setRatioNotes((prev) => ({
        ...prev,
        [tableTitle]: {
          ...(prev[tableTitle] ?? {}),
          [userId]: { ...(prev[tableTitle]?.[userId] ?? {}), ...initialRatioNotes },
        },
      }));
    }
    if (initialRatioColors && Object.keys(initialRatioColors).length > 0) {
      setRatioColors((prev) => ({
        ...prev,
        [tableTitle]: {
          ...(prev[tableTitle] ?? {}),
          [userId]: { ...(prev[tableTitle]?.[userId] ?? {}), ...initialRatioColors },
        },
      }));
    }

    // Если пользователь уже существовал и для него где-то задан цвет хедера,
    // применяем этот же цвет к новому столбцу (фон никнейма).
    if (existingUser) {
      let inheritedHeaderColor: ColorTag = '';
      for (const [otherTableTitle, colorsByUser] of Object.entries(userHeaderColors)) {
        if (otherTableTitle === tableTitle) continue;
        const tag = normalizeColorTag(colorsByUser?.[userId]);
        if (tag) {
          inheritedHeaderColor = tag;
          break;
        }
      }
      if (inheritedHeaderColor && !normalizeColorTag(userHeaderColors[tableTitle]?.[userId])) {
        setUserHeaderColors((prev) => ({
          ...prev,
          [tableTitle]: {
            ...(prev[tableTitle] ?? {}),
            [userId]: inheritedHeaderColor,
          },
        }));
      }
    }

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

  const getUserLocations = (
    userId: UserId,
    category: TradeCategory,
  ): Array<{ tableTitle: string; columnIndex: number }> => {
    const tables = tableUsersByCategory[category] ?? {};
    const result: Array<{ tableTitle: string; columnIndex: number }> = [];
    for (const t of orderedTables) {
      const slots = tables[t.title] ?? [];
      slots.forEach((id, columnIndex) => {
        if (id === userId) result.push({ tableTitle: t.title, columnIndex });
      });
    }
    return result;
  };

  const moveUserToCategoryTailFromAllCategories = (userId: UserId, targetCategory: TradeCategory) => {
    setTableUsersByCategory((allPrev) => {
      const titles = orderedTables.map((t) => t.title);

      // 1) Удаляем userId из всех категорий (везде ставим null)
      const cleared: TableUsersByCategory = { ...allPrev };
      (Object.keys(cleared) as TradeCategory[]).forEach((cat) => {
        const tables = { ...(cleared[cat] ?? {}) };
        titles.forEach((title) => {
          const slots = Array.isArray(tables[title]) ? [...tables[title]] : [];
          let changed = false;
          for (let i = 0; i < slots.length; i += 1) {
            if (slots[i] === userId) {
              slots[i] = null;
              changed = true;
            }
          }
          if (changed) tables[title] = slots;
        });
        cleared[cat] = tables;
      });

      // 2) Вставляем в targetCategory в "хвостовой" столбец: первый полностью пустой, иначе новый справа.
      const targetTables = { ...(cleared[targetCategory] ?? {}) };
      const maxLen = titles.reduce((m, t) => Math.max(m, (targetTables[t] ?? []).length), 0);

      const isColumnFullyEmpty = (col: number): boolean =>
        titles.every((t) => {
          const slots = targetTables[t] ?? [];
          const v = slots[col];
          return v == null || v === '';
        });

      let targetCol = -1;
      for (let c = 0; c < maxLen; c += 1) {
        if (isColumnFullyEmpty(c)) {
          targetCol = c;
          break;
        }
      }
      if (targetCol < 0) targetCol = maxLen;

      titles.forEach((t) => {
        const slots = Array.isArray(targetTables[t]) ? [...targetTables[t]] : [];
        while (slots.length <= targetCol) slots.push(null);
        slots[targetCol] = userId;
        targetTables[t] = slots;
      });

      cleared[targetCategory] = targetTables;
      return cleared;
    });
  };

  const moveUserColumn = (
    tableTitle: string,
    columnIndex: number,
    direction: 'left' | 'right',
  ) => {
    setActiveTableUsers((prev) => {
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

  const clearUserRatioDataInTable = (tableTitle: string, userId: UserId) => {
    setRatioOverrides((prev) => {
      const next = { ...prev };
      const byTable = next[tableTitle];
      if (byTable && byTable[userId]) {
        const rest = { ...byTable };
        delete rest[userId];
        if (Object.keys(rest).length > 0) next[tableTitle] = rest;
        else delete next[tableTitle];
      }
      return next;
    });
    setRatioNotes((prev) => {
      const next = { ...prev };
      const byTable = next[tableTitle];
      if (byTable && byTable[userId]) {
        const rest = { ...byTable };
        delete rest[userId];
        if (Object.keys(rest).length > 0) next[tableTitle] = rest;
        else delete next[tableTitle];
      }
      return next;
    });
    setRatioColors((prev) => {
      const next = { ...prev };
      const byTable = next[tableTitle];
      if (byTable && byTable[userId]) {
        const rest = { ...byTable };
        delete rest[userId];
        if (Object.keys(rest).length > 0) next[tableTitle] = rest;
        else delete next[tableTitle];
      }
      return next;
    });
    setUserHeaderColors((prev) => {
      const next = { ...prev };
      const byTable = next[tableTitle];
      if (byTable && byTable[userId] !== undefined) {
        const rest = { ...byTable };
        delete rest[userId];
        if (Object.keys(rest).length > 0) next[tableTitle] = rest;
        else delete next[tableTitle];
      }
      return next;
    });
  };

  const removeUserColumn = (tableTitle: string, columnIndex: number, userId?: UserId) => {
    setActiveTableUsers((prev) => {
      const slots = [...(prev[tableTitle] ?? [])];
      if (columnIndex < 0 || columnIndex >= slots.length) return prev;
      slots[columnIndex] = null;
      return {
        ...prev,
        [tableTitle]: slots,
      };
    });
    if (userId) clearUserRatioDataInTable(tableTitle, userId);
  };

  const getOtherOccurrencesOfUser = (
    userId: UserId,
    excludeTableTitle: string,
    excludeColumnIndex: number,
  ): DeleteColumnOccurrence[] => {
    const list: DeleteColumnOccurrence[] = [];
    Object.entries(activeTableUsers).forEach(([tTitle, slots]) => {
      if (!Array.isArray(slots)) return;
      slots.forEach((slot, idx) => {
        if (slot === userId && (tTitle !== excludeTableTitle || idx !== excludeColumnIndex)) {
          list.push({ tableTitle: tTitle, columnIndex: idx });
        }
      });
    });
    return list;
  };

  const occurrenceKey = (o: DeleteColumnOccurrence) => `${o.tableTitle}:${o.columnIndex}`;

  const openDeleteColumnModal = (
    tableTitle: string,
    columnIndex: number,
    userNickname: string,
  ) => {
    const slots = activeTableUsers[tableTitle] ?? [];
    const userId = (columnIndex >= 0 && columnIndex < slots.length ? slots[columnIndex] : null) as UserId | null;
    if (!userId) return;
    const otherOccurrences = getOtherOccurrencesOfUser(userId, tableTitle, columnIndex);
    setDeleteColumnModal({
      tableTitle,
      columnIndex,
      userId,
      userNickname,
      otherOccurrences,
    });
    setDeleteColumnAlsoFrom(new Set());
  };

  const applyDeleteColumn = (alsoFromKeys: Set<string>) => {
    if (!deleteColumnModal) return;
    const { tableTitle, columnIndex, userId: mainUserId } = deleteColumnModal;
    const toRemove: Array<{ tableTitle: string; columnIndex: number; userId: UserId }> = [
      { tableTitle, columnIndex, userId: mainUserId },
    ];
    alsoFromKeys.forEach((key) => {
      const [t, c] = key.split(':');
      const colIdx = parseInt(c, 10);
      if (t && !Number.isNaN(colIdx)) {
        const uid = (activeTableUsers[t] ?? [])[colIdx];
        if (uid) toRemove.push({ tableTitle: t, columnIndex: colIdx, userId: uid });
      }
    });
    toRemove.forEach(({ tableTitle: t, columnIndex: colIdx, userId: uid }) => {
      removeUserColumn(t, colIdx, uid);
    });
    setDeleteColumnModal(null);
    setDeleteColumnAlsoFrom(new Set());
  };

  const enabledItems = new Set(items);
  const customItems = items.filter((item) => !TEMPLATE_ITEMS.includes(item));

  const getTableItems = (table: TradeTable): string[] => {
    const baseItems = table.items.filter((item) => enabledItems.has(item));
    const allItems = [...baseItems, ...customItems];

    if (!activeSearch) return allItems;

    const q = activeSearch.toLowerCase();
    const titleMatches = table.title.toLowerCase().includes(q);
    if (titleMatches) return allItems;

    return allItems.filter((item) => item.toLowerCase().includes(q));
  };

  const selectedTable =
    selectedTableName === ''
      ? null
      : orderedTables.find((table) => table.title === selectedTableName) ?? null;

  const activeTableUsers = tableUsersByCategory[activeCategory] ?? {};

  const setActiveTableUsers = (updater: (prev: TableUserSlots) => TableUserSlots) => {
    setTableUsersByCategory((prev) => ({
      ...prev,
      [activeCategory]: updater(prev[activeCategory] ?? {}),
    }));
  };

  const getUserSlotsForTable = (tableTitle: string): Array<UserId | null> =>
    activeTableUsers[tableTitle] ?? [];

  const getVisibleUserSlotsForTable = (tableTitle: string): Array<UserId | null> => {
    const baseSlots = getUserSlotsForTable(tableTitle);
    const tableDef = orderedTables.find((t) => t.title === tableTitle) ?? null;
    const tableItemsForFilter = tableDef ? getTableItems(tableDef) : [];

    return baseSlots.map((slot) => {
      if (!slot) return null;
      const user = usersById[slot];
      if (!user) return null;
      if ((user.category ?? 'main') !== activeCategory) return null;

      // Если включён поиск, и у пользователя по всем видимым пунктам пустые инпуты — скрываем его.
      // В категориях "Отпуск/Завершено" пользователи могут не иметь заполненных значений,
      // но должны оставаться видимыми.
      if (activeSearch && tableItemsForFilter.length > 0 && activeCategory !== 'vacation' && activeCategory !== 'completed') {
        const hasAnyValue = tableItemsForFilter.some((item) => {
          const v = getRatio(tableTitle, user.id, item);
          return (v ?? '').trim() !== '';
        });
        if (!hasAnyValue) return null;
      }

      return slot;
    });
  };

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
    (activeTableUsers[table.title] ?? []).forEach((id) => {
      if (!id) return;
      acc[id] = (acc[id] ?? 0) + 1;
    });
    return acc;
  }, {});
  const linkedUserLocations: Record<UserId, Array<{ tableTitle: string; columnIndex: number }>> = {};
  orderedTables.forEach((t) => {
    (activeTableUsers[t.title] ?? []).forEach((id, columnIndex) => {
      if (!id) return;
      if (!linkedUserLocations[id]) linkedUserLocations[id] = [];
      linkedUserLocations[id].push({ tableTitle: t.title, columnIndex });
    });
  });
  const linkedByNicknameLocations: Record<string, Array<{ tableTitle: string; columnIndex: number }>> = {};
  orderedTables.forEach((t) => {
    (activeTableUsers[t.title] ?? []).forEach((id, columnIndex) => {
      if (!id) return;
      const user = usersById[id];
      if (!user) return;
      const normNick = normalizeNickname(user.nickname);
      if (!linkedByNicknameLocations[normNick]) linkedByNicknameLocations[normNick] = [];
      linkedByNicknameLocations[normNick].push({ tableTitle: t.title, columnIndex });
    });
  });
  const maxUserColumns = orderedTables.reduce(
    (max, table) => Math.max(max, (activeTableUsers[table.title] ?? []).length),
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
        const response = await fetch(`${API_BASE}/api/trade-table-users`);
        if (!response.ok) {
          setUsers([...DEFAULT_USERS]);
          setTableUsersByCategory({
            main: { ...DEFAULT_TABLE_USERS },
            less: {},
            vacation: {},
            completed: {},
          });
          hasLoadedDbRef.current = true;
          return;
        }
        const payload = (await response.json()) as TradeUsersApiPayload;
        const dbUsers = Array.isArray(payload.users)
          ? payload.users.map((u) => ({
              ...u,
              category: u.category ?? 'main',
              discordNickname: u.discordNickname ?? '',
              accountLink: u.accountLink ?? '',
            }))
          : [];
        const dbTableUsersByCategory =
          payload.tableUsersByCategory && typeof payload.tableUsersByCategory === 'object'
            ? (payload.tableUsersByCategory as TableUsersByCategory)
            : null;
        const dbTableUsers =
          payload.tableUsers && typeof payload.tableUsers === 'object' ? payload.tableUsers : {};
        const hasUsersInDb = dbUsers.length > 0;
        const hasUserSlotsInDb = dbTableUsersByCategory
          ? Object.values(dbTableUsersByCategory).some((tables) =>
              Object.values(tables ?? {}).some(
                (slots) => Array.isArray(slots) && slots.some((slot) => slot !== null && slot !== ''),
              ),
            )
          : Object.values(dbTableUsers).some(
              (slots) => Array.isArray(slots) && slots.some((slot) => slot !== null && slot !== ''),
            );

        if (!hasUsersInDb || !hasUserSlotsInDb) {
          setUsers([...DEFAULT_USERS]);
          setTableUsersByCategory({
            main: { ...DEFAULT_TABLE_USERS },
            less: {},
            vacation: {},
            completed: {},
          });
          hasLoadedDbRef.current = true;
          return;
        }

        const mergedTableUsersByCategory: TableUsersByCategory = dbTableUsersByCategory
          ? {
              main: { ...DEFAULT_TABLE_USERS, ...(dbTableUsersByCategory.main ?? {}) },
              less: { ...(dbTableUsersByCategory.less ?? {}) },
              vacation: { ...(dbTableUsersByCategory.vacation ?? {}) },
              completed: { ...(dbTableUsersByCategory.completed ?? {}) },
            }
          : {
              main: { ...DEFAULT_TABLE_USERS, ...(dbTableUsers as TableUserSlots) },
              less: {},
              vacation: {},
              completed: {},
            };
        const defaultUserIdsToAdd = new Set<UserId>();
        TABLE_DEFINITIONS.forEach((table) => {
          const title = table.title;
          const slots = mergedTableUsersByCategory.main[title] ?? [];
          const hasAny = slots.some((s) => s !== null && s !== '');
          if (!hasAny && DEFAULT_TABLE_USERS[title]?.length) {
            mergedTableUsersByCategory.main[title] = [...DEFAULT_TABLE_USERS[title]];
            DEFAULT_TABLE_USERS[title].forEach((id) => id && defaultUserIdsToAdd.add(id));
          }
        });
        const usersToSet = [...dbUsers];
        defaultUserIdsToAdd.forEach((id) => {
          if (!usersToSet.some((u) => u.id === id)) {
            const defUser = DEFAULT_USERS.find((u) => u.id === id);
            if (defUser) usersToSet.push(defUser);
          }
        });

        setUsers(usersToSet);
        setTableUsersByCategory(mergedTableUsersByCategory);
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
        setUsers([...DEFAULT_USERS]);
        setTableUsersByCategory({
          main: { ...DEFAULT_TABLE_USERS },
          less: {},
          vacation: {},
          completed: {},
        });
        hasLoadedDbRef.current = true;
      }
    };

    void loadInitialUsersFromLocalDb();
  }, []);

  // Удалить из users тех, кто не числится ни в одном столбце ни в одной таблице (после удаления столбца)
  useEffect(() => {
    if (!hasLoadedDbRef.current) return;
    const idsInTables = new Set<UserId>();
    Object.values(tableUsersByCategory).forEach((tables) => {
      Object.values(tables ?? {}).forEach((slots) => {
        if (!Array.isArray(slots)) return;
        slots.forEach((slot) => {
          if (slot != null && slot !== '') idsInTables.add(slot);
        });
      });
    });
    const t = window.setTimeout(() => {
      setUsers((prev) => {
        const next = prev.filter((u) => idsInTables.has(u.id));
        return next.length === prev.length ? prev : next;
      });
    }, 0);
    return () => window.clearTimeout(t);
  }, [tableUsersByCategory]);

  useEffect(() => {
    if (!hasLoadedDbRef.current) return;

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      void fetch(`${API_BASE}/api/trade-table-users`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          users,
          tableUsersByCategory,
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
  }, [users, tableUsersByCategory, ratioOverrides, ratioNotes, ratioColors, userHeaderColors]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (addPopupOpen && popupRef.current && !popupRef.current.contains(target)) {
        setAddPopupOpen(false);
      }
      if (selectOpen && editingItemIndex === null && selectDropdownRef.current && !selectDropdownRef.current.contains(target)) {
        setSelectOpen(false);
      }
      if (activeHeaderColorPickerKey && headerPaletteRef.current && !headerPaletteRef.current.contains(target)) {
        if (!(e.target as Element).closest('[data-header-picker]')) {
          setActiveHeaderColorPickerKey(null);
          setHeaderPalettePosition(null);
        }
      }
      if (activeMoveCategoryKey && moveCategoryDropdownRef.current && !moveCategoryDropdownRef.current.contains(target)) {
        if (!(e.target as Element).closest('[data-move-category]')) {
          setActiveMoveCategoryKey(null);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [addPopupOpen, selectOpen, editingItemIndex, activeHeaderColorPickerKey, activeMoveCategoryKey]);

  const toggleEditMode = () => {
    const nextMode = !isEditMode;
    if (nextMode && selectedTableName !== '') {
      setEditModeBlockedPopup(true);
      return;
    }
    setIsEditMode(nextMode);
    if (!nextMode) {
      setActiveHeaderColorPickerKey(null);
      setHeaderPalettePosition(null);
      setActiveMoveCategoryKey(null);
    }
  };

  const handleRootScroll = () => {
    const el = rootRef.current;
    if (!el) return;
    setShortItemNames(el.scrollLeft > 30);
  };

  return (
    <div
      ref={rootRef}
      className={`${styles.root} ${shortItemNames ? styles.shortItemNames : ''}`}
      style={{ zoom: uiScale }}
      onScroll={handleRootScroll}
    >
      <div className={styles.headerBar}>
      <div className={styles.categoryTabs}>
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`${styles.categoryTabBtn} ${activeCategory === tab.key ? styles.categoryTabBtnActive : ''}`}
            onClick={() => setActiveCategory(tab.key)}
          >
            {tab.label.slice(0, 6)}
          </button>
        ))}
      </div>
        
        <button
          type="button"
          className={styles.maskContentBtn}
          onClick={() => setMaskContent((v) => !v)}
          title={maskContent ? 'Показать никнеймы и соотношения' : 'Скрыть никнеймы и соотношения'}
          aria-label={maskContent ? 'Показать контент' : 'Скрыть контент'}
        >
          {maskContent ? <EyeOffIcon /> : <EyeIcon />}
        </button>
        <button
          type="button"
          className={styles.burgerBtn}
          onClick={() => setBurgerOpen(true)}
          aria-label="Открыть меню"
        >
          <BurgerIcon />
        </button>
      </div>

      

      {burgerOpen && (
        <>
          <div
            className={styles.burgerBackdrop}
            onClick={() => setBurgerOpen(false)}
            aria-hidden
          />
          <div className={styles.burgerPanel} role="dialog" aria-label="Меню">
            <div className={styles.burgerPanelHeader}>
              <span className={styles.burgerPanelTitle}>Навигация и настройки</span>
              <button
                type="button"
                className={styles.burgerCloseBtn}
                onClick={() => setBurgerOpen(false)}
                aria-label="Закрыть меню"
              >
                <CrossIcon />
              </button>
            </div>
            <div className={styles.burgerContent}>
              <section className={styles.burgerSection}>
                <Link to="/" className={styles.linkToTrade} onClick={() => setBurgerOpen(false)}>
                  ← На главную
                </Link>
              </section>
              <section className={styles.burgerSection}>
                <span className={styles.burgerSectionLabel}>Категории</span>
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
                </div>
              </section>
              <section className={styles.burgerSection}>
                <span className={styles.burgerSectionLabel}>Инфо и настройки</span>
                <div className={styles.burgerInfoSettingsRow}>
                  <button
                    type="button"
                    className={styles.infoBtnLarge}
                    onClick={() => {
                      setColorLegendOpen(true);
                      setBurgerOpen(false);
                    }}
                    title="Информация по цветам"
                    aria-label="Информация по цветам"
                  >
                    i
                  </button>
                  <button
                    type="button"
                    className={styles.settingsGearBtn}
                    onClick={() => {
                      setSettingsOpen(true);
                      setBurgerOpen(false);
                    }}
                    title="Настройки"
                    aria-label="Настройки"
                  >
                    <GearIcon />
                  </button>
                </div>
              </section>
            </div>
          </div>
        </>
      )}

      {settingsOpen && (
        <div className={styles.settingsOverlay} onClick={() => setSettingsOpen(false)}>
          <div className={styles.settingsModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.settingsModalHeader}>
              <h3 className={styles.settingsModalTitle}>Настройки</h3>
              <button
                type="button"
                className={styles.burgerCloseBtn}
                onClick={() => setSettingsOpen(false)}
                aria-label="Закрыть"
              >
                <CrossIcon />
              </button>
            </div>
            <div className={styles.settingsModalBody}>
              <label className={styles.settingsLabel}>Размер интерфейса</label>
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
        </div>
      )}

      <div className={styles.mainLayout}>
        <div className={styles.filtersRow}>
          <section className={styles.giveSection}>
          <label className={styles.label} htmlFor="give-select">
            Я даю test
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

          <section className={styles.giveSection}>
          <label className={styles.label} htmlFor="search-input">
            Поиск
          </label>
          <div className={styles.selectWithPopup}>
            <div className={styles.addRow}>
              <input
                id="search-input"
                type="text"
                className={styles.addInput}
                placeholder="Поиск по названию / предмету"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') applySearchFilter();
                }}
              />
              <button
                type="button"
                className={styles.btn}
                onClick={applySearchFilter}
              >
                Найти
              </button>
            </div>
          </div>
          </section>
        </div>

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
                            {!isEditMode && (
                              <div className={styles.tableHeaderActionsBlock}>
                                <button
                                  type="button"
                                  className={`${styles.collapseTableBtn} ${isTableCollapsed(table.title) ? styles.collapseTableBtnCollapsed : ''}`}
                                  onClick={() => toggleTableCollapsed(table.title)}
                                  title={isTableCollapsed(table.title) ? 'Развернуть список предметов' : 'Свернуть список предметов'}
                                  aria-label={isTableCollapsed(table.title) ? 'Развернуть таблицу' : 'Свернуть таблицу'}
                                >
                                  <ChevronDownIcon />
                                </button>

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
                            )}
                            {isEditMode &&
                              (table.title === 'Carinite (Pure)' ||
                                table.title === 'RCMBNT' ||
                                table.title === 'Valakkar fangs (APEX)' ||
                                table.title === 'DCHS-05 Comp-Board' ||
                                table.title === 'Polaris Bits' ||
                                table.title === 'APEX Pearl (Grade AAA) 🫧' ||
                                table.title === 'Wikelo Favor' ||
                                table.title === 'UEE 6th (Pristine) 🎖️' ||
                                table.title === 'Ace Helmet 🪖' ||
                                table.title === 'ASD Drive' ||
                                (activeCategory === 'vacation' && table.title === 'Polaris Bits') ||
                                (activeCategory === 'main' && table.title === 'Ace Helmet 🪖') ||
                                (activeCategory === 'less' && table.title === 'Valakkar fangs (APEX)') ||
                                (activeCategory === 'less' && table.title === 'Wikelo Favor') ||
                                (activeCategory === 'less' && table.title === 'RCMBNT')) && (
                              <button
                                type="button"
                                className={styles.sortNamesBtn}
                                onClick={() => {
                                  const slots = activeTableUsers[table.title] ?? [];
                                  const orderedTitles = orderedTables.map((t) => t.title);
                                  const { newSlots, movedToTail }: RearrangedSlotsResult = rearrangeSlotsByOtherTables(
                                    table.title,
                                    slots,
                                    activeTableUsers,
                                    orderedTitles,
                                    usersById,
                                  );
                                  const same =
                                    newSlots.length === slots.length &&
                                    newSlots.every((v, i) => v === slots[i]);
                                  if (same) {
                                    window.alert('Изменений не требуется: столбцы уже совпадают с другими таблицами.');
                                    return;
                                  }
                                  setActiveTableUsers((prev) => {
                                    const next: TableUserSlots = {};
                                    const targetLength = newSlots.length;

                                    // 1) Выравниваем длину всех таблиц по целевому количеству столбцов.
                                    Object.entries(prev).forEach(([tTitle, tSlots]) => {
                                      const arr = [...(tSlots ?? [])];
                                      while (arr.length < targetLength) {
                                        arr.push(null);
                                      }
                                      next[tTitle] = arr;
                                    });

                                    // 2) Обновляем текущую таблицу на результат сортировки.
                                    next[table.title] = newSlots;

                                    // 3) Переносим в конец все "хвостовые" userId во всех таблицах.
                                    movedToTail.forEach(({ userId, columnIndex }) => {
                                      Object.entries(next).forEach(([tTitle, tSlots]) => {
                                        const arr = [...tSlots];
                                        const currentIndex = arr.indexOf(userId);
                                        if (currentIndex === -1) return;
                                        if (currentIndex === columnIndex) return;

                                        // Освобождаем старое место.
                                        arr[currentIndex] = null;

                                        // Если в целевом столбце уже кто‑то есть, не трогаем (чтобы не ломать другие цепочки).
                                        if (arr[columnIndex] == null) {
                                          arr[columnIndex] = userId;
                                        }

                                        next[tTitle] = arr;
                                      });
                                    });

                                    return next;
                                  });
                                  window.alert('Столбцы переставлены по совпадению с другими таблицами.');
                                }}
                                title="Переставить столбцы по индексам из других таблиц (тот же пользователь/ник)"
                              >
                                Сортировка имён
                              </button>
                            )}
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
                                const normalizedNickname = normalizeNickname(user.nickname);
                                const linkedCountByNick = linkedByNicknameLocations[normalizedNickname]?.length ?? 0;
                                const sameNickRepeatCount =
                                  columnNicknameCount[columnIndex]?.[normalizedNickname] ?? 0;
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
                                const shouldApplyBlue = linkedCountByNick > 1 || duplicateInSameColumn;
                                const linkedClass = shouldApplyBlue
                                  ? `${styles.nicknameLinked} ${shadeClass}`
                                  : '';
                                if (shouldApplyBlue) {
                                  // раньше тут были отладочные логи (locationsByNick, isFirstOccurrence)
                                  // if (linkedCountByNick > 1 && isFirstOccurrence) {
                                  //   const locationsStr = locationsByNick
                                  //     .map((loc) => `«${loc.tableTitle}», столбец №${loc.columnIndex + 1}`)
                                  //     .join('; ');
                                  //   console.log(
                                  //     '[TradePage синий фон]',
                                  //     `Ник "${user.nickname}" (id: ${user.id}): один и тот же ник в нескольких таблицах/столбцах —`,
                                  //     locationsStr,
                                  //   );
                                  // } else if (duplicateInSameColumn) {
                                  //   console.log(
                                  //     '[TradePage синий фон]',
                                  //     `Пользователь "${user.nickname}" (id: ${user.id}): дубликат ника в этом столбце — таблица «${table.title}», столбец №${columnIndex + 1}`,
                                  //   );
                                  // }
                                }
                                const headerColorTag = getUserHeaderColorTag(table.title, user.id);
                                const headerColorClass = getHeaderColorClass(headerColorTag);
                                const pickerKey = `${table.title}::${user.id}`;
                                // const isHeaderColorPickerOpen = activeHeaderColorPickerKey === pickerKey;
                                const openHeaderPaletteAbove = (el: HTMLElement) => {
                                  const rect = el.getBoundingClientRect();
                                  const w = 220;
                                  const h = 36;
                                  setHeaderPalettePosition({
                                    left: Math.max(8, Math.min(rect.left + rect.width / 2 - w / 2, window.innerWidth - w - 8)),
                                    top: Math.max(8, rect.top - h - 2),
                                  });
                                  setActiveHeaderColorPickerKey(pickerKey);
                                };
                                return (
                                  <div
                                    className={`${styles.userHeaderPanel} ${
                                      headerColorClass ? styles[headerColorClass] : ''
                                    }`}
                                    onContextMenu={isEditMode ? (e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      openHeaderPaletteAbove(e.currentTarget as HTMLElement);
                                    } : undefined}
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
                                          {maskContent ? '**' : user.nickname}
                                        </a>
                                      ) : (
                                        <span
                                          className={`${styles.nickname} ${linkedClass}`}
                                          title={maskContent ? undefined : [
                                            `Ник: ${user.nickname}`,
                                            user.discordNickname && `Discord: ${user.discordNickname}`,
                                          ]
                                            .filter(Boolean)
                                            .join('\n')}
                                        >
                                          {maskContent ? '**' : user.nickname}
                                        </span>
                                      )}
                                    </div>
                                    {isEditMode ? (
                                      <div className={styles.userHeaderTools}>
                                        <div data-move-category className={styles.moveCategoryWrap}>
                                          <button
                                            type="button"
                                            className={styles.moveCategoryBtn}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                              if (activeMoveCategoryKey === pickerKey) {
                                                setActiveMoveCategoryKey(null);
                                                setMoveCategoryDropdownPosition(null);
                                              } else {
                                                setMoveCategoryDropdownPosition({
                                                  left: Math.max(8, Math.min(rect.left, window.innerWidth - 220)),
                                                  top: rect.bottom + 4,
                                                });
                                                setActiveMoveCategoryKey(pickerKey);
                                              }
                                            }}
                                            title="Перенести в другую категорию"
                                            aria-label="Перенести в другую категорию"
                                          >
                                            <FolderMoveIcon />
                                          </button>
                                        </div>
                                        <button
                                          type="button"
                                          className={styles.columnDeleteBtn}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openDeleteColumnModal(table.title, columnIndex, user.nickname);
                                          }}
                                          title="Удалить этот столбец"
                                          aria-label="Удалить этот столбец"
                                        >
                                          <CrossIcon />
                                        </button>
                                      </div>
                                    ) : (
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
                                          title="Редактировать / переименовать"
                                        >
                                          <PencilIcon />
                                        </button>
                                        <div className={styles.userHeaderToolsSpacer} />
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    {!isTableCollapsed(table.title) && (
                      <tbody>
                        {tableItems.map((item) => {
                        const isFocusedEditRow =
                          focusedEditRow?.tableTitle === table.title && focusedEditRow?.item === item;
                        return (
                        <tr
                          key={`${table.title}-${item}`}
                          className={`${highlightedItem === item ? styles.highlightedItemRow : ''} ${isFocusedEditRow ? styles.focusedEditRow : ''}`.trim()}
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
                              <span className={styles.itemNameFull}>{item}</span>
                              <span className={styles.itemNameShort}>{getShortItemName(item)}</span>
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
                                  maskContent={maskContent}
                                  dataTableTitle={table.title}
                                  dataItem={item}
                                  dataUserId={user.id}
                                  onRatioNavigate={(e, dir) =>
                                    handleRatioNavigate(e, dir, table.title, item, user.id, tableItems, userSlots)
                                  }
                                  onRowFocus={() =>
                                    isEditMode && setFocusedEditRow({ tableTitle: table.title, item })
                                  }
                                  onRowBlur={() => setFocusedEditRow(null)}
                                />
                              </td>
                            );
                          })}
                        </tr>
                        );
                        })}
                      </tbody>
                    )}
                  </table>
                </div>
              </div>
            );
          })}
        </section>
      </div>

      {userModalOpen && (
        <UserModal
          key={`${editingUserId ?? 'new'}-${activeTableForUserModal ?? ''}`}
          user={editingUserId ? users.find((u) => u.id === editingUserId) ?? null : null}
          tableContext={
            activeTableForUserModal
              ? {
                  tableTitle: activeTableForUserModal,
                  items:
                    orderedTables.find((t) => t.title === activeTableForUserModal)?.items ?? [],
                }
              : null
          }
          defaultDiscordNickname={!editingUserId ? lastCreatedDiscord : undefined}
          defaultAccountLink={!editingUserId ? lastCreatedAccountLink : undefined}
          onSave={(data, initialRatios, initialRatioNotes, initialRatioColors) => {
            if (editingUserId) {
              updateUser(editingUserId, data);
            } else {
              const tableTitle =
                activeTableForUserModal ||
                selectedTableName ||
                TABLE_DEFINITIONS[0]?.title ||
                '';
              if (!tableTitle) return;

              const nicknameLower = (data.nickname ?? '').trim().toLowerCase();
              const matchesInOtherCategories = users.filter(
                (u) =>
                  (u.nickname ?? '').trim().toLowerCase() === nicknameLower &&
                  (u.category ?? 'main') !== activeCategory,
              );
              const existingInOtherCategory = matchesInOtherCategories[0] ?? null;
              if (existingInOtherCategory) {
                const existingCategories = Array.from(
                  new Set(
                    matchesInOtherCategories.map(
                      (u) => (u.category ?? 'main') as TradeCategory,
                    ),
                  ),
                );
                const existingCategory =
                  existingCategories[0] ??
                  ((existingInOtherCategory.category ?? 'main') as TradeCategory);
                setCategoryMismatchModal({
                  tableTitle,
                  existingUserId: existingInOtherCategory.id,
                  existingNickname: existingInOtherCategory.nickname,
                  existingCategory,
                  existingCategories,
                  existingLocations: getUserLocations(existingInOtherCategory.id, existingCategory),
                  pendingData: data,
                  initialRatios,
                  initialRatioNotes,
                  initialRatioColors,
                });
                return false;
              }

              const result = addUserToTable(
                tableTitle,
                data,
                initialRatios,
                initialRatioNotes,
                initialRatioColors,
              );
              if (result && result.reason === 'similar_nickname') {
                const locationsStr =
                  result.locations.length > 0
                    ? result.locations
                        .map((loc) => `«${loc.tableTitle}», столбец №${loc.columnIndex + 1}`)
                        .join('; ')
                    : '—';
                window.alert(
                  `Есть никнейм со схожей структурой: «${result.similarNickname}». Создать такого пользователя нельзя.\n\nСхожий ник уже есть: ${locationsStr}\n\nИзмените ник или выберите существующего.`,
                );
                return false;
              }
              setLastCreatedDiscord(data.discordNickname ?? '');
              setLastCreatedAccountLink(data.accountLink ?? '');
            }
          }}
          onClose={() => {
            setUserModalOpen(false);
            setEditingUserId(null);
            setActiveTableForUserModal(null);
          }}
        />
      )}

      {deleteColumnModal && (
        <div
          className={styles.deleteColumnOverlay}
          onClick={() => {
            setDeleteColumnModal(null);
            setDeleteColumnAlsoFrom(new Set());
          }}
          role="presentation"
        >
          <div
            className={styles.deleteColumnModal}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="delete-column-title"
          >
            <h2 id="delete-column-title" className={styles.deleteColumnTitle}>
              Удалить пользователя из таблицы
            </h2>
            <p className={styles.deleteColumnInfo}>
              <strong>Таблица:</strong> {deleteColumnModal.tableTitle}
              <br />
              <strong>Столбец:</strong> №{deleteColumnModal.columnIndex + 1}
              <br />
              <strong>Пользователь:</strong> {deleteColumnModal.userNickname}
            </p>
            {deleteColumnModal.otherOccurrences.length > 0 ? (
              <div className={styles.deleteColumnOthers}>
                <p className={styles.deleteColumnOthersTitle}>
                  Этот пользователь также есть в других таблицах. Удалить и из этих столбцов?
                </p>
                <ul className={styles.deleteColumnOthersList}>
                  {deleteColumnModal.otherOccurrences.map((occ) => {
                    const key = occurrenceKey(occ);
                    const checked = deleteColumnAlsoFrom.has(key);
                    return (
                      <li key={key} className={styles.deleteColumnOthersItem}>
                        <label>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setDeleteColumnAlsoFrom((prev) => {
                                const next = new Set(prev);
                                if (next.has(key)) next.delete(key);
                                else next.add(key);
                                return next;
                              });
                            }}
                          />
                          <span>
                            Таблица «{occ.tableTitle}», столбец №{occ.columnIndex + 1}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <p className={styles.deleteColumnNoOthers}>В других таблицах этот пользователь не встречается.</p>
            )}
            <div className={styles.deleteColumnActions}>
              <button
                type="button"
                className={styles.deleteColumnBtnSecondary}
                onClick={() => {
                  setDeleteColumnModal(null);
                  setDeleteColumnAlsoFrom(new Set());
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                className={styles.deleteColumnBtnPrimary}
                onClick={() => applyDeleteColumn(deleteColumnAlsoFrom)}
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      {categoryMismatchModal && (
        <div
          className={styles.deleteColumnOverlay}
          onClick={() => setCategoryMismatchModal(null)}
          role="presentation"
        >
          <div
            className={`${styles.deleteColumnModal} ${styles.categoryMismatchModal}`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="category-mismatch-title"
          >
            <h2 id="category-mismatch-title" className={styles.deleteColumnTitle}>
              Пользователь уже есть в другой категории
            </h2>
            <p className={styles.deleteColumnInfo}>
              <strong>Ник:</strong> {categoryMismatchModal.existingNickname}
              <br />
              <strong>Текущая категория:</strong>{' '}
              {CATEGORY_TABS.find((t) => t.key === activeCategory)?.label ?? activeCategory}
              <br />
              <strong>Найден в категории:</strong>{' '}
              {CATEGORY_TABS.find((t) => t.key === categoryMismatchModal.existingCategory)?.label ??
                categoryMismatchModal.existingCategory}
              <br />
              <strong>Где находится:</strong>{' '}
              {categoryMismatchModal.existingLocations.length > 0 ? (
                <>
                  {categoryMismatchModal.existingLocations.slice(0, 6).map((loc, idx) => (
                    <span key={`${loc.tableTitle}-${loc.columnIndex}-${idx}`}>
                      {idx > 0 ? '; ' : ''}
                      {`«${loc.tableTitle}», столбец №${loc.columnIndex + 1}`}
                    </span>
                  ))}
                  {categoryMismatchModal.existingLocations.length > 6 &&
                    ` и ещё ${categoryMismatchModal.existingLocations.length - 6}`}
                </>
              ) : (
                '—'
              )}
            </p>
            <div className={styles.categoryMismatchActions}>
              <div className={styles.categoryMismatchActionsTopRow}>
                <button
                  type="button"
                  className={styles.deleteColumnBtnSecondary}
                  onClick={() => {
                  const m = categoryMismatchModal;
                  if ((m.existingCategories ?? []).length > 1) {
                    setCategoryMismatchModal(null);
                    setCategoryJumpModal({
                      tableTitle: m.tableTitle,
                      nickname: m.existingNickname,
                      categories: m.existingCategories,
                      pendingData: m.pendingData,
                      initialRatios: m.initialRatios,
                      initialRatioNotes: m.initialRatioNotes,
                      initialRatioColors: m.initialRatioColors,
                    });
                    return;
                  }

                  setCategoryMismatchModal(null);
                  const result = addUserToTable(
                    m.tableTitle,
                    m.pendingData,
                    m.initialRatios,
                    m.initialRatioNotes,
                    m.initialRatioColors,
                    m.existingCategory,
                  );
                  if (result && result.reason === 'similar_nickname') return;
                  setLastCreatedDiscord(m.pendingData.discordNickname ?? '');
                  setLastCreatedAccountLink(m.pendingData.accountLink ?? '');
                  setActiveCategory(m.existingCategory);
                  }}
                >
                  Переместить в найденную категорию
                </button>
                <button
                  type="button"
                  className={styles.deleteColumnBtnPrimary}
                  onClick={() => {
                  const m = categoryMismatchModal;
                  setCategoryMismatchModal(null);

                  // 1) перенос пользователя в текущую категорию
                  setUsers((prev) =>
                    prev.map((u) =>
                      u.id === m.existingUserId
                        ? {
                            ...u,
                            nickname: (m.pendingData.nickname ?? '').trim(),
                            discordNickname:
                              (m.pendingData.discordNickname ?? '').trim() !== ''
                                ? (m.pendingData.discordNickname ?? '').trim()
                                : (u.discordNickname ?? ''),
                            accountLink:
                              (m.pendingData.accountLink ?? '').trim() !== ''
                                ? (m.pendingData.accountLink ?? '').trim()
                                : (u.accountLink ?? ''),
                            category: activeCategory,
                          }
                        : u,
                    ),
                  );

                  // 2) перенести все появления этого userId в текущую категорию (в хвост),
                  // одновременно удалив его из остальных категорий.
                  moveUserToCategoryTailFromAllCategories(m.existingUserId, activeCategory);

                  // 3) применить введённые начальные данные для текущей таблицы (если были)
                  applyInitialDataForUserInTable(
                    m.tableTitle,
                    m.existingUserId,
                    m.initialRatios,
                    m.initialRatioNotes,
                    m.initialRatioColors,
                  );

                  setLastCreatedDiscord(m.pendingData.discordNickname ?? '');
                  setLastCreatedAccountLink(m.pendingData.accountLink ?? '');

                  // закрыть модалку создания
                  setUserModalOpen(false);
                  setEditingUserId(null);
                  setActiveTableForUserModal(null);
                  }}
                >
                  Перенести все повторения в текущую категорию (в конец)
                </button>
              </div>
              <div className={styles.categoryMismatchActionsBottomRow}>
                <button
                  type="button"
                  className={styles.deleteColumnBtnSecondary}
                  onClick={() => setCategoryMismatchModal(null)}
                >
                  Отмена (вернуться к созданию)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {categoryJumpModal && (
        <div
          className={styles.deleteColumnOverlay}
          onClick={() => setCategoryJumpModal(null)}
          role="presentation"
        >
          <div
            className={`${styles.deleteColumnModal} ${styles.categoryMismatchModal}`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="category-jump-title"
          >
            <h2 id="category-jump-title" className={styles.deleteColumnTitle}>
              В какую категорию хотите перейти после добавления?
            </h2>
            <p className={styles.deleteColumnInfo}>
              Ник <strong>{categoryJumpModal.nickname}</strong> найден в нескольких категориях.
              <br />
              Выберите категорию — пользователь будет добавлен туда, и вкладка переключится.
            </p>
            <div className={styles.categoryMismatchActions}>
              <div className={styles.categoryMismatchActionsTopRow}>
                {categoryJumpModal.categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={styles.deleteColumnBtnSecondary}
                    onClick={() => {
                      const m = categoryJumpModal;
                      setCategoryJumpModal(null);
                      const result = addUserToTable(
                        m.tableTitle,
                        m.pendingData,
                        m.initialRatios,
                        m.initialRatioNotes,
                        m.initialRatioColors,
                        cat,
                      );
                      if (result && result.reason === 'similar_nickname') return;
                      setLastCreatedDiscord(m.pendingData.discordNickname ?? '');
                      setLastCreatedAccountLink(m.pendingData.accountLink ?? '');
                      setActiveCategory(cat);
                    }}
                  >
                    {CATEGORY_TABS.find((t) => t.key === cat)?.label ?? cat}
                  </button>
                ))}
              </div>
              <div className={styles.categoryMismatchActionsBottomRow}>
                <button
                  type="button"
                  className={styles.deleteColumnBtnSecondary}
                  onClick={() => setCategoryJumpModal(null)}
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
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

            <section className={styles.colorLegendSection}>
              <h4 className={styles.colorLegendSectionTitle}>
                Только для соотношений (ячейки с соотношениями)
              </h4>
              <div className={styles.colorLegendGrid}>
                <div className={`${styles.colorLegendTag} ${styles.colorLegendSuper}`}>Супер выгодно</div>
                <div className={`${styles.colorLegendTag} ${styles.colorLegendMedium}`}>Средне выгодно</div>
                <div className={`${styles.colorLegendTag} ${styles.colorLegendLast}`}>Последний вариант</div>
                <div className={`${styles.colorLegendTag} ${styles.colorLegendPriceTop}`}>Моя цена топ</div>
                <div className={`${styles.colorLegendTag} ${styles.colorLegendPriceMid}`}>Моя цена средняя</div>
                <div className={`${styles.colorLegendTag} ${styles.colorLegendPriceNone}`}>Без описания</div>
              </div>
            </section>

            <section className={styles.colorLegendSection}>
              <h4 className={styles.colorLegendSectionTitle}>
                Только для блока пользователя (ник, малый блок)
              </h4>
              <div className={styles.colorLegendGrid}>
                <div className={`${styles.colorLegendTag} ${styles.colorLegendUa}`}>Украинец</div>
                <div className={`${styles.colorLegendTag} ${styles.colorLegendFast}`}>Быстро</div>
                <div className={`${styles.colorLegendTag} ${styles.colorLegendStopped}`}>Перестал трейдиться</div>
                <div className={`${styles.colorLegendTag} ${styles.colorLegendGone}`}>Пропал</div>
                <div className={`${styles.colorLegendTag} ${styles.colorLegendOtherTrades}`}>
                  Есть другие трейды ниже в один столбец (обратить внимание на никнеймы)
                </div>
                <div className={`${styles.colorLegendTag} ${styles.colorLegendBadReviews}`}>Плохие отзывы</div>
                <div className={`${styles.colorLegendTag} ${styles.colorLegendCarry}`}>carry</div>
              </div>
            </section>
          </div>
        </div>
      )}
      
      {activeHeaderColorPickerKey && headerPalettePosition &&
        createPortal(
          <div
            ref={headerPaletteRef}
            className={styles.headerPaletteFloating}
            style={{ top: headerPalettePosition.top, left: headerPalettePosition.left }}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const sep = activeHeaderColorPickerKey.indexOf('::');
              const tableTitle = activeHeaderColorPickerKey.slice(0, sep);
              const userId = activeHeaderColorPickerKey.slice(sep + 2);
              const currentTag = getUserHeaderColorTag(tableTitle, userId);
              return (
                <>
                  {HEADER_COLOR_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`${styles.headerColorTagBtnBig} ${styles[getHeaderColorClass(option.value)]} ${currentTag === option.value ? styles.headerColorTagBtnActive : ''}`}
                      onClick={() => {
                        handleUserHeaderColorTagChange(tableTitle, userId, option.value);
                        setActiveHeaderColorPickerKey(null);
                        setHeaderPalettePosition(null);
                      }}
                      title={option.title}
                    />
                  ))}
                  <button
                    type="button"
                    className={styles.headerColorClearBtnBig}
                    onClick={() => {
                      handleUserHeaderColorTagChange(tableTitle, userId, '');
                      setActiveHeaderColorPickerKey(null);
                      setHeaderPalettePosition(null);
                    }}
                    title="Сбросить цвет"
                  >
                    ×
                  </button>
                </>
              );
            })()}
          </div>,
          document.body,
        )}
      {activeMoveCategoryKey && moveCategoryDropdownPosition &&
        createPortal(
          <div
            ref={moveCategoryDropdownRef}
            className={styles.moveCategoryDropdown}
            style={{ top: moveCategoryDropdownPosition.top, left: moveCategoryDropdownPosition.left }}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const userId = activeMoveCategoryKey.slice(activeMoveCategoryKey.indexOf('::') + 2);
              const currentCategory = users.find((u) => u.id === userId)?.category ?? 'main';
              return CATEGORY_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`${styles.moveCategoryOption} ${currentCategory === tab.key ? styles.moveCategoryOptionActive : ''}`}
                  onClick={() => {
                    // ВАЖНО: при смене категории нужно переносить и слоты таблиц,
                    // иначе пользователь "пропадает" из текущей категории и не появляется в целевой.
                    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, category: tab.key } : u)));
                    moveUserToCategoryTailFromAllCategories(userId, tab.key);
                    setActiveMoveCategoryKey(null);
                    setMoveCategoryDropdownPosition(null);
                  }}
                >
                  {tab.label}
                </button>
              ));
            })()}
          </div>,
          document.body,
        )}
      {editModeBlockedPopup && (
        <div className={styles.editModeBlockedOverlay} onClick={() => setEditModeBlockedPopup(false)}>
          <div className={styles.editModeBlockedPopup} onClick={(e) => e.stopPropagation()}>
            <p className={styles.editModeBlockedText}>
              Снимите фильтр «Я даю» (выберите «— все таблицы —»), чтобы войти в режим редактирования.
            </p>
            <button
              type="button"
              className={styles.editModeBlockedBtn}
              onClick={() => setEditModeBlockedPopup(false)}
            >
              Понятно
            </button>
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
