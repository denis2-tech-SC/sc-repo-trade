import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { UserIcon, DiscordIcon, LinkIcon, CheckIcon, CrossIcon, CloudIcon } from './icons';
import { getItemStyleClass, getShortItemName } from './itemStyles';
import { normalizeRatioInput } from './ratioUtils';
import styles from './UserModal.module.css';

export type UserData = {
  id: string;
  nickname: string;
  discordNickname: string;
  accountLink: string;
};

export type RatioColorTag =
  | ''
  | 'super'
  | 'medium'
  | 'last'
  | 'price_top'
  | 'price_mid'
  | 'price_none';

type Props = {
  user: UserData | null;
  tableContext?: { tableTitle: string; items: string[] } | null;
  /** При создании нового пользователя: если поля Discord/ссылка пустые — подставляются эти значения. */
  defaultDiscordNickname?: string;
  defaultAccountLink?: string;
  onSave: (
    data: Omit<UserData, 'id'>,
    initialRatios?: Record<string, string>,
    initialRatioNotes?: Record<string, string>,
    initialRatioColors?: Record<string, string>,
  ) => void | false;
  onClose: () => void;
};

const RATIO_COLOR_OPTIONS: Array<{ value: RatioColorTag; title: string }> = [
  { value: 'super', title: 'Супер выгодно' },
  { value: 'medium', title: 'Средне выгодно' },
  { value: 'last', title: 'Последний вариант' },
  { value: 'price_top', title: 'Моя цена топ' },
  { value: 'price_mid', title: 'Моя цена средняя' },
  { value: 'price_none', title: 'Без описания' },
];

const getRatioColorClass = (tag: string): string => {
  if (!tag) return '';
  const key = `colorTag${tag.charAt(0).toUpperCase()}${tag.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase())}`;
  return (styles as Record<string, string>)[key] ?? '';
};

