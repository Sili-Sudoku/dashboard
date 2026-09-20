/**
 * Thermometer: values along the path, from the bulb outward, are strictly
 * increasing. Contributes both the constraint and its own visuals (a rounded
 * path plus a bulb disc) — the renderer only knows "path" and "circle".
 */

import { requireCellList, type ConstraintDefinition, type DefinitionOutput } from "@/definitions/types.ts";
import type { VisualObject } from "@/runtime/puzzle.ts";

export const thermometer: ConstraintDefinition = (params, ctx): DefinitionOutput | Error => {
    const cells = requireCellList(params, "cells", ctx);
    if (cells instanceof Error) return new Error(`thermometer: ${cells.message}`);
    if (cells.length < 2) return new Error("thermometer: needs at least 2 cells");

    const strict = params.strict !== false;
    const op = strict ? "strictIncreasing" : "increasing";
    const bulb = cells[0];

    const objects: VisualObject[] = [
        {
            kind: "path",
            cells,
            style: { stroke: "var(--thermo)", strokeWidth: 0.28, opacity: 0.55, z: 1 },
        },
        {
            kind: "circle",
            at: bulb,
            r: 0.34,
            style: { fill: "var(--thermo)", stroke: "var(--thermo)", opacity: 0.55, z: 1 },
        },
    ];

    return {
        constraints: [
            {
                expr: [op, ["cells", [...cells]]],
                label: `thermometer ${bulb}→${cells[cells.length - 1]}`,
            },
        ],
        objects,
    };
};
