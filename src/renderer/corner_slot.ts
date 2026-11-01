/** Column/row (0..2) of digit `n` in a cell's 3x3 corner-note grid. 0 has no slot of
 *  its own in 1-9 order, so it takes the centre (shared with 5, which is rarely noted
 *  alongside it). */
export const cornerSlot = (n: number): { col: number; row: number } =>
    n === 0 ? { col: 1, row: 1 } : { col: (n - 1) % 3, row: Math.floor((n - 1) / 3) };
