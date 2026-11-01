/**
 * Arrow: the digits along the arrow shaft sum to the digit in the bulb. A
 * multi-cell bulb reads as a multi-digit number (first cell = most significant).
 * Contributes a bulb circle and a shaft line with an arrowhead.
 */

import { requireCellList, type ConstraintDefinition, type DefinitionOutput } from "@/definitions/types.ts";
import type { Expr } from "@/runtime/expression.ts";
import type { CellId } from "@/runtime/geometry.ts";
import type { VisualObject } from "@/runtime/puzzle.ts";

const BULB_RADIUS = 0.4;
/** How far short of the last shaft cell's centre the arrowhead's tip stops (digits reach about 0.25 out). */
const HEAD_CLEARANCE = 0.3;

export const arrow: ConstraintDefinition = (params, ctx): DefinitionOutput | Error => {
    const path = requireCellList(params, "cells", ctx);
    if (path instanceof Error) return new Error(`arrow: ${path.message}`);

    const rawBulb = params.bulb;
    const bulbCells: string[] = Array.isArray(rawBulb) ? rawBulb : typeof rawBulb === "string" ? [rawBulb] : [];
    if (bulbCells.length === 0) return new Error('arrow: "bulb" must be a cell id or array of cell ids');
    for (const c of bulbCells) {
        if (!ctx.geometry.has(c)) return new Error(`arrow: invalid bulb cell ${JSON.stringify(c)}`);
    }

    const bulbValue: Expr = bulbNumberExpr(bulbCells as CellId[], ctx.domain);
    const shaftSum: Expr = ["sum", ["cells", [...path]]];

    const objects: VisualObject[] = [
        {
            kind: "circle",
            at: bulbCells[0],
            r: BULB_RADIUS,
            style: { stroke: "var(--arrow)", fill: "none", strokeWidth: 0.04, z: 1 },
        },
        {
            kind: "line",
            points: [bulbCells[bulbCells.length - 1], ...path],
            arrow: true,
            // Start at the bulb's rim and stop the head short of the last digit, so the
            // shaft never strikes through either number.
            trim: { start: BULB_RADIUS, end: HEAD_CLEARANCE },
            style: { stroke: "var(--arrow)", strokeWidth: 0.04, z: 1 },
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
    // Positional notation in the base of the puzzle's own domain (base 10 for
    // classic 1-9 sudoku) rather than a hardcoded base 10, which breaks the
    // moment a cell's own value can exceed 9 (e.g. a 1-25 domain).
    const base = Math.max(...domain) + 1;
    // most-significant digit first
    const terms: Expr[] = bulbCells.map((cell, i) => {
        const place = Math.pow(base, bulbCells.length - 1 - i);
        return place === 1 ? ["value", cell] : ["*", place, ["value", cell]];
    });
    return ["+", ...terms];
};
