/**
 * Shared helpers for runtime tests.
 * They build an EvalContext over a grid with a simple in-memory board.
 */

import { createGeometry, type CellId } from "@/runtime/geometry.ts";
import type { EvalContext, Expr } from "@/runtime/expression.ts";
import { evalExpr } from "@/runtime/operators.ts";

export interface TestCtxOptions {
    width?: number;
    height?: number;
    boxWidth?: number;
    boxHeight?: number;
    domain?: readonly number[];
    values?: Readonly<Record<CellId, number>>;
    regions?: Readonly<Record<string, readonly CellId[]>>;
}

export const makeCtx = (options: TestCtxOptions = {}): EvalContext => {
    const geometry = createGeometry({
        type: "grid",
        width: options.width ?? 9,
        height: options.height ?? 9,
        boxWidth: options.boxWidth,
        boxHeight: options.boxHeight,
    });
    const values = options.values ?? {};
    return {
        geometry,
        regions: options.regions ?? {},
        domain: options.domain ?? [1, 2, 3, 4, 5, 6, 7, 8, 9],
        valueOf: (cell) => (cell in values ? values[cell] : null),
    };
};

export const run = (expr: Expr, options?: TestCtxOptions) => evalExpr(expr, makeCtx(options));
