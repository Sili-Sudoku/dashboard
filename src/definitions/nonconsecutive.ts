/**
 * Nonconsecutive: no two orthogonally adjacent cells hold consecutive values.
 * It applies to the whole grid. Unlike antiknight/antiking, it needs only the generic
 * `neighbors()` of `Geometry`. So it works on any geometry that has orthogonal
 * adjacency, not only grids.
 */

import type { ConstraintDefinition, DefinitionOutput, EmittedConstraint } from "@/definitions/types.ts";

export const nonconsecutive: ConstraintDefinition = (_params, ctx): DefinitionOutput | Error => {
    const constraints: EmittedConstraint[] = [];
    const seen = new Set<string>();
    for (const a of ctx.geometry.cells) {
        for (const b of ctx.geometry.neighbors(a)) {
            const key = a < b ? `${a}|${b}` : `${b}|${a}`;
            if (seen.has(key)) continue;
            seen.add(key);
            constraints.push({
                expr: [
                    "and",
                    ["!=", ["-", ["value", a], ["value", b]], 1],
                    ["!=", ["-", ["value", b], ["value", a]], 1],
                ],
                label: `nonconsecutive ${a}-${b}`,
            });
        }
    }
    return { constraints };
};

nonconsecutive.schema = {
    label: "Nonconsecutive (global)",
    fields: [],
};

nonconsecutive.rule = "Two cells that share an edge cannot contain digits that follow each other, for example 4 and 5.";
