/**
 * A 625-cell board whose only purpose is to be big: exercises the viewport
 * virtualization built for #48 (scroll around; only the cells near the
 * visible area ever hit the DOM). No givens — just a large grid with the
 * generic `sudoku` definition for structure, plus a generated valid solution
 * (standard band-shift construction) so it satisfies the same "every
 * built-in puzzle ships a working solution" contract as the others.
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
        description: "625 cells, to exercise viewport virtualization (#48). Scroll around the board.",
        difficulty: "medium",
        tags: ["demo", "large"],
    },
    geometry: { type: "grid", width: SIZE, height: SIZE, boxWidth: BOX, boxHeight: BOX },
    domain: { values: Array.from({ length: SIZE }, (_, i) => i + 1) },
    givens: {},
    solution: generateSolution(),
    constraints: [{ use: "sudoku" }],
};
