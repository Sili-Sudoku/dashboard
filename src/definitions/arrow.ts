/**
 * Arrow: the digits along the arrow shaft sum to the digit in the bulb. A
 * multi-cell bulb reads as a multi-digit number (first cell = most significant).
 * Contributes a bulb circle and a shaft line with an arrowhead.
 */

import { requireCellList, type ConstraintDefinition, type DefinitionOutput } from "@/definitions/types.ts";
import type { Expr } from "@/runtime/expression.ts";
import type { CellId } from "@/runtime/geometry.ts";
import type { VisualObject } from "@/runtime/puzzle.ts";

export const arrow: ConstraintDefinition = (params, ctx): DefinitionOutput | Error => {
    const path = requireCellList(params, "cells", ctx);
    if (path instanceof Error) return new Error(`arrow: ${path.message}`);

    const rawBulb = params.bulb;
    const bulbCells: string[] = Array.isArray(rawBulb) ? rawBulb : typeof rawBulb === "string" ? [rawBulb] : [];
    if (bulbCells.length === 0) return new Error('arrow: "bulb" must be a cell id or array of cell ids');
    for (const c of bulbCells) {
        if (!ctx.geometry.has(c)) return new Error(`arrow: invalid bulb cell ${JSON.stringify(c)}`);
    }

    const bulbValue: Expr = bulbNumberExpr(bulbCells as CellId[]);
    const shaftSum: Expr = ["sum", ["cells", [...path]]];

    const objects: VisualObject[] = [
        {
            kind: "circle",
            at: bulbCells[0],
            r: 0.4,
            style: { stroke: "var(--arrow)", fill: "none", strokeWidth: 0.04, z: 1 },
        },
        {
            kind: "line",
            points: [bulbCells[bulbCells.length - 1], ...path],
            arrow: true,
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

const bulbNumberExpr = (bulbCells: readonly CellId[]): Expr => {
    if (bulbCells.length === 1) return ["value", bulbCells[0]];
    // most-significant digit first
    const terms: Expr[] = bulbCells.map((cell, i) => {
        const place = Math.pow(10, bulbCells.length - 1 - i);
        return place === 1 ? ["value", cell] : ["*", place, ["value", cell]];
    });
    return ["+", ...terms];
};
