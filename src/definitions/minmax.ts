/**
 * Minimum/maximum markers: the cell's value must be <= (minimum) or >=
 * (maximum) every orthogonal neighbor's value. Parameterized the same way
 * `parity.ts` parameterizes odd/even. Drawn as a small "<"/">"-style wedge
 * straddling the border with each neighbor (one per orthogonal side, not
 * just a single center glyph) — entirely on the clue cell's side of that
 * border, never crossing into the neighbor: a minimum's wedge tip sits deep
 * in the clue cell with its wings out at the border ("<", wide end at the
 * larger neighbor); a maximum's is mirrored, tip right at the border with
 * its wings pulled back into the clue cell (">", point at the smaller
 * neighbor without actually entering its cell).
 */

import { requireCell, type ConstraintDefinition, type DefinitionOutput, type EmittedConstraint } from "@/definitions/types.ts";
import type { Point } from "@/runtime/geometry.ts";
import type { VisualObject } from "@/runtime/puzzle.ts";

const CHEVRON_HALF_WIDTH = 0.12;
const CHEVRON_DEPTH = 0.1;

/** `tipOffset`/`wingOffset` are signed distances from the cell/neighbor
 *  border along the line between their centers; 0 is the border itself and
 *  negative moves back into `cellCenter`'s cell, so both must stay <= 0 to
 *  keep the whole wedge off the neighbor's side. */
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
        const [tipOffset, wingOffset] = kind === "minimum" ? [-CHEVRON_DEPTH, 0] : [0, -CHEVRON_DEPTH];
        const objects: VisualObject[] = neighbors.map((n) =>
            chevron(cellCenter, ctx.geometry.center(n), tipOffset, wingOffset),
        );

        return { constraints, objects };
    };

export const minimum = minmaxDefinition("minimum");
export const maximum = minmaxDefinition("maximum");
