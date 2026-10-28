/**
 * Nonconsecutive: no two orthogonally-adjacent cells hold consecutive values.
 * Applies globally. Unlike antiknight/antiking, this only needs `Geometry`'s
 * generic `neighbors()`, so it works on any geometry with an orthogonal notion
 * of adjacency, not just grids.
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
