/**
 * Sandwich sum: the cells strictly between wherever the domain's minimum and
 * maximum values land in a line (row/column) sum to a target. Which cells
 * that is isn't known until solve time, so this compiles to a conjunction
 * over every possible (min-position, max-position) pair in the line rather
 * than needing a new runtime primitive — the line is short and fixed at
 * compile time, so the pair count is small.
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

    return {
        constraints: [{ expr: ["and", ...terms], label: `sandwich ${cells.join(",")} = ${sum}` }],
    };
};
