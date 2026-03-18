/** Классы стилей для конкретных предметов */
export const getItemStyleClass = (item: string): string => {
  if (item === 'Polaris Bits') return 'itemPolarisBits';
  if (item === 'Wikelo Favor') return 'itemWikeloFavor';
  if (item === 'Carinite (Pure)') return 'itemCarinite';
  if (item === 'Irradiated Valakkar Pearl (Grade AAA) 🫧') return 'itemValakkarPearl';
  if (item === 'DCHS-05 Comp-Board') return 'itemCompBoard';
  return '';
};

/** Короткие названия для мобильных и при узком экране */
const ITEM_SHORT_NAMES: Record<string, string> = {
  'UEE 6th Platoon Medal (Pristine) 🎖️': 'UEE 6th🎖️',
  'Polaris Bits': 'Bits',
  'Ace Interceptor Helmet 🪖': 'Ace Helm 🪖',
  'Wikelo Favor': 'Favor',
  'Irradiated Valakkar Pearl (Grade AAA) 🫧': 'AAA 🫧',
  'Carinite (Pure)': 'Pure',
  'DCHS-05 Comp-Board': 'DC-05',
  'Tevarin War Service Marker (Pristine)': 'Tevarin',
  'Irradiated Valakkar Fang (Apex) 🦷': 'Fang 🦷',
};

export const getShortItemName = (item: string): string =>
  ITEM_SHORT_NAMES[item] ?? item;
