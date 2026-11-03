/**
 * Odd/even markers: the value of the cell must be odd (or even). The definition
 * uses the domain of the puzzle and does not assume 1-9, so it works for any
 * domain size. The marker is a small gray filled circle (odd) or square (even)
 * under the digit. It is already behind the digit in z-order, because the
 * renderer always draws digits after constraint shapes. It needs no z change.
 */

import {
    requireCellList,
    type CompileContext,
    type ConstraintDefinition,
    type DefinitionOutput,
    type EmittedConstraint,
} from "@/definitions/types.ts";
import type { Expr } from "@/runtime/expression.ts";
import type { CellId, Geometry } from "@/runtime/geometry.ts";
import type { VisualObject } from "@/runtime/puzzle.ts";

const resolveCells = (params: Readonly<Record<string, unknown>>, ctx: CompileContext): CellId[] | Error => {
    if (typeof params.cell === "string") {
        if (!ctx.geometry.has(params.cell)) return new Error(`"cell" is not a valid cell id`);
        return [params.cell];
    }
    if (params.cells !== undefined) return requireCellList(params, "cells", ctx);
    return new Error('expected a "cell" or "cells" parameter');
};

const MARKER_STYLE = { fill: "var(--line)", strokeWidth: 0 } as const;

const markerFor = (parity: "odd" | "even", cell: CellId, geometry: Geometry): VisualObject => {
    if (parity === "odd") return { kind: "circle", at: cell, r: 0.28, style: MARKER_STYLE };
    const c = geometry.center(cell);
    const half = 0.3;
    return { kind: "rect", at: { x: c.x - half, y: c.y - half }, w: half * 2, h: half * 2, style: MARKER_STYLE };
};

const parityDefinition =
    (parity: "odd" | "even"): ConstraintDefinition =>
    (params, ctx): DefinitionOutput | Error => {
        const cells = resolveCells(params, ctx);
        if (cells instanceof Error) return new Error(`${parity}: ${cells.message}`);

        const matching = ctx.domain.filter((v) => (v % 2 === 0) === (parity === "even"));
        if (matching.length === 0) return new Error(`${parity}: no value in the puzzle domain is ${parity}`);

        const constraints: EmittedConstraint[] = cells.map((cell) => ({
            expr: ["or", ...matching.map((v): Expr => ["==", ["value", cell], v])] as Expr,
            label: `${cell} is ${parity}`,
        }));

        const objects: VisualObject[] = cells.map((cell) => markerFor(parity, cell, ctx.geometry));

        return { constraints, objects };
    };

export const odd = parityDefinition("odd");
export const even = parityDefinition("even");

odd.schema = {
    label: "Odd marker",
    fields: [{ kind: "cells", key: "cells", label: "Cells", min: 1 }],
};

even.schema = {
    label: "Even marker",
    fields: [{ kind: "cells", key: "cells", label: "Cells", min: 1 }],
};

odd.rule = "A cell with a grey circle must contain an odd digit.";
even.rule = "A cell with a grey square must contain an even digit.";
