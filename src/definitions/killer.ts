/**
 * Killer cage: the cells are all different and (optionally) sum to a target.
 * Contributes a dashed "cage" outline with the sum printed in the corner.
 */

import {
    requireCellList,
    requireNumber,
    type ConstraintDefinition,
    type DefinitionOutput,
    type EmittedConstraint,
} from "@/definitions/types.ts";
import type { VisualObject } from "@/runtime/puzzle.ts";

export const killer: ConstraintDefinition = (params, ctx): DefinitionOutput | Error => {
    const cells = requireCellList(params, "cells", ctx);
    if (cells instanceof Error) return new Error(`killer: ${cells.message}`);

    const hasSum = params.sum !== undefined;
    let sum: number | undefined;
    if (hasSum) {
        const parsed = requireNumber(params, "sum");
        if (parsed instanceof Error) return new Error(`killer: ${parsed.message}`);
        sum = parsed;
    }

    const constraints: EmittedConstraint[] = [
        { expr: ["allDifferent", ["cells", [...cells]]], label: `cage ${cells.join(",")} distinct` },
    ];
    if (sum !== undefined) {
        constraints.push({
            expr: ["==", ["sum", ["cells", [...cells]]], sum],
            label: `cage ${cells.join(",")} sums to ${sum}`,
        });
    }

    const objects: VisualObject[] = [
        {
            kind: "cage",
            cells,
            label: sum !== undefined ? String(sum) : undefined,
            style: { stroke: "var(--cage)", strokeWidth: 0.02, dashed: true, z: 2 },
        },
    ];

    return { constraints, objects };
};
