/**
 * Disjoint groups: cell N of every box holds a different value from cell N of
 * every other box (equivalently: the N-th cells of each box form their own
 * allDifferent group). Reads `ctx.geometry`'s own `box:` selectors generically,
 * the same way `sudoku.ts` does — this file has no idea what a box's shape is.
 */

import type { CellId } from "@/runtime/geometry.ts";
import type { ConstraintDefinition, DefinitionOutput, EmittedConstraint } from "@/definitions/types.ts";

export const disjointgroups: ConstraintDefinition = (_params, ctx): DefinitionOutput | Error => {
    const groups: CellId[][] = [];
    for (let i = 0; ; i++) {
        const g = ctx.geometry.resolveRegion(`box:${i}`);
        if (!g) break;
        groups.push([...g]);
    }
    if (groups.length === 0) {
        return new Error("disjointgroups: geometry has no box regions to pair positions across");
    }
    const size = groups[0].length;
    if (groups.some((g) => g.length !== size)) {
        return new Error("disjointgroups: box regions are not uniform in size");
    }

    const constraints: EmittedConstraint[] = [];
    for (let p = 0; p < size; p++) {
        const atPosition = groups.map((g) => g[p]);
        constraints.push({
            expr: ["allDifferent", ["cells", [...atPosition]]],
            label: `disjoint group position ${p}`,
        });
    }
    return { constraints };
};
