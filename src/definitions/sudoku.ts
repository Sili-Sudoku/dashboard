/**
 * Classic Sudoku, expressed as generic constraints:
 *   every row, column and box is `allDifferent`.
 *
 * The engine is not consulted about "Sudoku" anywhere. This function just reads
 * the geometry's region selectors and emits one primitive per group.
 */

import type { ConstraintDefinition, DefinitionOutput } from "@/definitions/types.ts";
import { regionKind } from "@/runtime/geometry.ts";
import type { VisualObject } from "@/runtime/puzzle.ts";

export const sudoku: ConstraintDefinition = (params, ctx): DefinitionOutput | Error => {
    const includeBoxes = params.boxes !== false;
    const extraRegions = Array.isArray(params.extraRegions) ? (params.extraRegions as string[]) : [];

    const selectors = ctx.geometry.regionSelectors.filter((s) => {
        const kind = regionKind(s);
        if (kind === "row" || kind === "col") return true;
        if (kind === "box") return includeBoxes;
        return false;
    });

    const objects: VisualObject[] = [];
    for (const sel of extraRegions) {
        const cells = ctx.regions[sel] ?? ctx.geometry.resolveRegion(sel);
        if (!cells) {
            return new Error(`sudoku: unknown extra region "${sel}"`);
        }
        selectors.push(sel);
        // "diagonal:*" is this project's naming convention for the two main
        // diagonals (see fpuzzles.ts's importer and kitchen_sink.ts) — draw the
        // line the same way a thermometer/palindrome draws its path, since
        // nothing else would otherwise show this region on the board at all.
        if (sel.startsWith("diagonal:")) {
            objects.push({ kind: "path", cells: [...cells], style: { stroke: "var(--diagonal)", strokeWidth: 0.12, z: 1 } });
        }
    }

    return {
        constraints: selectors.map((sel) => ({
            expr: ["allDifferent", ["cells", sel]],
            label: `${sel} all different`,
        })),
        objects,
    };
};

sudoku.schema = {
    label: "Sudoku (rows/cols/boxes)",
    fields: [
        { kind: "boolean", key: "boxes", label: "Include boxes", default: true },
    ],
};
