/**
 * Minimum/maximum markers: the value of the cell must be <= (minimum) or >=
 * (maximum) the value of every orthogonal neighbor. The parameters work like
 * those of odd/even in `parity.ts`. The marker is a small "<"/">"-style wedge
 * at the border with each neighbor: one wedge for each orthogonal side, not
 * one center glyph. Each wedge is fully inside the clue cell and set back from
 * the border, so it does not touch the grid line.
 * The wedge of a minimum has its tip deepest in the clue cell and its wings nearest
 * the border ("<", wide end at the larger neighbor).
 * The wedge of a maximum is the mirror: its tip is nearest the border
 * and its wings are further back (">", point at the smaller neighbor).
 */

import { requireCell, type ConstraintDefinition, type DefinitionOutput, type EmittedConstraint } from "@/definitions/types.ts";
import type { Point } from "@/runtime/geometry.ts";
import type { VisualObject } from "@/runtime/puzzle.ts";

const CHEVRON_HALF_WIDTH = 0.12;
const CHEVRON_DEPTH = 0.1;
/** Clear space between the outermost point of the chevron and the cell border.
 *  The chevron does not touch or cross the grid line, and it reads against plain paper. */
const BORDER_CLEARANCE = 0.09;

/** `tipOffset`/`wingOffset` are signed distances from the border between the cell and the neighbor.
 *  They follow the line between the two centers. 0 is the border itself.
 *  A negative value moves back into the cell of `cellCenter`.
 *  Both must stay below -BORDER_CLEARANCE, so the whole wedge stays off the line. */
const chevron = (cellCenter: Point, neighborCenter: Point, tipOffset: number, wingOffset: number): VisualObject => {
    const dx = neighborCenter.x - cellCenter.x;
    const dy = neighborCenter.y - cellCenter.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const px = -uy;
    const py = ux;
    const mid: Point = { x: (cellCenter.x + neighborCenter.x) / 2, y: (cellCenter.y + neighborCenter.y) / 2 };
    const tip: Point = { x: mid.x + ux * tipOffset, y: mid.y + uy * tipOffset };
    const wingBase: Point = { x: mid.x + ux * wingOffset, y: mid.y + uy * wingOffset };
    const end1: Point = { x: wingBase.x + px * CHEVRON_HALF_WIDTH, y: wingBase.y + py * CHEVRON_HALF_WIDTH };
    const end2: Point = { x: wingBase.x - px * CHEVRON_HALF_WIDTH, y: wingBase.y - py * CHEVRON_HALF_WIDTH };
    return { kind: "line", points: [end1, tip, end2], style: { stroke: "var(--ink-soft)", strokeWidth: 0.05, z: 2 } };
};

const minmaxDefinition = (kind: "minimum" | "maximum"): ConstraintDefinition =>
    (params, ctx): DefinitionOutput | Error => {
        const cell = requireCell(params, "cell", ctx);
        if (cell instanceof Error) return new Error(`${kind}: ${cell.message}`);

        const neighbors = ctx.geometry.neighbors(cell);
        if (neighbors.length === 0) return new Error(`${kind}: cell ${cell} has no neighbors`);

        const cmp = kind === "minimum" ? "<=" : ">=";
        const constraints: EmittedConstraint[] = neighbors.map((n) => ({
            expr: [cmp, ["value", cell], ["value", n]],
            label: `${kind} ${cell} ${cmp} ${n}`,
        }));

        const cellCenter = ctx.geometry.center(cell);
        const outer = -BORDER_CLEARANCE;
        const inner = outer - CHEVRON_DEPTH;
        const [tipOffset, wingOffset] = kind === "minimum" ? [inner, outer] : [outer, inner];
        const objects: VisualObject[] = neighbors.map((n) =>
            chevron(cellCenter, ctx.geometry.center(n), tipOffset, wingOffset),
        );

        return { constraints, objects };
    };

export const minimum = minmaxDefinition("minimum");
export const maximum = minmaxDefinition("maximum");

minimum.schema = {
    label: "Minimum marker",
    fields: [
        { kind: "cell", key: "cell", label: "Cell" },
    ],
};

maximum.schema = {
    label: "Maximum marker",
    fields: [
        { kind: "cell", key: "cell", label: "Cell" },
    ],
};

minimum.rule = "A cell with a minimum marker must contain a digit that is smaller than the digits in all adjacent cells.";
maximum.rule = "A cell with a maximum marker must contain a digit that is larger than the digits in all adjacent cells.";
