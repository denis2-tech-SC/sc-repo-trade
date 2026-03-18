/**
 * Допустимые символы в поле соотношения: "+", "-", цифры, ":" и "," (запятая — десятичный разделитель).
 * Допустимые значения: "+", "-" или число:число (например 1:1, 1,5:2).
 */

/** Точку заменяем на запятую (единый десятичный разделитель) */
const DOT_TO_COMMA = /\./g;

/** Символы, которые подменяем на ":" (й/ё — раскладка, '/` — опечатка) */
const SEPARATOR_CHARS = /[\s\u00A0жЖ^\/\\|·;_‑–—йЙёЁ'`]/g;

/** Плюс между двумя цифрами подменяем на ":" (1+1 → 1:1) */
const PLUS_BETWEEN_DIGITS = /(\d)\+(\d)/g;

/** Регулярка: оставляем только цифры, ":", "+", "-", "," */
const ALLOWED_CHARS = /[^\d:+\-,]/g;

/** Валидный формат: число:число (первое и второе число — опционально +/-, цифры, запятая и цифры) */
const RATIO_PREFIX = /^([+-]?\d*(,\d*)?):([+-]?\d*(,\d*)?)/;

/**
 * Нормализует ввод соотношения:
 * - точка заменяется на запятую (1.1 → 1,1);
 * - разделители (пробел, ж, й, ё, +, ', ` и т.д.) — на ":";
 * - оставляются только цифры, ":", "+", "-", ",";
 * - после второго числа лишние символы отбрасываются (концепция: число:число).
 */
export const normalizeRatioInput = (raw: string): string => {
  const withComma = raw.replace(DOT_TO_COMMA, ',');
  const withColon = withComma.replace(SEPARATOR_CHARS, ':').replace(PLUS_BETWEEN_DIGITS, '$1:$2');
  const onlyAllowed = withColon.replace(ALLOWED_CHARS, '');
  if (onlyAllowed === '+' || onlyAllowed === '-') return onlyAllowed;
  const match = onlyAllowed.match(RATIO_PREFIX);
  return match ? match[0] : onlyAllowed;
};
