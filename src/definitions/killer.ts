/**
 * Killer cage: the cells are all different and (optionally) sum to a target.
 * The definition adds a dashed "cage" outline with the sum in the corner.
 *
 * `distinct: false` makes this a plain sum-only clue (no allDifferent).
 * An example is a "little killer" diagonal. Its cells are not always distinct,
 * unlike the cells of a cage. The definition draws a sum label at the first cell
 * and no cage outline, because there is no enclosed region to outline.
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

    const distinct = params.distinct !== false;

    const constraints: EmittedConstraint[] = [];
    if (distinct) {
        constraints.push({ expr: ["allDifferent", ["cells", [...cells]]], label: `cage ${cells.join(",")} distinct` });
    }
    if (sum !== undefined) {
        constraints.push({
            expr: ["==", ["sum", ["cells", [...cells]]], sum],
            label: `cage ${cells.join(",")} sums to ${sum}`,
        });
    }

    const objects: VisualObject[] = distinct
        ? [
              {
                  kind: "cage",
                  cells,
                  label: sum !== undefined ? String(sum) : undefined,
                  style: { stroke: "var(--cage)", strokeWidth: 0.02, dashed: true, z: 2 },
              },
          ]
        : sum !== undefined
          ? [{ kind: "text", at: cells[0], text: String(sum), style: { fontSize: 0.3 } }]
          : [];

    return { constraints, objects };
};

killer.schema = {
    label: "Killer cage",
    fields: [
        { kind: "cells", key: "cells", label: "Cage cells", min: 1 },
        { kind: "number", key: "sum", label: "Sum (optional)", required: false },
        { kind: "boolean", key: "distinct", label: "All different", default: true },
    ],
};

killer.rule = "The digits in a cage must add up to the small number in its corner. The digits in a cage cannot be the same, unless the puzzle says they can.";
