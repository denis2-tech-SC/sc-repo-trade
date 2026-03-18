import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { PencilIcon, CrossIcon, CheckIcon, CloudIcon } from './icons';
import { normalizeRatioInput } from './ratioUtils';
import styles from './RatioBubble.module.css';

type Props = {
  ratio: string;
  note: string;
  colorTag:
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
  onRatioChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onColorTagChange: (
    value:
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
      | 'carry',
  ) => void;
  isEditMode: boolean;
  maskContent?: boolean;
  /** Для навигации Enter/Tab: идентификаторы ячейки */
  dataTableTitle?: string;
  dataItem?: string;
  dataUserId?: string;
  onRatioNavigate?: (e: React.KeyboardEvent, direction: 'down' | 'right') => void;
  onRowFocus?: () => void;
  onRowBlur?: () => void;
};

type ColorTag =
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

/** Цвета только для соотношений (ячейки с соотношениями). */
const COLOR_OPTIONS: Array<{ value: ColorTag; title: string }> = [
  { value: 'super', title: 'Супер выгодно' },
  { value: 'medium', title: 'Средне выгодно' },
  { value: 'last', title: 'Последний вариант' },
  { value: 'price_top', title: 'Моя цена топ' },
  { value: 'price_mid', title: 'Моя цена средняя' },
  { value: 'price_none', title: 'Без описания' },
];

const getColorClass = (tag: string): string => {
  if (tag === 'ua') return 'colorTagUa';
  if (tag === 'super') return 'colorTagSuper';
  if (tag === 'medium') return 'colorTagMedium';
  if (tag === 'last') return 'colorTagLast';
  if (tag === 'price_top') return 'colorTagPriceTop';
  if (tag === 'price_mid') return 'colorTagPriceMid';
  if (tag === 'price_none') return 'colorTagPriceNone';
  if (tag === 'fast') return 'colorTagFast';
  if (tag === 'stopped') return 'colorTagStopped';
  if (tag === 'gone') return 'colorTagGone';
  if (tag === 'other_trades') return 'colorTagOtherTrades';
  if (tag === 'bad_reviews') return 'colorTagBadReviews';
  if (tag === 'carry') return 'colorTagCarry';
  return '';
};

const getInputColorClass = (tag: string): string => {
  if (tag === 'ua') return 'ratioInputUa';
  if (tag === 'super') return 'ratioInputSuper';
  if (tag === 'medium') return 'ratioInputMedium';
  if (tag === 'last') return 'ratioInputLast';
  if (tag === 'price_top') return 'ratioInputPriceTop';
  if (tag === 'price_mid') return 'ratioInputPriceMid';
  if (tag === 'price_none') return 'ratioInputPriceNone';
  if (tag === 'fast') return 'ratioInputFast';
  if (tag === 'stopped') return 'ratioInputStopped';
  if (tag === 'gone') return 'ratioInputGone';
  if (tag === 'other_trades') return 'ratioInputOtherTrades';
  if (tag === 'bad_reviews') return 'ratioInputBadReviews';
  if (tag === 'carry') return 'ratioInputCarry';
  return '';
};

