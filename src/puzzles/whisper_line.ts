/**
 * German Whispers — a variant that is NOT a built-in definition.
 *
 * There is no `{ "use": "whispers" }` and no `whispers` entry in
 * `src/definitions`. The rule ("adjacent digits on the green line differ by at
 * least 5") lives entirely in this puzzle's `constraints` as primitive
 * expressions: `or( (a - b) >= 5 , (b - a) >= 5 )` for each adjacent pair.
 *
 * The engine never learns the word "whisper". It only sees `or`, `>=`, `-`,
 * `value` — operators it already had. Open this puzzle in the Author view to
 * read the expanded constraints in the JSON.
 */

import type { Expr } from "@/runtime/expression.ts";
import type { CellId } from "@/runtime/geometry.ts";
import type { PuzzleDefinition } from "@/runtime/puzzle.ts";
import { givensFromRows, omit } from "@/puzzles/grid_text.ts";

/** |value(a) - value(b)| >= 5, written with primitive operators only. */
const differBy = (a: CellId, b: CellId, min: number): Expr => [
    "or",
    [">=", ["-", ["value", a], ["value", b]], min],
    [">=", ["-", ["value", b], ["value", a]], min],
];

/** One constraint per adjacent pair along a path. */
const whisperLine = (cells: readonly CellId[], min = 5): Expr[] =>
    cells.slice(1).map((cell, i) => differBy(cells[i], cell, min));

const LINE: readonly CellId[] = ["r1c4", "r2c4", "r2c5", "r3c5"];

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

export const whisperLinePuzzle: PuzzleDefinition = {
    version: 1,
    metadata: {
        id: "whisper-line",
        title: "Whisper Line (ad-hoc variant)",
        author: "runtime demo",
        description:
            "The green line is a German-Whispers line — but it is not a built-in feature. Its rule is the primitive constraints written directly in this puzzle's JSON.",
        difficulty: "medium",
        tags: ["sudoku", "german-whispers", "primitive-variant"],
    },
    geometry: { type: "grid", width: 9, height: 9 },
    domain: { values: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
    // clear the two clues that sit on the line so the whisper rule does the work
    givens: omit(BASE_GIVENS, ["r2c4", "r2c5"]),
    solution: givensFromRows([
        "534678912",
        "672195348",
        "198342567",
        "859761423",
        "426853791",
        "713924856",
        "961537284",
        "287419635",
        "345286179",
    ]),
    objects: [
        {
            kind: "path",
            cells: LINE,
            style: { stroke: "#3aa76d", strokeWidth: 0.22, opacity: 0.7 },
        },
    ],
    constraints: [
        { use: "sudoku" },
        // --- the entire "German Whispers" variant, inline, no definition ---
        ...whisperLine(LINE),
    ],
    presentation: { cellSize: 64 },
};
