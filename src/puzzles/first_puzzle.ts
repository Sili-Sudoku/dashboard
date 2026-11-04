/**
 * The sample puzzle that the landing page links to: a 6x6 with four kinds of constraints,
 * so a new visitor meets the variants at once. It has exactly one solution (see `puzzles.test.ts`).
 */

import type { PuzzleDefinition } from "@/runtime/puzzle.ts";
import { givensFromRows } from "@/puzzles/grid_text.ts";

export const firstPuzzle: PuzzleDefinition = {
    version: 1,
    metadata: {
        id: "first-puzzle",
        title: "First puzzle",
        description:
            "A 6x6 Sudoku. The thermometer grows from its bulb. The two cages add up to their sums. A white dot joins digits that differ by 1. A black dot joins digits where one is twice the other.",
        difficulty: "easy",
        tags: ["sudoku", "thermometer", "killer", "kropki"],
    },
    geometry: { type: "grid", width: 6, height: 6, boxWidth: 3, boxHeight: 2 },
    domain: { values: [1, 2, 3, 4, 5, 6] },
    givens: givensFromRows([".2....", "...1..", ".....4", "5.....", "...6..", ".....2"]),
    constraints: [
        { use: "sudoku" },
        { use: "thermometer", cells: ["r3c3", "r4c3", "r4c2"], color: "var(--accent)", style: { opacity: 0.8 } },
        { use: "killer", cells: ["r1c1", "r1c2", "r2c1"], sum: 7 },
        { use: "killer", cells: ["r5c5", "r5c6"], sum: 9 },
        { use: "kropkiDifference", cells: ["r2c2", "r2c3"] },
        { use: "kropkiRatio", cells: ["r5c2", "r5c3"] },
    ],
    solution: givensFromRows(["123456", "456123", "231564", "564231", "312645", "645312"]),
};