const RatioBubble = ({
  ratio,
  note,
  colorTag,
  onRatioChange,
  onNoteChange,
  onColorTagChange,
  isEditMode,
  maskContent = false,
  dataTableTitle,
  dataItem,
  dataUserId,
  onRatioNavigate,
  onRowFocus,
  onRowBlur,
}: Props) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [palettePos, setPalettePos] = useState({ top: 0, left: 0 });
  const [editValue, setEditValue] = useState(note);
  const [inputFlashWarning, setInputFlashWarning] = useState(false);
  const [contextMenuWarningMessage, setContextMenuWarningMessage] = useState<string | null>(null);
  const [warningPopupPos, setWarningPopupPos] = useState({ top: 0, left: 0 });
  const [contextBarOpen, setContextBarOpen] = useState(false);
  const [contextBarPos, setContextBarPos] = useState({ top: 0, left: 0 });
  const modalRef = useRef<HTMLDivElement>(null);
  const contextBarRef = useRef<HTMLDivElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const paletteWidth = 268;
  const paletteHeight = 52;
  const contextBarWidth = 72;
  const contextBarHeight = 36;
  const screenPadding = 8;

  const openContextBarAboveInput = () => {
    const input = inputRef.current;
    if (!input) return;
    const rect = input.getBoundingClientRect();
    const left = Math.max(screenPadding, Math.min(rect.left + rect.width / 2 - contextBarWidth / 2, window.innerWidth - contextBarWidth - screenPadding));
    const top = Math.max(screenPadding, rect.top - contextBarHeight - 2);
    setContextBarPos({ top, left });
    setContextBarOpen(true);
  };

  const openColorPaletteAboveBar = () => {
    if (!contextBarRef.current) return;
    const rect = contextBarRef.current.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - paletteWidth / 2;
    let top = rect.top - paletteHeight - 2;
    if (left + paletteWidth > window.innerWidth - screenPadding) left = window.innerWidth - paletteWidth - screenPadding;
    if (left < screenPadding) left = screenPadding;
    if (top < screenPadding) top = screenPadding;
    if (top + paletteHeight > window.innerHeight - screenPadding) top = window.innerHeight - paletteHeight - screenPadding;
    setPalettePos({ top, left });
    setColorPickerOpen(true);
  };

  const showWarningPopup = (message: string) => {
    const input = inputRef.current;
    if (input) {
      const rect = input.getBoundingClientRect();
      const popupWidth = 220;
      setWarningPopupPos({
        left: Math.max(8, Math.min(rect.left + rect.width / 2 - popupWidth / 2, window.innerWidth - popupWidth - 8)),
        top: rect.top - 8,
      });
    }
    setInputFlashWarning(true);
    setContextMenuWarningMessage(message);
    window.setTimeout(() => setInputFlashWarning(false), 80);
    window.setTimeout(() => setInputFlashWarning(true), 160);
    window.setTimeout(() => setInputFlashWarning(false), 240);
    window.setTimeout(() => setContextMenuWarningMessage(null), 2500);
  };

  const handleInputContextMenu = (e: React.MouseEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (isEditMode) {
      showWarningPopup('В режиме редактирования используйте кнопку цвета рядом с полем.');
      return;
    }
    if (ratio.trim() === '') {
      showWarningPopup('Сначала заполните поле.');
      return;
    }
    openContextBarAboveInput();
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (modalOpen && modalRef.current && !modalRef.current.contains(target)) {
        if (isEditing) {
          setEditValue(note);
          setIsEditing(false);
        }
        setModalOpen(false);
      }
      if (colorPickerOpen && paletteRef.current && !paletteRef.current.contains(target)) {
        const onContextBar = contextBarRef.current && contextBarRef.current.contains(target);
        const onInput = inputRef.current && inputRef.current.contains(target);
        if (!onContextBar && !onInput) {
          setColorPickerOpen(false);
          setContextBarOpen(false);
        }
      }
      if (contextBarOpen && !colorPickerOpen && contextBarRef.current && !contextBarRef.current.contains(target)) {
        const onInput = inputRef.current && inputRef.current.contains(target);
        if (!onInput) setContextBarOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [modalOpen, isEditing, note, colorPickerOpen, contextBarOpen]);

  const handleSave = () => {
    onNoteChange(editValue.trim());
    setIsEditing(false);
    setModalOpen(false);
  };

  const handleCancel = () => {
    setEditValue(note);
    setIsEditing(false);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!onRatioNavigate || isEditMode || maskContent) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      onRatioNavigate(e, 'down');
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      onRatioNavigate(e, 'right');
    }
  };

  return (
    <div className={`${styles.wrap} ${note ? styles.wrapHasNote : ''}`}>
      <div className={styles.ratioInputWrap}>
        <input
          ref={inputRef}
          type="text"
          className={`${styles.ratioInput} ${styles[getInputColorClass(colorTag)] ?? ''} ${inputFlashWarning ? styles.ratioInputFlash : ''}`}
          placeholder=""
          value={maskContent ? '**:**' : ratio}
          onChange={(e) => onRatioChange(normalizeRatioInput(e.target.value))}
          onFocus={onRowFocus}
          onBlur={onRowBlur}
          onKeyDown={handleInputKeyDown}
          onContextMenu={handleInputContextMenu}
          readOnly={isEditMode || maskContent}
          title="ПКМ — выбор цвета соотношения. Enter — вниз, Tab — вправо"
          {...(dataTableTitle != null && { 'data-ratio-table': dataTableTitle })}
          {...(dataItem != null && { 'data-ratio-item': dataItem })}
          {...(dataUserId != null && { 'data-ratio-user': dataUserId })}
        />
      </div>
      {contextMenuWarningMessage &&
        createPortal(
          <div
            className={styles.contextMenuWarningPopupFixed}
            style={{ top: warningPopupPos.top, left: warningPopupPos.left }}
            role="alert"
          >
            {contextMenuWarningMessage}
          </div>,
          document.body,
        )}
      {contextBarOpen &&
        !isEditMode &&
        createPortal(
          <div
            ref={contextBarRef}
            className={styles.contextBarWrap}
            style={{ top: contextBarPos.top, left: contextBarPos.left }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className={`${styles.contextBarColorBtn} ${
                colorTag ? styles[getColorClass(colorTag)] : styles.contextBarColorBtnEmpty
              }`}
              onClick={() => openColorPaletteAboveBar()}
              title="Выбрать цвет"
            />
            <button
              type="button"
              className={`${styles.contextBarCloudBtn} ${note ? styles.contextBarCloudBtnHasNote : ''}`}
              onClick={() => {
                setEditValue(note);
                setModalOpen(true);
                setContextBarOpen(false);
              }}
              title={note || 'Комментарий'}
            >
              <CloudIcon />
            </button>
          </div>,
          document.body,
        )}
      {colorPickerOpen &&
        createPortal(
          <div
            ref={paletteRef}
            className={`${styles.colorPalette} ${styles.colorPaletteFloating}`}
            style={{ top: palettePos.top, left: palettePos.left }}
          >
            {COLOR_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`${styles.colorTagBtn} ${styles[getColorClass(option.value)]} ${
                  colorTag === option.value ? styles.colorTagBtnActive : ''
                }`}
                onClick={() => {
                  onColorTagChange(option.value);
                  setColorPickerOpen(false);
                  setContextBarOpen(false);
                }}
                title={option.title}
              />
            ))}
            <button
              type="button"
              className={styles.colorClearBtn}
              onClick={() => {
                onColorTagChange('');
                setColorPickerOpen(false);
                setContextBarOpen(false);
              }}
              title="Сбросить цвет"
            >
              ×
            </button>
          </div>,
          document.body,
        )}

      {modalOpen && (
        <div className={styles.modalOverlay}>
          <div ref={modalRef} className={styles.modal}>
            {isEditing ? (
              <>
                <textarea
                  className={styles.modalTextarea}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  placeholder="Примечание…"
                  autoFocus
                  rows={4}
                />
                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={styles.modalBtn}
                    onClick={handleSave}
                    title="Сохранить"
                  >
                    <CheckIcon />
                  </button>
                  <button
                    type="button"
                    className={`${styles.modalBtn} ${styles.modalBtnCancel}`}
                    onClick={handleCancel}
                    title="Отмена"
                  >
                    <CrossIcon />
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className={styles.modalContent}>
                  {note || <span className={styles.modalPlaceholder}>Пусто</span>}
                </div>
                <button
                  type="button"
                  className={styles.editBtn}
                  onClick={() => {
                    setEditValue(note);
                    setIsEditing(true);
                  }}
                  title="Редактировать"
                >
                  <PencilIcon />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RatioBubble;
