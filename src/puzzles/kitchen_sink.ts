/**
 * Variant-coverage showcase: one instance of every registered constraint
 * definition on a single 9x9 board. It also covers diagonal regions (via `extraRegions` of `sudoku`)
 * and littlekillersum (via `distinct: false` of `killer`).
 *
 * This is NOT a playable puzzle. It has no `solution` and no `givens`.
 * Several variants here are global, whole-grid rules (`antiknight`, `antiking`, `nonconsecutive`,
 * `disjointgroups`, both diagonals, on top of classic Sudoku).
 * Each rule is reasonable alone. Stacked together with everything else on this board,
 * they are not known to share a completed grid.
 * To find out, you must run the solver of the project as an oracle and iterate.
 * That task is heavier than the purpose of this file, and different from it.
 * This file exercises the parameter *shape* of every definition against the compiler at once.
 * It is a reference for what each `ConstraintSpec` looks like in practice.
 * See `src/puzzles/kitchen_sink.test.ts`. It checks structural validity and
 * successful compilation, not solvability. For a playable composite
 * puzzle, see `demo_mixed.ts`.
 *
 * Placement care, although the board needs no real solution:
 * The two equality-type variants (`palindrome`, `clone`) are placed so that their forced-equal
 * cell pairs never share a row, column, box, diagonal or disjoint-group position.
 * The pairs are also never a knight's or king's move apart.
 * Otherwise they contradict a global allDifferent/inequality rule by construction,
 * for any values (sloppy even if the board is never solved).
 * Also, `kropkiDifference` has value 3, not the conventional default of 1.
 * A default-1 difference dot between two orthogonally-adjacent cells
 * always contradicts the global `nonconsecutive` rule that is also present.
 * One rule requires a difference of exactly 1 for that pair and the other forbids it.
 * This is a real logical impossibility, not just an unsolved board.
 */

import type { PuzzleDefinition } from "@/runtime/puzzle.ts";

const diagonalTLBR = Array.from({ length: 9 }, (_, i) => `r${i + 1}c${i + 1}`);
const diagonalBLTR = Array.from({ length: 9 }, (_, i) => `r${i + 1}c${9 - i}`);
const col9 = Array.from({ length: 9 }, (_, i) => `r${i + 1}c9`);

export const kitchenSink: PuzzleDefinition = {
    version: 1,
    metadata: {
        id: "kitchen-sink",
        title: "Every Variant, One Grid",
        author: "runtime demo",
        description:
            "Every registered constraint definition exercised once on a single board. Not a playable puzzle — see the file's header comment.",
        difficulty: "n/a",
        tags: [
            "sudoku",
            "diagonal",
            "antiknight",
            "antiking",
            "nonconsecutive",
            "disjointgroups",
            "killer",
            "littlekillersum",
            "thermometer",
            "arrow",
            "kropkiDifference",
            "kropkiRatio",
            "odd",
            "even",
            "palindrome",
            "clone",
            "quadruple",
            "minimum",
            "maximum",
            "xv",
            "sandwich",
            "betweenline",
            "negative",
            "showcase",
        ],
    },
    geometry: { type: "grid", width: 9, height: 9 },
    domain: { values: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
    regions: {
        "diagonal:tlbr": diagonalTLBR,
        "diagonal:bltr": diagonalBLTR,
    },
    constraints: [
        { use: "sudoku", extraRegions: ["diagonal:tlbr", "diagonal:bltr"] },
        { use: "antiknight" },
        { use: "antiking" },
        { use: "nonconsecutive" },
        { use: "disjointgroups" },

        // Killer cage, and littlekillersum that reuses killer with distinct:false
        // (a diagonal-shaped run of cells, summed but not required distinct).
        { use: "killer", cells: ["r2c1", "r2c2", "r3c1"], sum: 15 },
        { use: "killer", cells: ["r1c6", "r2c7", "r3c8", "r4c9"], sum: 20, distinct: false },

        { use: "thermometer", cells: ["r4c1", "r5c1", "r6c1"] },
        { use: "arrow", bulb: "r9c6", cells: ["r9c7", "r9c8"] },

        // value: 3, not the conventional 1. See header comment.
        { use: "kropkiDifference", cells: ["r1c7", "r1c8"], value: 3 },
        { use: "kropkiRatio", cells: ["r7c5", "r7c6"] },

        { use: "odd", cell: "r3c4" },
        { use: "even", cell: "r3c5" },

        // Mirror pairs (r2c3,r7c8) and (r4c2,r6c7). r5c5 is the unconstrained
        // center. See header comment for why these specific cells.
        { use: "palindrome", cells: ["r2c3", "r4c2", "r5c5", "r6c7", "r7c8"] },

        { use: "clone", cells: ["r1c4", "r1c5"], cloneCells: ["r8c7", "r8c8"] },

        { use: "quadruple", cells: ["r6c2", "r6c3", "r7c2", "r7c3"], values: [4, 6] },

        { use: "minimum", cell: "r6c6" },
        { use: "maximum", cell: "r8c4" },

        { use: "xv", cells: ["r4c6", "r4c7"], target: 10 },

        { use: "sandwich", cells: col9, sum: 17 },

        { use: "betweenline", cells: ["r5c7", "r5c8", "r5c9"] },

        // "Negative" global exclusions. They exclude the pairs already explicitly
        // dotted/marked above. See src/definitions/negative.ts.
        { use: "negativeDifference", excludePairs: [["r1c7", "r1c8"]] },
        { use: "negativeRatio", excludePairs: [["r7c5", "r7c6"]] },
        { use: "negativeXV", excludePairs: [["r4c6", "r4c7"]] },
    ],
    presentation: { cellSize: 64 },
};
