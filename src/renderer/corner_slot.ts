/** Column and row (0..2) of digit `n` in the 3x3 corner-note grid of a cell.
 *  Digit 0 has no slot in the 1-9 order, so it uses the centre slot.
 *  Digit 5 also uses the centre slot. Players rarely note 5 and 0 together. */
export const cornerSlot = (n: number): { col: number; row: number } =>
    n === 0 ? { col: 1, row: 1 } : { col: (n - 1) % 3, row: Math.floor((n - 1) / 3) };
