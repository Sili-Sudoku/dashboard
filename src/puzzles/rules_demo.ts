/**
 * Dynamic rules in a 4x4 Sudoku that starts as a 4x3 board.
 * The bottom row does not exist (not drawn, not selectable) until the three rows above it
 * are filled with distinct digits. Then a green line lights the left column.
 * Each `when` is an ordinary expression over the board. The same language that writes constraints
 * also writes triggers. Nothing is stored. The board
 * shows what the current digits say (undo a digit and the bottom row vanishes again).
 */

import type { PuzzleDefinition } from "@/runtime/puzzle.ts";
import { givensFromRows } from "@/puzzles/grid_text.ts";

export const rulesDemo: PuzzleDefinition = {
    version: 1,
    metadata: {
        id: "rules-demo",
        title: "Growing Sudoku (dynamic rules)",
        author: "runtime demo",
        description:
            "The puzzle starts as a 4x3 board. When the first three rows each contain four different digits, a fourth row appears. When the left column contains four different digits, a green line shows next to it. The JSON of the puzzle defines both rules.",
        difficulty: "trivial",
        tags: ["sudoku", "dynamic-rules"],
    },
    geometry: { type: "grid", width: 4, height: 4, boxWidth: 2, boxHeight: 2 },
    domain: { values: [1, 2, 3, 4] },
    givens: givensFromRows(["1...", "..1.", ".1..", "...1"]),
    solution: givensFromRows(["1234", "3412", "2143", "4321"]),
    objects: [
        {
            id: "column-glow",
            kind: "path",
            cells: ["r1c1", "r2c1", "r3c1", "r4c1"],
            style: { stroke: "#3aa76d", strokeWidth: 0.2, opacity: 0.5 },
        },
    ],
    constraints: [{ use: "sudoku" }],
    rules: [
        {
            id: "grow-bottom-row",
            when: [
                "and",
                ["allDifferent", ["cells", "row:0"]],
                ["allDifferent", ["cells", "row:1"]],
                ["allDifferent", ["cells", "row:2"]],
            ],
            then: { appear: ["row:3"] },
        },
        { id: "light-column", when: ["allDifferent", ["cells", "col:0"]], then: { show: ["column-glow"] } },
    ],
};
