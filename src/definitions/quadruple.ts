/**
 * Quadruple: a small group of cells (usually the 4 cells at a grid
 * intersection, but this code does not assume the group size) must together
 * contain each listed value at least as many times as it occurs in the
 * `values` list of the clue. For example, `values: [3, 3]` needs at least two 3s among
 * the cells. The definition draws the digits of the clue inside a small filled circle
 * at the shared corner of the cells. So the digits stay legible over the grid lines
 * that otherwise cross that point.
 */

import { requireCellList, type ConstraintDefinition, type DefinitionOutput, type EmittedConstraint } from "@/definitions/types.ts";
import type { VisualObject } from "@/runtime/puzzle.ts";

export const quadruple: ConstraintDefinition = (params, ctx): DefinitionOutput | Error => {
    const cells = requireCellList(params, "cells", ctx);
    if (cells instanceof Error) return new Error(`quadruple: ${cells.message}`);

    const rawValues = params.values;
    if (!Array.isArray(rawValues) || rawValues.length === 0) {
        return new Error('quadruple: "values" must be an array of 1 or more numbers');
    }
    const values: number[] = [];
    for (const v of rawValues) {
        if (typeof v !== "number" || !Number.isFinite(v)) {
            return new Error(`quadruple: "values" contains a value that is not a number: ${JSON.stringify(v)}`);
        }
        values.push(v);
    }

    const multiplicity = new Map<number, number>();
    for (const v of values) multiplicity.set(v, (multiplicity.get(v) ?? 0) + 1);

    const constraints: EmittedConstraint[] = [...multiplicity.entries()].map(([value, atLeast]) => ({
        expr: [">=", ["countValue", ["cells", [...cells]], value], atLeast],
        label: `quadruple ${cells.join(",")} has >= ${atLeast} ${value}`,
    }));

    const corner = ctx.geometry.anchor(cells[0], "br");
    const objects: VisualObject[] = [
        { kind: "circle", at: corner, r: 0.2, style: { fill: "var(--surface)", stroke: "var(--ink)", strokeWidth: 0.02, z: 2 } },
        { kind: "text", at: corner, text: values.join(""), style: { fontSize: 0.22, z: 3 } },
    ];

    return { constraints, objects };
};

quadruple.schema = {
    label: "Quadruple",
    fields: [
        { kind: "cells", key: "cells", label: "Cells (usually 4 around a corner)", min: 1 },
        { kind: "numberList", key: "values", label: "Required values" },
    ],
};

quadruple.rule = "The four cells around a circle must contain all the digits in the circle. If a digit shows two times, it must occur two times.";
