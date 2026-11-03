/**
 * Arrow: the digits along the arrow shaft sum to the digit in the bulb.
 * A bulb of many cells is a multi-digit number. The first cell is the most significant digit.
 * The definition adds a bulb circle and a shaft line with an arrowhead.
 */

import { requireCellList, type ConstraintDefinition, type DefinitionOutput } from "@/definitions/types.ts";
import type { Expr } from "@/runtime/expression.ts";
import type { CellId } from "@/runtime/geometry.ts";
import type { VisualObject } from "@/runtime/puzzle.ts";

const BULB_RADIUS = 0.4;
/** The arrowhead tip stops this far short of the centre of the last shaft cell. Digits reach about 0.25 out. */
const HEAD_CLEARANCE = 0.3;

export const arrow: ConstraintDefinition = (params, ctx): DefinitionOutput | Error => {
    const path = requireCellList(params, "cells", ctx);
    if (path instanceof Error) return new Error(`arrow: ${path.message}`);

    const rawBulb = params.bulb;
    const bulbCells: string[] = Array.isArray(rawBulb)
        ? (rawBulb as string[])
        : typeof rawBulb === "string"
          ? [rawBulb]
          : [];
    if (bulbCells.length === 0) return new Error('arrow: "bulb" must be a cell id or an array of cell ids');
    for (const c of bulbCells) {
        if (!ctx.geometry.has(c)) return new Error(`arrow: bulb cell is not valid: ${JSON.stringify(c)}`);
    }

    const bulbValue: Expr = bulbNumberExpr(bulbCells, ctx.domain);
    const shaftSum: Expr = ["sum", ["cells", [...path]]];

    const objects: VisualObject[] = [
        {
            kind: "circle",
            at: bulbCells[0],
            r: BULB_RADIUS,
            style: { stroke: "var(--arrow)", fill: "none", strokeWidth: 0.035, z: 1 },
        },
        {
            kind: "line",
            points: [bulbCells[bulbCells.length - 1], ...path],
            arrow: true,
            // Start at the rim of the bulb. Stop the head short of the last digit.
            // This keeps the shaft off both numbers.
            trim: { start: BULB_RADIUS, end: HEAD_CLEARANCE },
            style: { stroke: "var(--arrow)", strokeWidth: 0.035, z: 1 },
        },
    ];

    return {
        constraints: [
            {
                expr: ["==", shaftSum, bulbValue],
                label: `arrow into ${bulbCells.join("")}`,
            },
        ],
        objects,
    };
};

const bulbNumberExpr = (bulbCells: readonly CellId[], domain: readonly number[]): Expr => {
    if (bulbCells.length === 1) return ["value", bulbCells[0]];
    // Use positional notation in the base of the domain of the puzzle (base 10 for
    // classic 1-9 sudoku). A fixed base 10 fails when a cell value can exceed 9
    // (for example a 1-25 domain).
    const base = Math.max(...domain) + 1;
    // The most significant digit is first.
    const terms: Expr[] = bulbCells.map((cell, i) => {
        const place = Math.pow(base, bulbCells.length - 1 - i);
        return place === 1 ? ["value", cell] : ["*", place, ["value", cell]];
    });
    return ["+", ...terms];
};

arrow.schema = {
    label: "Arrow",
    fields: [
        { kind: "cells", key: "bulb", label: "Bulb cells", min: 1 },
        { kind: "cells", key: "cells", label: "Shaft path", min: 1 },
    ],
};

arrow.rule =
    "The digits on an arrow must add up to the digit in its circle. If the circle has more than one cell, read the digits as one number.";
