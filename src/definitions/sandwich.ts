/**
 * Sandwich sum: the cells strictly between the minimum and maximum values of the domain
 * in a line (row/column) sum to a target. The cells are not known until solve time.
 * So the definition compiles to a conjunction over every possible (min-position,
 * max-position) pair in the line. This needs no new runtime primitive.
 * The line is short and fixed at compile time, so the pair count is small.
 */

import { requireCellList, requireNumber, type ConstraintDefinition, type DefinitionOutput } from "@/definitions/types.ts";
import type { Expr } from "@/runtime/expression.ts";

export const sandwich: ConstraintDefinition = (params, ctx): DefinitionOutput | Error => {
    const cells = requireCellList(params, "cells", ctx);
    if (cells instanceof Error) return new Error(`sandwich: ${cells.message}`);
    if (cells.length < 2) return new Error("sandwich: needs at least 2 cells");

    const sum = requireNumber(params, "sum");
    if (sum instanceof Error) return new Error(`sandwich: ${sum.message}`);

    const minV = Math.min(...ctx.domain);
    const maxV = Math.max(...ctx.domain);
    if (minV === maxV) return new Error("sandwich: puzzle domain has only one value; the clue is meaningless");

    const terms: Expr[] = [];
    for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
            const between = cells.slice(i + 1, j);
            const sumExpr: Expr = between.length > 0 ? ["sum", ["cells", [...between]]] : 0;
            const premise: Expr = [
                "or",
                ["and", ["==", ["value", cells[i]], minV], ["==", ["value", cells[j]], maxV]],
                ["and", ["==", ["value", cells[i]], maxV], ["==", ["value", cells[j]], minV]],
            ];
            terms.push(["implies", premise, ["==", sumExpr, sum]]);
        }
    }

    // The clue is just outside the line, in line with it, before its first cell.
    // For a full row/column this is beyond the grid, so the renderer adds a margin for it (#130).
    const first = ctx.geometry.center(cells[0]);
    const second = ctx.geometry.center(cells[1]);
    const length = Math.hypot(second.x - first.x, second.y - first.y) || 1;
    const clueAt = {
        x: first.x - (second.x - first.x) / length,
        y: first.y - (second.y - first.y) / length,
    };

    return {
        constraints: [{ expr: ["and", ...terms], label: `sandwich ${cells.join(",")} = ${sum}` }],
        objects: [{ kind: "text", at: clueAt, text: String(sum), style: { fontSize: 0.4, bold: true } }],
    };
};

sandwich.schema = {
    label: "Sandwich sum",
    fields: [
        { kind: "cells", key: "cells", label: "Full line", min: 2 },
        { kind: "number", key: "sum", label: "Sum", required: true },
    ],
};
