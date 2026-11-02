/**
 * The demonstration puzzle: one 9x9 board with four independent constraint
 * systems at once: classic Sudoku, a killer cage, a thermometer and an arrow.
 * Each is a definition reference. The engine knows none of them.
 *
 * Base clues are the canonical Sudoku puzzle with two clues removed (r1c2, r3c8),
 * so the cage and thermometer do real work. All variant constraints
 * are consistent with the single solution in `solution`.
 */

import type { PuzzleDefinition } from "@/runtime/puzzle.ts";
import { givensFromRows, omit } from "@/puzzles/grid_text.ts";

const BASE_GIVENS = givensFromRows([
    "53..7....",
    "6..195...",
    ".98....6.",
    "8...6...3",
    "4..8.3..1",
    "7...2...6",
    ".6....28.",
    "...419..5",
    "....8..79",
]);

const SOLUTION = givensFromRows([
    "534678912",
    "672195348",
    "198342567",
    "859761423",
    "426853791",
    "713924856",
    "961537284",
    "287419635",
    "345286179",
]);

export const demoMixed: PuzzleDefinition = {
    version: 1,
    metadata: {
        id: "demo-mixed",
        title: "Four Systems, One Grid",
        author: "runtime demo",
        description:
            "Standard Sudoku with a killer cage, a thermometer and an arrow. All use generic constraints.",
        difficulty: "medium",
        tags: ["sudoku", "killer", "thermometer", "arrow", "composite"],
    },
    geometry: { type: "grid", width: 9, height: 9 },
    domain: { values: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
    givens: omit(BASE_GIVENS, ["r1c2", "r3c8"]),
    solution: SOLUTION,
    regions: {
        "cage:top-left": ["r1c1", "r1c2", "r1c3"],
    },
    constraints: [
        { use: "sudoku" },
        { use: "killer", cells: ["r1c1", "r1c2", "r1c3"], sum: 12 },
        { use: "thermometer", cells: ["r1c8", "r2c8", "r3c8"] },
        { use: "arrow", bulb: "r4c9", cells: ["r4c8", "r5c9"] },
    ],
    presentation: { cellSize: 64 },
};
