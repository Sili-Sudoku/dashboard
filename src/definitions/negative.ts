/**
 * Global "negative" constraints: for every orthogonally-adjacent cell pair
 * that is NOT already covered by an explicit clue of the same kind, assert
 * the pair does NOT satisfy that clue's relation (f-puzzles' top-level
 * "negative" flag, e.g. negative:["ratio"] means every undotted adjacent
 * pair is guaranteed not to be in a 2:1 ratio).
 *
 * The importer (`src/interop/fpuzzles.ts`) is the one place that knows which
 * pairs are "already covered" by an explicit kropki/xv clue; it passes that
 * set in as `excludePairs` so these definitions stay generic and don't need
 * to know about other constraints in the puzzle.
 */

import type { CellId } from "@/runtime/geometry.ts";
import type { Expr } from "@/runtime/expression.ts";
import type { ConstraintDefinition, DefinitionOutput, EmittedConstraint } from "@/definitions/types.ts";

const pairKey = (a: CellId, b: CellId): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

const excludedPairs = (params: Readonly<Record<string, unknown>>): Set<string> => {
    const raw = params.excludePairs;
    const set = new Set<string>();
    if (!Array.isArray(raw)) return set;
    for (const pair of raw) {
        if (Array.isArray(pair) && pair.length === 2 && typeof pair[0] === "string" && typeof pair[1] === "string") {
            set.add(pairKey(pair[0], pair[1]));
        }
    }
    return set;
};

const adjacentPairDefinition = (
    label: string,
    relation: (a: CellId, b: CellId) => Expr,
): ConstraintDefinition =>
    (params, ctx): DefinitionOutput | Error => {
        const excluded = excludedPairs(params);
        const constraints: EmittedConstraint[] = [];
        const seen = new Set<string>();
        for (const a of ctx.geometry.cells) {
            for (const b of ctx.geometry.neighbors(a)) {
                const key = pairKey(a, b);
                if (seen.has(key)) continue;
                seen.add(key);
                if (excluded.has(key)) continue;
                constraints.push({ expr: relation(a, b), label: `${label} ${a}-${b}` });
            }
        }
        return { constraints };
    };

export const negativeRatio = adjacentPairDefinition("negative ratio", (a, b) => [
    "and",
    ["!=", ["value", a], ["*", 2, ["value", b]]],
    ["!=", ["value", b], ["*", 2, ["value", a]]],
]);

export const negativeDifference = adjacentPairDefinition("negative difference", (a, b) => [
    "and",
    ["!=", ["-", ["value", a], ["value", b]], 1],
    ["!=", ["-", ["value", b], ["value", a]], 1],
]);

export const negativeXV = adjacentPairDefinition("negative xv", (a, b) => [
    "and",
    ["!=", ["+", ["value", a], ["value", b]], 5],
    ["!=", ["+", ["value", a], ["value", b]], 10],
]);
