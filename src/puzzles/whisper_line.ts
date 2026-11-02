/**
 * German Whispers: a variant that is NOT a built-in definition.
 *
 * There is no `{ "use": "whispers" }` and no `whispers` entry in
 * `src/definitions`. The rule ("adjacent digits on the green line differ by at
 * least 5") lives only in the `constraints` of this puzzle, as primitive
 * expressions: `or( (a - b) >= 5 , (b - a) >= 5 )` for each adjacent pair.
 *
 * The engine never learns the word "whisper". It sees only `or`, `>=`, `-` and `value`.
 * It already had these operators. Open this puzzle in the Author view to
 * read the expanded constraints in the JSON.
 */

import type { Expr } from "@/runtime/expression.ts";
import type { CellId } from "@/runtime/geometry.ts";
import type { ConstraintSpec, PuzzleDefinition } from "@/runtime/puzzle.ts";
import { givensFromRows, omit } from "@/puzzles/grid_text.ts";

/** |value(a) - value(b)| >= 5, written with primitive operators only. */
const differBy = (a: CellId, b: CellId, min: number): Expr => [
    "or",
    [">=", ["-", ["value", a], ["value", b]], min],
    [">=", ["-", ["value", b], ["value", a]], min],
];

/** One named rule per adjacent pair along a path, so they group together as "German whispers". */
const whisperLine = (cells: readonly CellId[], min = 5): ConstraintSpec[] =>
    cells.slice(1).map((cell, i) => ({ rule: differBy(cells[i], cell, min), name: "German whispers" }));

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
            "The green line is a German Whispers line. It is not a built-in feature. Its rule is primitive constraints in the JSON of this puzzle.",
        difficulty: "medium",
        tags: ["sudoku", "german-whispers", "primitive-variant"],
    },
    geometry: { type: "grid", width: 9, height: 9 },
    domain: { values: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
    // Clear the two clues on the line, so the whisper rule does the work.
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
