/** Column and row (0..2) in the 3x3 corner-note grid of a cell, for the `index`-th corner note (0 = the first).
 *  Notes pack into the cell in a fixed order, whatever their digits are:
 *  the four corners first, then the middle of each side, then the centre.
 *  The notes of a cell are sorted, so the first one is always in the top-left corner. */
const SLOTS: readonly { col: number; row: number }[] = [
    { col: 0, row: 0 },
    { col: 2, row: 0 },
    { col: 0, row: 2 },
    { col: 2, row: 2 },
    { col: 1, row: 0 },
    { col: 1, row: 2 },
    { col: 0, row: 1 },
    { col: 2, row: 1 },
    { col: 1, row: 1 },
];

export const cornerSlot = (index: number): { col: number; row: number } => SLOTS[Math.min(index, SLOTS.length - 1)];
