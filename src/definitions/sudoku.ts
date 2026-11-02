/**
 * Classic Sudoku, written as generic constraints:
 *   every row, column and box is `allDifferent`.
 *
 * The engine does not know "Sudoku". This function only reads
 * the region selectors of the geometry and emits one primitive for each group.
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
            return new Error(`sudoku: extra region is not known: "${sel}"`);
        }
        selectors.push(sel);
        // "diagonal:*" is the naming convention of this project for the two main
        // diagonals (see the importer in fpuzzles.ts and kitchen_sink.ts).
        // Draw the line in the same way as the path of a thermometer/palindrome.
        // Without it, nothing shows this region on the board.
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
    label: "Sudoku (rows, columns, boxes)",
    fields: [
        { kind: "boolean", key: "boxes", label: "Include boxes", default: true },
    ],
};

sudoku.rule = "Each row, column, and box must contain each digit one time.";
