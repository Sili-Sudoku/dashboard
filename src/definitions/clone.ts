/**
 * Clone: two cell regions of equal length. Their values must match by position
 * (the same shape appears again in another place on the grid).
 */

import {
    requireCellList,
    type ConstraintDefinition,
    type DefinitionOutput,
    type EmittedConstraint,
} from "@/definitions/types.ts";

export const clone: ConstraintDefinition = (params, ctx): DefinitionOutput | Error => {
    const cells = requireCellList(params, "cells", ctx);
    if (cells instanceof Error) return new Error(`clone: ${cells.message}`);
    const cloneCells = requireCellList(params, "cloneCells", ctx);
    if (cloneCells instanceof Error) return new Error(`clone: ${cloneCells.message}`);
    if (cells.length !== cloneCells.length) {
        return new Error('clone: "cells" and "cloneCells" must have the same length');
    }

    const constraints: EmittedConstraint[] = cells.map((a, i) => {
        const b = cloneCells[i];
        return { expr: ["==", ["value", a], ["value", b]], label: `clone ${a}=${b}` };
    });
    return { constraints };
};

clone.schema = {
    label: "Clone region",
    fields: [
        { kind: "cells", key: "cells", label: "Region A", min: 1 },
        { kind: "cells", key: "cloneCells", label: "Region B (same size and order)", min: 1 },
    ],
};

clone.rule = "Cells with the same shading must contain the same digits in the same positions.";
