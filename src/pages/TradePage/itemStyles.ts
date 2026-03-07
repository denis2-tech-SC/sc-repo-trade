/** Классы стилей для конкретных предметов */
export const getItemStyleClass = (item: string): string => {
  if (item === 'Polaris Bits') return 'itemPolarisBits';
  if (item === 'Wikelo Favor') return 'itemWikeloFavor';
  if (item === 'Carinite (Pure)') return 'itemCarinite';
  if (item === 'Irradiated Valakkar Pearl (Grade AAA) 🫧') return 'itemValakkarPearl';
  if (item === 'DCHS-05 Comp-Board') return 'itemCompBoard';
  return '';
};
