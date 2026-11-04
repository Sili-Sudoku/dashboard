/** The keyboard shortcuts of the player. The legend of the player and the How to play page both show them. */
export const SHORTCUTS: { keys: string; action: string }[] = [
    { keys: "Click / drag", action: "select cells" },
    { keys: "Arrows", action: "move the cursor (Shift+Arrow extends the selection)" },
    { keys: "1–9", action: "enter a value, toggle a note, or pick a color (0 = background), as the pad mode sets" },
    { keys: "(type consecutive digits)", action: "for domains past 1-9: press 1 then 0 to enter 10" },
    { keys: "Shift+digit", action: "toggle a corner note directly" },
    { keys: "Ctrl/Cmd+digit", action: "toggle a center note directly" },
    { keys: "Space", action: "switch between Digit and Corner mode" },
    {
        keys: "Backspace / Delete",
        action: "erase one layer of the cell: the active one first, then value, center, corner, color, pen on that cell",
    },
    {
        keys: "Tab / Shift+Tab",
        action: "go to the next or previous empty cell (Tab past the last empty cell leaves the board)",
    },
    { keys: "Enter", action: "select each cell with the same value as the cursor cell" },
    { keys: "Ctrl+Z", action: "undo" },
    { keys: "Ctrl+Shift+Z / Ctrl+Y", action: "redo" },
    { keys: "V", action: "check entered values and center notes against the solution (if the puzzle has one)" },
    {
        keys: "R / C / B / G",
        action: "read aloud the row, column, or box of the cursor, or each given (screen readers)",
    },
    { keys: "Escape", action: "deselect all cells. Click a cell to start again" },
];
