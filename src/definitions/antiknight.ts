/**
 * Antiknight: no two cells a chess knight's-move apart share a value. Applies
 * globally across the whole grid — there is no per-clue cell list. This is a
 * grid/chess concept (not every `Geometry` has a well-defined knight move), so
 * it leans on grid cell-id parsing directly, the same way `sudoku.ts` leans on
 * `row:`/`col:`/`box:` selectors without the engine needing to know Sudoku.
 */

import type { ConstraintDefinition, DefinitionOutput, EmittedConstraint } from "@/definitions/types.ts";
import { parseGridCellId } from "@/runtime/geometry.ts";

export const antiknight: ConstraintDefinition = (_params, ctx): DefinitionOutput | Error => {
    const coords = new Map<string, { row: number; col: number }>();
    for (const cell of ctx.geometry.cells) {
        const rc = parseGridCellId(cell);
        if (!rc) return new Error("antiknight: geometry is not a grid (cell ids aren't r{row}c{col})");
        coords.set(cell, rc);
    }

    const cells = [...coords.keys()];
    const constraints: EmittedConstraint[] = [];
    for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
            const a = cells[i];
            const b = cells[j];
            const ca = coords.get(a)!;
            const cb = coords.get(b)!;
            const dr = Math.abs(ca.row - cb.row);
            const dc = Math.abs(ca.col - cb.col);
            if ((dr === 1 && dc === 2) || (dr === 2 && dc === 1)) {
                constraints.push({ expr: ["!=", ["value", a], ["value", b]], label: `antiknight ${a}-${b}` });
            }
        }
    }
    return { constraints };
};

antiknight.schema = {
    label: "Antiknight (global)",
    fields: [],
};
