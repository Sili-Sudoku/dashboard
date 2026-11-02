/**
 * Palindrome: the digits along a line read the same forwards and backwards.
 * That is, cell i equals cell (n-1-i) for every i. The definition draws a path,
 * like a thermometer, but the path has no order.
 */

import { requireCellList, type ConstraintDefinition, type DefinitionOutput, type EmittedConstraint } from "@/definitions/types.ts";
import type { VisualObject } from "@/runtime/puzzle.ts";

export const palindrome: ConstraintDefinition = (params, ctx): DefinitionOutput | Error => {
    const cells = requireCellList(params, "cells", ctx);
    if (cells instanceof Error) return new Error(`palindrome: ${cells.message}`);
    if (cells.length < 2) return new Error("palindrome: needs 2 or more cells");

    const n = cells.length;
    const constraints: EmittedConstraint[] = [];
    for (let i = 0; i < Math.floor(n / 2); i++) {
        const a = cells[i];
        const b = cells[n - 1 - i];
        constraints.push({ expr: ["==", ["value", a], ["value", b]], label: `palindrome ${a}=${b}` });
    }

    const objects: VisualObject[] = [
        { kind: "path", cells, style: { stroke: "var(--palindrome)", strokeWidth: 0.2, opacity: 0.5, z: 1 } },
    ];

    return { constraints, objects };
};

palindrome.schema = {
    label: "Palindrome",
    fields: [
        { kind: "cells", key: "cells", label: "Path", min: 2 },
    ],
};

palindrome.rule = "The digits on a palindrome line must be the same when you read the line from each end.";
