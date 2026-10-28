/**
 * Palindrome: the digits along a line read the same forwards and backwards,
 * i.e. cell i equals cell (n-1-i) for every i. Drawn as a path, like a
 * thermometer, but with no implied ordering.
 */

import { requireCellList, type ConstraintDefinition, type DefinitionOutput, type EmittedConstraint } from "@/definitions/types.ts";
import type { VisualObject } from "@/runtime/puzzle.ts";

export const palindrome: ConstraintDefinition = (params, ctx): DefinitionOutput | Error => {
    const cells = requireCellList(params, "cells", ctx);
    if (cells instanceof Error) return new Error(`palindrome: ${cells.message}`);
    if (cells.length < 2) return new Error("palindrome: needs at least 2 cells");

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
