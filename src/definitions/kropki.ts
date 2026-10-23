/**
 * Kropki dots between two cells: a white/"difference" dot means the two
 * values differ by exactly `value` (default 1, i.e. consecutive); a
 * black/"ratio" dot means one is exactly `value` times the other (default 2).
 * Draws the dot at the midpoint between the two cells.
 */

import { requireCellList, type ConstraintDefinition, type DefinitionOutput } from "@/definitions/types.ts";
import type { Expr } from "@/runtime/expression.ts";
import type { VisualObject } from "@/runtime/puzzle.ts";

const dotDefinition = (kind: "difference" | "ratio", defaultValue: number): ConstraintDefinition =>
    (params, ctx): DefinitionOutput | Error => {
        const cells = requireCellList(params, "cells", ctx);
        if (cells instanceof Error) return new Error(`kropki ${kind}: ${cells.message}`);
        if (cells.length !== 2) return new Error(`kropki ${kind}: needs exactly 2 cells`);

        const raw = params.value;
        const value = typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : defaultValue;

        const [a, b] = cells;
        const va: Expr = ["value", a];
        const vb: Expr = ["value", b];
        const expr: Expr =
            kind === "difference"
                ? ["or", ["==", ["-", va, vb], value], ["==", ["-", vb, va], value]]
                : ["or", ["==", va, ["*", value, vb]], ["==", vb, ["*", value, va]]];

        const ca = ctx.geometry.center(a);
        const cb = ctx.geometry.center(b);
        const objects: VisualObject[] = [
            {
                kind: "circle",
                at: { x: (ca.x + cb.x) / 2, y: (ca.y + cb.y) / 2 },
                r: 0.12,
                style:
                    kind === "difference"
                        ? { fill: "#fff", stroke: "var(--ink)", strokeWidth: 0.02, z: 3 }
                        : { fill: "var(--ink)", stroke: "var(--ink)", strokeWidth: 0.02, z: 3 },
            },
        ];

        return {
            constraints: [{ expr, label: `kropki ${kind} ${a}-${b} (${value})` }],
            objects,
        };
    };

export const kropkiDifference = dotDefinition("difference", 1);
export const kropkiRatio = dotDefinition("ratio", 2);