const UserModal = ({ user, tableContext, defaultDiscordNickname, defaultAccountLink, onSave, onClose }: Props) => {
  const [nickname, setNickname] = useState(() => user?.nickname ?? '');
  // При создании нового пользователя поля должны быть пустыми,
  // но при сохранении пустые значения будут заменены на default* (если переданы).
  const [discordNickname, setDiscordNickname] = useState(() => user?.discordNickname ?? '');
  const [accountLink, setAccountLink] = useState(() => user?.accountLink ?? '');
  const [tableRatios, setTableRatios] = useState<Record<string, string>>(() =>
    tableContext?.items ? Object.fromEntries(tableContext.items.map((item) => [item, ''])) : {},
  );
  const [tableRatioNotes, setTableRatioNotes] = useState<Record<string, string>>(() =>
    tableContext?.items ? Object.fromEntries(tableContext.items.map((item) => [item, ''])) : {},
  );
  const [tableRatioColors, setTableRatioColors] = useState<Record<string, string>>(() =>
    tableContext?.items ? Object.fromEntries(tableContext.items.map((item) => [item, ''])) : {},
  );
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [activeColorItem, setActiveColorItem] = useState<string | null>(null);
  const [colorPalettePosition, setColorPalettePosition] = useState<{ top: number; left: number } | null>(null);
  const [activeNoteItem, setActiveNoteItem] = useState<string | null>(null);
  const [noteEditValue, setNoteEditValue] = useState('');
  const [useDefaultsOnEmpty, setUseDefaultsOnEmpty] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const nicknameInputRef = useRef<HTMLInputElement>(null);
  const colorBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const colorPaletteRef = useRef<HTMLDivElement>(null);
  const noteModalRef = useRef<HTMLDivElement>(null);
  const noteOverlayRef = useRef<HTMLDivElement>(null);
  const ratioInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const isCreate = user === null;
  const hasDefaults =
    ((defaultDiscordNickname ?? '').trim() !== '') || ((defaultAccountLink ?? '').trim() !== '');

  useEffect(() => {
    if (isCreate) {
      const t = setTimeout(() => nicknameInputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [isCreate]);
  const showTableFields = isCreate && tableContext && tableContext.items.length > 0;
  const hasAnyRatioFilled =
    showTableFields &&
    Object.values(tableRatios).some((v) => (v ?? '').trim() !== '');
  const hasAnyMainFieldFilled =
    nickname.trim() !== '' || discordNickname.trim() !== '' || accountLink.trim() !== '';
  const hasUnsavedData = hasAnyRatioFilled || hasAnyMainFieldFilled;

  const requestClose = () => {
    if (isCreate && hasUnsavedData) {
      setResetConfirmOpen(true);
    } else {
      onClose();
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (modalRef.current?.contains(target)) return;
      if (resetConfirmOpen) return;
      if (activeColorItem && colorPaletteRef.current?.contains(target)) return;
      if (activeNoteItem && noteOverlayRef.current?.contains(target)) return;
      if (isCreate && hasUnsavedData) {
        setResetConfirmOpen(true);
      } else {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, isCreate, hasUnsavedData, resetConfirmOpen, activeColorItem, activeNoteItem]);

  const handleSubmit = () => {
    const trimmedNick = nickname.trim();
    if (!trimmedNick) return;
    const initialRatios =
      !user && tableContext
        ? Object.fromEntries(
            Object.entries(tableRatios).filter(([, v]) => v.trim() !== ''),
          )
        : undefined;
    const initialRatioNotes =
      !user && tableContext && Object.values(tableRatioNotes).some((v) => (v ?? '').trim() !== '')
        ? Object.fromEntries(
            Object.entries(tableRatioNotes).filter(([, v]) => (v ?? '').trim() !== ''),
          )
        : undefined;
    const initialRatioColors =
      !user && tableContext && Object.values(tableRatioColors).some((v) => (v ?? '').trim() !== '')
        ? Object.fromEntries(
            Object.entries(tableRatioColors).filter(([, v]) => (v ?? '').trim() !== ''),
          )
        : undefined;
    const resolvedDiscord =
      discordNickname.trim() !== ''
        ? discordNickname.trim()
        : useDefaultsOnEmpty
          ? (defaultDiscordNickname ?? '').trim()
          : '';
    const resolvedAccountLink =
      accountLink.trim() !== ''
        ? accountLink.trim()
        : useDefaultsOnEmpty
          ? (defaultAccountLink ?? '').trim()
          : '';
    const shouldClose = onSave(
      {
        nickname: trimmedNick,
        discordNickname: resolvedDiscord,
        accountLink: resolvedAccountLink,
      },
      initialRatios,
      initialRatioNotes,
      initialRatioColors,
    );
    if (shouldClose !== false) onClose();
  };

  const openColorPalette = (item: string, btn: HTMLButtonElement) => {
    const rect = btn.getBoundingClientRect();
    setColorPalettePosition({
      top: rect.top - 54,
      left: Math.max(8, Math.min(rect.left + rect.width / 2 - 134, window.innerWidth - 276)),
    });
    setActiveColorItem(item);
  };

  const closeColorPalette = () => {
    setActiveColorItem(null);
    setColorPalettePosition(null);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!activeColorItem) return;
      const target = e.target as Node;
      const onPalette = colorPaletteRef.current?.contains(target);
      const onBtn = colorBtnRefs.current[activeColorItem]?.contains(target);
      if (!onPalette && !onBtn) closeColorPalette();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeColorItem]);

  const openNoteModal = (item: string) => {
    setNoteEditValue(tableRatioNotes[item] ?? '');
    setActiveNoteItem(item);
  };

  return (
    <div className={styles.overlay}>
      <div ref={modalRef} className={styles.modal}>
        <div className={styles.title}>
          {isCreate ? 'Новый игрок' : 'Редактировать игрока'}
        </div>
        <div className={styles.fields}>
          <div className={styles.field}>
            <UserIcon className={styles.fieldIcon} />
            <input
              ref={nicknameInputRef}
              type="text"
              className={styles.input}
              placeholder="Никнейм"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <DiscordIcon className={styles.fieldIcon} />
            <input
              type="text"
              className={styles.input}
              placeholder="Никнейм в Discord"
              value={discordNickname}
              onChange={(e) => setDiscordNickname(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <LinkIcon className={styles.fieldIcon} />
            <input
              type="text"
              className={styles.input}
              placeholder="Ссылка на аккаунт"
              value={accountLink}
              onChange={(e) => setAccountLink(e.target.value)}
            />
          </div>
          {isCreate && hasDefaults && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
              <input
                type="checkbox"
                checked={useDefaultsOnEmpty}
                onChange={(e) => setUseDefaultsOnEmpty(e.target.checked)}
              />
              <span style={{ fontSize: '0.85rem', color: '#374151', fontWeight: 600 }}>
                Если поля пустые — подставлять прошлые Discord/ссылку
              </span>
            </label>
          )}
          {showTableFields && (
            <div className={styles.tableSection}>
              <div className={styles.tableSectionTitle}>
                Таблица «{tableContext.tableTitle}» — соотношения
              </div>
              <div className={styles.tableRatiosList}>
                {tableContext.items.map((item, index) => (
                  <div key={item} className={styles.tableRatioRow}>
                    <span
                      className={`${styles.tableRatioLabel} ${getItemStyleClass(item) ? styles[getItemStyleClass(item)] : ''}`}
                      title={item}
                    >
                      <span className={styles.itemNameFull}>{item}</span>
                      <span className={styles.itemNameShort}>{getShortItemName(item)}</span>
                    </span>
                    <input
                      ref={(el) => {
                        ratioInputRefs.current[index] = el;
                      }}
                      type="text"
                      className={styles.input}
                      placeholder="1:1"
                      value={tableRatios[item] ?? ''}
                      onChange={(e) =>
                        setTableRatios((prev) => ({
                          ...prev,
                          [item]: normalizeRatioInput(e.target.value),
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const nextIndex = index + 1;
                          if (nextIndex < tableContext.items.length) {
                            ratioInputRefs.current[nextIndex]?.focus();
                          }
                        }
                      }}
                      title="Enter — перейти к следующей строке"
                    />
                    <div className={styles.tableRatioIcons}>
                      <button
                        type="button"
                        ref={(el) => {
                          colorBtnRefs.current[item] = el;
                        }}
                        className={`${styles.tableRatioColorBtn} ${getRatioColorClass(tableRatioColors[item] ?? '')}`}
                        title="Цвет"
                        onClick={(e) => {
                          if (activeColorItem === item) closeColorPalette();
                          else openColorPalette(item, e.currentTarget);
                        }}
                        aria-label="Выбрать цвет"
                      />
                      <button
                        type="button"
                        className={`${styles.tableRatioCloudBtn} ${(tableRatioNotes[item] ?? '').trim() ? styles.tableRatioCloudBtnHasNote : ''}`}
                        title={tableRatioNotes[item]?.trim() || 'Комментарий'}
                        onClick={() => openNoteModal(item)}
                        aria-label="Комментарий"
                      >
                        <CloudIcon />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.btnSave} onClick={handleSubmit}>
            <CheckIcon />
            Сохранить
          </button>
          <button type="button" className={styles.btnCancel} onClick={requestClose}>
            <CrossIcon />
            Отмена
          </button>
        </div>
      </div>
      {activeColorItem && colorPalettePosition &&
        createPortal(
          <div
            ref={colorPaletteRef}
            className={`${styles.ratioColorPalette} ${styles.ratioColorPaletteFloating}`}
            style={{ top: colorPalettePosition.top, left: colorPalettePosition.left }}
          >
            {RATIO_COLOR_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`${styles.ratioColorTagBtn} ${getRatioColorClass(option.value)} ${(tableRatioColors[activeColorItem] ?? '') === option.value ? styles.ratioColorTagBtnActive : ''}`}
                onClick={() => {
                  setTableRatioColors((prev) => ({ ...prev, [activeColorItem]: option.value }));
                  closeColorPalette();
                }}
                title={option.title}
              />
            ))}
            <button
              type="button"
              className={styles.ratioColorClearBtn}
              onClick={() => {
                setTableRatioColors((prev) => ({ ...prev, [activeColorItem]: '' }));
                closeColorPalette();
              }}
              title="Сбросить цвет"
            >
              ×
            </button>
          </div>,
          document.body,
        )}

      {activeNoteItem && (
        <div
          ref={noteOverlayRef}
          className={styles.noteModalOverlay}
          onClick={() => {
            setNoteEditValue(tableRatioNotes[activeNoteItem] ?? '');
            setActiveNoteItem(null);
          }}
        >
          <div
            ref={noteModalRef}
            className={styles.noteModal}
            onClick={(e) => e.stopPropagation()}
          >
            <textarea
              className={styles.noteModalTextarea}
              value={noteEditValue}
              onChange={(e) => setNoteEditValue(e.target.value)}
              placeholder="Примечание…"
              rows={4}
              autoFocus
            />
            <div className={styles.noteModalActions}>
              <button
                type="button"
                className={styles.noteModalBtn}
                onClick={() => {
                  setTableRatioNotes((prev) => ({ ...prev, [activeNoteItem]: noteEditValue.trim() }));
                  setActiveNoteItem(null);
                }}
                title="Сохранить"
              >
                <CheckIcon />
              </button>
              <button
                type="button"
                className={`${styles.noteModalBtn} ${styles.noteModalBtnCancel}`}
                onClick={() => {
                  setNoteEditValue(tableRatioNotes[activeNoteItem] ?? '');
                  setActiveNoteItem(null);
                }}
                title="Отмена"
              >
                <CrossIcon />
              </button>
            </div>
          </div>
        </div>
      )}

      {resetConfirmOpen && (
        <div
          className={styles.resetConfirmOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-confirm-title"
          onClick={() => setResetConfirmOpen(false)}
        >
          <div className={styles.resetConfirmBox} onClick={(e) => e.stopPropagation()}>
            <p id="reset-confirm-title" className={styles.resetConfirmTitle}>
              Вы точно хотите сбросить?
            </p>
            <div className={styles.resetConfirmActions}>
              <button
                type="button"
                className={styles.resetConfirmBtnDanger}
                onClick={() => {
                  setResetConfirmOpen(false);
                  onClose();
                }}
              >
                Да, сбросить
              </button>
              <button
                type="button"
                className={styles.resetConfirmBtnCancel}
                onClick={() => setResetConfirmOpen(false)}
              >
                Нет, остаться
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserModal;
