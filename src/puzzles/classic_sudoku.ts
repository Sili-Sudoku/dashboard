import type { PuzzleDefinition } from "@/runtime/puzzle.ts";
import { givensFromRows } from "@/puzzles/grid_text.ts";

const SOLUTION_ROWS = [
    "534678912",
    "672195348",
    "198342567",
    "859761423",
    "426853791",
    "713924856",
    "961537284",
    "287419635",
    "345286179",
];

const GIVEN_ROWS = [
    "53..7....",
    "6..195...",
    ".98....6.",
    "8...6...3",
    "4..8.3..1",
    "7...2...6",
    ".6....28.",
    "...419..5",
    "....8..79",
];

export const classicSudoku: PuzzleDefinition = {
    version: 1,
    metadata: {
        id: "classic-sudoku",
        title: "Classic Sudoku",
        author: "runtime demo",
        description: "The standard 9x9 puzzle. Each row, column and box has all different digits. There are no other rules.",
        difficulty: "easy",
        tags: ["sudoku", "classic"],
    },
    geometry: { type: "grid", width: 9, height: 9 },
    domain: { values: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
    givens: givensFromRows(GIVEN_ROWS),
    solution: givensFromRows(SOLUTION_ROWS),
    constraints: [{ use: "sudoku" }],
};
