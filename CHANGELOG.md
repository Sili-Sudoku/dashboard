# Changelog

## 0.1.0 (not released yet)

First version. Everything runs in the browser, with no server and no accounts.

- Play Sudoku variants: thermometers, killer cages, arrows, kropki dots, XV, sandwich, little killer, lines, clones, and
  more. Each variant is a small definition built from generic primitives.
- Solve with digits, corner and centre notes, colour marks, undo and redo, a check against the solution, a timer, and
  personal stats. Large, multi-grid, and fog puzzles are supported.
- Author puzzles in JSON, with a visual editor, or in code. The app checks that a puzzle has one solution before you
  share it.
- Import from and export to f-puzzles, SudokuPad, and SudokuMaker. Anything it cannot carry over gets a warning. See
  `docs/IMPORT_FIDELITY.md`.
- Share a puzzle as a link that holds the whole puzzle. A puzzle can name its original author and link to its source,
  and the link opens only after you confirm.
- Works offline and can be installed. Five colour palettes, each with a light and a dark theme.
- Keyboard-only play, and checks for accessibility and contrast.
