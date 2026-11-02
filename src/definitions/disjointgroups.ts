/**
 * Disjoint groups: cell N of every box holds a different value from cell N of
 * every other box. Equivalently, the N-th cells of each box form their own
 * allDifferent group. The definition reads the `box:` selectors of `ctx.geometry`
 * in a generic way, like `sudoku.ts`. This file does not know the shape of a box.
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
        return new Error("disjointgroups: the geometry has no box regions to pair positions");
    }
    const size = groups[0].length;
    if (groups.some((g) => g.length !== size)) {
        return new Error("disjointgroups: box regions are not the same size");
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

disjointgroups.schema = {
    label: "Disjoint groups (global)",
    fields: [],
};

disjointgroups.rule = "Cells that have the same position in their boxes cannot contain the same digit. For example, the top-left cells of all the boxes must be different.";
