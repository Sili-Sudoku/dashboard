/**
 * Global "negative" constraints: for every orthogonally adjacent cell pair
 * that no explicit clue of the same kind covers, assert that the pair does NOT
 * satisfy the relation of that clue. This is the top-level "negative" flag of f-puzzles.
 * For example, negative:["ratio"] means that no undotted adjacent pair has a 2:1 ratio.
 *
 * Only the importer (`src/interop/fpuzzles.ts`) knows which pairs an explicit
 * kropki/xv clue already covers. It passes that set in as `excludePairs`.
 * So these definitions stay generic and do not need to know about other constraints.
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

const adjacentPairDefinition =
    (label: string, relation: (a: CellId, b: CellId) => Expr): ConstraintDefinition =>
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

negativeRatio.rule = "Two adjacent cells with no black dot between them cannot have a ratio of 2.";
negativeDifference.rule =
    "Two adjacent cells with no white dot between them cannot contain digits that follow each other.";
negativeXV.rule = "Two adjacent cells with no X or V between them cannot add up to 5 or 10.";
