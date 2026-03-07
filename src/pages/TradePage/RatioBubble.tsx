import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { PencilIcon, CrossIcon, CheckIcon, CloudIcon } from './icons';
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

const COLOR_OPTIONS: Array<{ value: ColorTag; title: string }> = [
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
}: Props) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [palettePos, setPalettePos] = useState({ top: 0, left: 0 });
  const [editValue, setEditValue] = useState(note);
  const modalRef = useRef<HTMLDivElement>(null);
  const colorButtonRef = useRef<HTMLButtonElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (modalOpen) setEditValue(note);
  }, [modalOpen, note]);

  useEffect(() => {
    const updatePalettePosition = () => {
      if (!colorButtonRef.current) return;
      const rect = colorButtonRef.current.getBoundingClientRect();
      const paletteWidth = 166;
      const paletteHeight = 48;
      const screenPadding = 8;

      let left = rect.left;
      if (left + paletteWidth > window.innerWidth - screenPadding) {
        left = window.innerWidth - paletteWidth - screenPadding;
      }
      if (left < screenPadding) left = screenPadding;

      let top = rect.bottom + 6;
      if (top + paletteHeight > window.innerHeight - screenPadding) {
        top = rect.top - paletteHeight - 6;
      }
      if (top < screenPadding) top = screenPadding;

      setPalettePos({ top, left });
    };

    if (colorPickerOpen) {
      updatePalettePosition();
      window.addEventListener('resize', updatePalettePosition);
      window.addEventListener('scroll', updatePalettePosition, true);
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (modalOpen && modalRef.current && !modalRef.current.contains(e.target as Node)) {
        if (isEditing) {
          setEditValue(note);
          setIsEditing(false);
        }
        setModalOpen(false);
      }
      if (
        colorPickerOpen &&
        paletteRef.current &&
        !paletteRef.current.contains(e.target as Node) &&
        colorButtonRef.current &&
        !colorButtonRef.current.contains(e.target as Node)
      ) {
        setColorPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', updatePalettePosition);
      window.removeEventListener('scroll', updatePalettePosition, true);
    };
  }, [modalOpen, isEditing, note, colorPickerOpen]);

  const handleSave = () => {
    onNoteChange(editValue.trim());
    setIsEditing(false);
    setModalOpen(false);
  };

  const handleCancel = () => {
    setEditValue(note);
    setIsEditing(false);
  };

  return (
    <div className={styles.wrap}>
      <input
        type="text"
        className={`${styles.ratioInput} ${styles[getInputColorClass(colorTag)] ?? ''}`}
        placeholder=""
        value={ratio}
        onChange={(e) => onRatioChange(e.target.value)}
        readOnly={isEditMode}
      />
      {isEditMode && (
        <div className={styles.colorPickerWrap}>
          <button
            type="button"
            ref={colorButtonRef}
            className={`${styles.currentColorBtn} ${
              colorTag ? styles[getColorClass(colorTag)] : styles.currentColorBtnEmpty
            }`}
            onClick={() => setColorPickerOpen((v) => !v)}
            title="Выбрать цвет"
          />
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
                }}
                title="Сбросить цвет"
              >
                ×
              </button>
            </div>,
            document.body,
          )}
        </div>
      )}
      <button
        type="button"
        className={`${styles.bubbleBtn} ${note ? styles.bubbleBtnHasNote : ''}`}
        onClick={() => setModalOpen(true)}
        title={note || undefined}
      >
        <CloudIcon />
      </button>

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
                  onClick={() => setIsEditing(true)}
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
