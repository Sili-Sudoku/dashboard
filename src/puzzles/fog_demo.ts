/**
 * Classic Sudoku's grid. The bottom-right box (a mix of givens and
 * empty cells) is hidden behind fog until solved. It demonstrates progressive
 * reveal (#50): the fog clears cell by cell as correct values land in or next to
 * each hidden cell.
 */

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

const FOG_BOX = ["r7c7", "r7c8", "r7c9", "r8c7", "r8c8", "r8c9", "r9c7", "r9c8", "r9c9"];

export const fogDemo: PuzzleDefinition = {
    version: 1,
    metadata: {
        id: "fog-demo",
        title: "Fog of War Sudoku",
        author: "runtime demo",
        description: "The bottom-right box starts hidden. Solve cells next to it to clear the fog, one cell at a time.",
        difficulty: "easy",
        tags: ["sudoku", "classic", "fog"],
    },
    geometry: { type: "grid", width: 9, height: 9 },
    domain: { values: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
    givens: givensFromRows(GIVEN_ROWS),
    solution: givensFromRows(SOLUTION_ROWS),
    fog: { hidden: FOG_BOX },
    constraints: [{ use: "sudoku" }],
};
