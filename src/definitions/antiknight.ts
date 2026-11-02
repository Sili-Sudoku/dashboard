/**
 * Antiknight: no two cells a chess knight's move apart share a value.
 * It applies to the whole grid. There is no cell list per clue.
 * This is a grid concept: not every `Geometry` has a defined knight move.
 * So it parses grid cell ids directly. `sudoku.ts` uses `row:`/`col:`/`box:`
 * selectors in the same way, and the engine does not need to know Sudoku.
 */

import type { ConstraintDefinition, DefinitionOutput, EmittedConstraint } from "@/definitions/types.ts";
import { parseGridCellId } from "@/runtime/geometry.ts";

export const antiknight: ConstraintDefinition = (_params, ctx): DefinitionOutput | Error => {
    const coords = new Map<string, { row: number; col: number }>();
    for (const cell of ctx.geometry.cells) {
        const rc = parseGridCellId(cell);
        if (!rc) return new Error("antiknight: the geometry is not a grid. The cell ids are not r{row}c{col}");
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

antiknight.rule = "Two cells that are a knight's move apart cannot contain the same digit. A knight's move is two cells in one direction and one cell to the side.";
