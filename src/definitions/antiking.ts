/**
 * Antiking: no two cells a chess king's move apart (including diagonals) share
 * a value. It applies to the whole grid, like `antiknight`.
 */

import type { ConstraintDefinition, DefinitionOutput, EmittedConstraint } from "@/definitions/types.ts";
import { parseGridCellId } from "@/runtime/geometry.ts";

export const antiking: ConstraintDefinition = (_params, ctx): DefinitionOutput | Error => {
    const coords = new Map<string, { row: number; col: number }>();
    for (const cell of ctx.geometry.cells) {
        const rc = parseGridCellId(cell);
        if (!rc) return new Error("antiking: the geometry is not a grid. The cell ids are not r{row}c{col}");
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
            if (dr <= 1 && dc <= 1 && (dr !== 0 || dc !== 0)) {
                constraints.push({ expr: ["!=", ["value", a], ["value", b]], label: `antiking ${a}-${b}` });
            }
        }
    }
    return { constraints };
};

antiking.schema = {
    label: "Antiking (global)",
    fields: [],
};
