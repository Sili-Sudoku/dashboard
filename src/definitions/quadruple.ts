/**
 * Quadruple: a small cell group (typically the 4 cells meeting at a grid
 * intersection, but the group size isn't assumed here) must collectively
 * contain each listed value at least as many times as it repeats in the
 * clue's `values` list — e.g. `values: [3, 3]` needs at least two 3s among
 * the cells. Drawn as the clue's digits inside a small filled circle at the
 * cells' shared corner, so the digits stay legible over the grid lines that
 * otherwise cross right through that point.
 */

import { requireCellList, type ConstraintDefinition, type DefinitionOutput, type EmittedConstraint } from "@/definitions/types.ts";
import type { VisualObject } from "@/runtime/puzzle.ts";

export const quadruple: ConstraintDefinition = (params, ctx): DefinitionOutput | Error => {
    const cells = requireCellList(params, "cells", ctx);
    if (cells instanceof Error) return new Error(`quadruple: ${cells.message}`);

    const rawValues = params.values;
    if (!Array.isArray(rawValues) || rawValues.length === 0) {
        return new Error('quadruple: "values" must be a non-empty array of numbers');
    }
    const values: number[] = [];
    for (const v of rawValues) {
        if (typeof v !== "number" || !Number.isFinite(v)) {
            return new Error(`quadruple: "values" contains a non-number: ${JSON.stringify(v)}`);
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
