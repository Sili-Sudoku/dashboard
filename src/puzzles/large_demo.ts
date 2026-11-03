/**
 * A 625-cell board that exists to be big. It exercises the viewport virtualization.
 * When you scroll, only the cells near the visible area go into the DOM. The puzzle has no givens.
 * It uses the generic `sudoku` definition for structure.
 * A generated valid solution (standard band-shift construction) satisfies the contract
 * that every built-in puzzle ships a working solution.
 */

import type { CellId } from "@/runtime/geometry.ts";
import { GridCellId } from "@/runtime/geometry.ts";
import type { PuzzleDefinition } from "@/runtime/puzzle.ts";

const BOX = 5;
const SIZE = BOX * BOX; // 25x25 = 625 cells

const generateSolution = (): Record<CellId, number> => {
    const out: Record<CellId, number> = {};
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            const v = (BOX * (r % BOX) + Math.floor(r / BOX) + c) % SIZE;
            out[GridCellId(r, c)] = v + 1;
        }
    }
    return out;
};

export const largeDemo: PuzzleDefinition = {
    version: 1,
    metadata: {
        id: "large-demo",
        title: "Large Demo (25x25)",
        author: "runtime demo",
        description: "A board with 625 cells to test the viewport. Scroll to move around the board.",
        difficulty: "medium",
        tags: ["demo", "large"],
    },
    geometry: { type: "grid", width: SIZE, height: SIZE, boxWidth: BOX, boxHeight: BOX },
    domain: { values: Array.from({ length: SIZE }, (_, i) => i + 1) },
    givens: {},
    solution: generateSolution(),
    constraints: [{ use: "sudoku" }],
};
