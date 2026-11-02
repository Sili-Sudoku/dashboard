/**
 * XV: the two marked, orthogonally adjacent cells sum to a target. By convention
 * an "X" marker is 10 and a "V" marker is 5, but here the target is only a parameter.
 * The drawing is the same as in SudokuPad: a plain, borderless, fully opaque
 * white disc at the midpoint, just big enough to hide the grid line under it,
 * with the letter on top. The marker is on the cell border, where a grid line
 * would otherwise cross it.
 */

import {
    requireCellList,
    requireNumber,
    type ConstraintDefinition,
    type DefinitionOutput,
} from "@/definitions/types.ts";
import type { VisualObject } from "@/runtime/puzzle.ts";

export const xv: ConstraintDefinition = (params, ctx): DefinitionOutput | Error => {
    const cells = requireCellList(params, "cells", ctx);
    if (cells instanceof Error) return new Error(`xv: ${cells.message}`);
    if (cells.length !== 2) return new Error("xv: needs 2 cells");

    const target = requireNumber(params, "target");
    if (target instanceof Error) return new Error(`xv: ${target.message}`);

    const [a, b] = cells;
    const ca = ctx.geometry.center(a);
    const cb = ctx.geometry.center(b);
    const mid = { x: (ca.x + cb.x) / 2, y: (ca.y + cb.y) / 2 };
    const label = target === 10 ? "X" : target === 5 ? "V" : String(target);

    const objects: VisualObject[] = [
        { kind: "circle", at: mid, r: 0.18, style: { fill: "var(--surface)", strokeWidth: 0, z: 2 } },
        { kind: "text", at: mid, text: label, style: { fontSize: 0.26, bold: true, z: 3 } },
    ];

    return {
        constraints: [{ expr: ["==", ["+", ["value", a], ["value", b]], target], label: `xv ${a}+${b}=${target}` }],
        objects,
    };
};

xv.schema = {
    label: "XV",
    fields: [
        { kind: "cells", key: "cells", label: "2 adjacent cells", min: 2, max: 2 },
        { kind: "number", key: "target", label: "Target sum (X=10, V=5)", required: true },
    ],
};

xv.rule = "Two cells with a V between them must add up to 5. Two cells with an X between them must add up to 10.";
