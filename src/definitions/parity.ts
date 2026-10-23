/**
 * Odd/even markers: the cell's value must be odd (or even). Computed against
 * the puzzle's actual domain rather than assuming 1-9, so it works for any
 * domain size.
 */

import {
    requireCellList,
    type CompileContext,
    type ConstraintDefinition,
    type DefinitionOutput,
    type EmittedConstraint,
} from "@/definitions/types.ts";
import type { Expr } from "@/runtime/expression.ts";
import type { CellId } from "@/runtime/geometry.ts";

const resolveCells = (params: Readonly<Record<string, unknown>>, ctx: CompileContext): CellId[] | Error => {
    if (typeof params.cell === "string") {
        if (!ctx.geometry.has(params.cell)) return new Error(`"cell" is not a valid cell id`);
        return [params.cell];
    }
    if (params.cells !== undefined) return requireCellList(params, "cells", ctx);
    return new Error('expected a "cell" or "cells" parameter');
};

const parityDefinition = (parity: "odd" | "even"): ConstraintDefinition =>
    (params, ctx): DefinitionOutput | Error => {
        const cells = resolveCells(params, ctx);
        if (cells instanceof Error) return new Error(`${parity}: ${cells.message}`);

        const matching = ctx.domain.filter((v) => (v % 2 === 0) === (parity === "even"));
        if (matching.length === 0) return new Error(`${parity}: no value in the puzzle domain is ${parity}`);

        const constraints: EmittedConstraint[] = cells.map((cell) => ({
            expr: ["or", ...matching.map((v): Expr => ["==", ["value", cell], v])] as Expr,
            label: `${cell} is ${parity}`,
        }));
        return { constraints };
    };

export const odd = parityDefinition("odd");
export const even = parityDefinition("even");
