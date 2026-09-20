/**
 * Classic Sudoku, expressed as generic constraints:
 *   every row, column and box is `allDifferent`.
 *
 * The engine is not consulted about "Sudoku" anywhere. This function just reads
 * the geometry's region selectors and emits one primitive per group.
 */

import type { ConstraintDefinition, DefinitionOutput } from "@/definitions/types.ts";

export const sudoku: ConstraintDefinition = (params, ctx): DefinitionOutput | Error => {
    const includeBoxes = params.boxes !== false;
    const extraRegions = Array.isArray(params.extraRegions) ? (params.extraRegions as string[]) : [];

    const selectors = ctx.geometry.regionSelectors.filter((s) => {
        if (s.startsWith("row:") || s.startsWith("col:")) return true;
        if (s.startsWith("box:")) return includeBoxes;
        return false;
    });

    for (const sel of extraRegions) {
        if (!ctx.regions[sel] && !ctx.geometry.resolveRegion(sel)) {
            return new Error(`sudoku: unknown extra region "${sel}"`);
        }
        selectors.push(sel);
    }

    return {
        constraints: selectors.map((sel) => ({
            expr: ["allDifferent", ["cells", sel]],
            label: `${sel} all different`,
        })),
    };
};
