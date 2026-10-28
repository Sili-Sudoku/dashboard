/**
 * Between line: the two circled endpoints bound every strictly-interior cell's
 * value (order-independent — whichever endpoint turns out higher). Drawn as a
 * path with circles at the endpoints.
 */

import { requireCellList, type ConstraintDefinition, type DefinitionOutput } from "@/definitions/types.ts";
import type { Expr } from "@/runtime/expression.ts";
import type { VisualObject } from "@/runtime/puzzle.ts";

export const betweenline: ConstraintDefinition = (params, ctx): DefinitionOutput | Error => {
    const cells = requireCellList(params, "cells", ctx);
    if (cells instanceof Error) return new Error(`betweenline: ${cells.message}`);
    if (cells.length < 3) return new Error("betweenline: needs at least 2 endpoints and 1 interior cell");

    const end0 = cells[0];
    const end1 = cells[cells.length - 1];
    const middle = cells.slice(1, -1);

    const bounded = (lo: string, hi: string): Expr => [
        "and",
        ["<", ["value", lo], ["value", hi]],
        ...middle.map((m): Expr => ["and", ["<", ["value", lo], ["value", m]], ["<", ["value", m], ["value", hi]]]),
    ];

    const objects: VisualObject[] = [
        { kind: "path", cells, style: { stroke: "var(--betweenline)", strokeWidth: 0.2, opacity: 0.5, z: 1 } },
        { kind: "circle", at: end0, r: 0.4, style: { stroke: "var(--betweenline)", fill: "none", strokeWidth: 0.04, z: 2 } },
        { kind: "circle", at: end1, r: 0.4, style: { stroke: "var(--betweenline)", fill: "none", strokeWidth: 0.04, z: 2 } },
    ];

    return {
        constraints: [
            { expr: ["or", bounded(end0, end1), bounded(end1, end0)], label: `betweenline ${end0}..${end1}` },
        ],
        objects,
    };
};
