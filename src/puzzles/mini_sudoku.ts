/**
 * A 4x4 Sudoku written entirely in primitive constraints — no `use:` anywhere,
 * so it does not touch `src/definitions` at all. This is the acceptance test for
 * "delete the definitions and the runtime doesn't care": this puzzle still
 * compiles, evaluates, and plays.
 */

import type { PuzzleDefinition } from "@/runtime/puzzle.ts";
import { givensFromRows } from "@/puzzles/grid_text.ts";

export const miniSudoku: PuzzleDefinition = {
    version: 1,
    metadata: {
        id: "mini-sudoku",
        title: "Mini Sudoku (primitive-only)",
        description: "4x4, defined with raw allDifferent constraints and no variant definitions.",
        difficulty: "trivial",
        tags: ["sudoku", "primitive"],
    },
    geometry: { type: "grid", width: 4, height: 4, boxWidth: 2, boxHeight: 2 },
    domain: { values: [1, 2, 3, 4] },
    givens: givensFromRows(["1...", "..1.", ".1..", "...1"]),
    solution: givensFromRows(["1234", "3412", "2143", "4321"]),
    constraints: [
        ["allDifferent", ["cells", "row:0"]],
        ["allDifferent", ["cells", "row:1"]],
        ["allDifferent", ["cells", "row:2"]],
        ["allDifferent", ["cells", "row:3"]],
        ["allDifferent", ["cells", "col:0"]],
        ["allDifferent", ["cells", "col:1"]],
        ["allDifferent", ["cells", "col:2"]],
        ["allDifferent", ["cells", "col:3"]],
        ["allDifferent", ["cells", ["r1c1", "r1c2", "r2c1", "r2c2"]]],
        ["allDifferent", ["cells", ["r1c3", "r1c4", "r2c3", "r2c4"]]],
        ["allDifferent", ["cells", ["r3c1", "r3c2", "r4c1", "r4c2"]]],
        ["allDifferent", ["cells", ["r3c3", "r3c4", "r4c3", "r4c4"]]],
    ],
};
