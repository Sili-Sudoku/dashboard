/**
 * Kropki dots between two cells. A white/"difference" dot means that the two
 * values differ by exactly `value` (default 1, that is consecutive).
 * A black/"ratio" dot means that one value is exactly `value` times the other (default 2).
 * The definition draws the dot at the midpoint between the two cells.
 */

import { requireCellList, type ConstraintDefinition, type DefinitionOutput } from "@/definitions/types.ts";
import type { Expr } from "@/runtime/expression.ts";
import type { VisualObject } from "@/runtime/puzzle.ts";

const dotDefinition = (kind: "difference" | "ratio", defaultValue: number): ConstraintDefinition =>
    (params, ctx): DefinitionOutput | Error => {
        const cells = requireCellList(params, "cells", ctx);
        if (cells instanceof Error) return new Error(`kropki ${kind}: ${cells.message}`);
        if (cells.length !== 2) return new Error(`kropki ${kind}: needs 2 cells`);

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
        const mid = { x: (ca.x + cb.x) / 2, y: (ca.y + cb.y) / 2 };
        // The colors are fixed black and white on purpose, not the theme "ink".
        // The color of the dot is the clue (white = difference, black = ratio).
        // If it followed --ink into dark mode, both dots would become the same
        // near-white, and the distinction between them would be lost.
        const isCustomValue = value !== defaultValue;
        const objects: VisualObject[] = [
            {
                kind: "circle",
                at: mid,
                r: isCustomValue ? 0.16 : 0.12,
                style:
                    kind === "difference"
                        ? { fill: "#fff", stroke: "#000", strokeWidth: 0.02, z: 3 }
                        : { fill: "#000", stroke: "#000", strokeWidth: 0.02, z: 3 },
            },
        ];
        // A non-default value is not visible without a label.
        // The plain dot implies only the usual default (1 for difference, 2 for ratio).
        // A real f-puzzles export also shows a digit here when the value is not the default.
        if (isCustomValue) {
            objects.push({
                kind: "text",
                at: mid,
                text: String(value),
                style: { stroke: kind === "difference" ? "#000" : "#fff", fontSize: 0.17, z: 4 },
            });
        }

        return {
            constraints: [{ expr, label: `kropki ${kind} ${a}-${b} (${value})` }],
            objects,
        };
    };

export const kropkiDifference = dotDefinition("difference", 1);
export const kropkiRatio = dotDefinition("ratio", 2);

kropkiDifference.schema = {
    label: "Kropki (white dot)",
    fields: [
        { kind: "cells", key: "cells", label: "2 adjacent cells", min: 2, max: 2 },
        { kind: "number", key: "value", label: "Difference (default 1)", required: false },
    ],
};

kropkiRatio.schema = {
    label: "Kropki (black dot)",
    fields: [
        { kind: "cells", key: "cells", label: "2 adjacent cells", min: 2, max: 2 },
        { kind: "number", key: "value", label: "Ratio (default 2)", required: false },
    ],
};

kropkiDifference.rule = "Two cells with a white dot between them must have digits that differ by the number on the dot. If the dot has no number, the difference is 1.";
kropkiRatio.rule = "Two cells with a black dot between them must have digits where the larger digit is the smaller digit times the number on the dot. If the dot has no number, use 2.";
