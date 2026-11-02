/**
 * Thermometer: values along the path, from the bulb outward, strictly increase.
 * The definition adds the constraint and its own visuals (a rounded
 * path and a bulb disc). The renderer knows only "path" and "circle".
 */

import { requireCellList, type ConstraintDefinition, type DefinitionOutput } from "@/definitions/types.ts";
import type { VisualObject } from "@/runtime/puzzle.ts";

export const thermometer: ConstraintDefinition = (params, ctx): DefinitionOutput | Error => {
    const cells = requireCellList(params, "cells", ctx);
    if (cells instanceof Error) return new Error(`thermometer: ${cells.message}`);
    if (cells.length < 2) return new Error("thermometer: needs 2 or more cells");

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

thermometer.schema = {
    label: "Thermometer",
    fields: [
        { kind: "cells", key: "cells", label: "Path (bulb first)", min: 2 },
        { kind: "boolean", key: "strict", label: "Digits always increase", default: true },
    ],
};
