import { describe, expect, it } from "vitest";
import { lookupFromRecord } from "@/runtime/evaluate.ts";
import { hiddenCells } from "@/runtime/fog.ts";
import type { CompiledPuzzle } from "@/runtime/puzzle.ts";

const basePuzzle: CompiledPuzzle = {
    metadata: { id: "fog-test", title: "Fog test fixture" },
    geometry: { type: "grid", width: 2, height: 2 },
    domain: [1, 2],
    regions: {},
    givens: { r1c1: 1 },
    rules: [],
    objects: [],
    constraints: [],
    solution: { r1c1: 1, r1c2: 2, r2c1: 2, r2c2: 1 },
    presentation: {},
};

const withFog = (hidden: readonly string[]): CompiledPuzzle => ({ ...basePuzzle, fog: { hidden } });

describe("hiddenCells", () => {
    it("returns an empty set for a puzzle with no fog declared", () => {
        expect(hiddenCells(basePuzzle, lookupFromRecord({}))).toEqual(new Set());
    });

    it("hides a declared cell with no solved neighbor and not itself solved", () => {
        const puzzle = withFog(["r2c2"]);
        expect(hiddenCells(puzzle, lookupFromRecord({ r1c1: 1 }))).toEqual(new Set(["r2c2"]));
    });

    it("reveals a cell once it holds its own correct value", () => {
        const puzzle = withFog(["r2c2"]);
        expect(hiddenCells(puzzle, lookupFromRecord({ r1c1: 1, r2c2: 1 }))).toEqual(new Set());
    });

    it("reveals a cell once an orthogonally-adjacent cell is correctly solved", () => {
        const puzzle = withFog(["r1c2"]);
        // The neighbors of r1c2 are r1c1 (given) and r2c2.
        // Only a non-given neighbor that the player filled in counts as a source.
        // The next test shows why a given alone must not count.
        expect(hiddenCells(puzzle, lookupFromRecord({ r1c1: 1, r2c2: 1 }))).toEqual(new Set());
    });

    it("does not reveal via a neighboring given alone, with no player action", () => {
        // A given is "correct" from the moment the puzzle loads.
        // If that alone counted as a source, every hidden cell next to a given would reveal at once.
        // The player would make no progress. Here only r1c1 (given) is filled in.
        // r1c2 must stay hidden.
        const puzzle = withFog(["r1c2"]);
        expect(hiddenCells(puzzle, lookupFromRecord({ r1c1: 1 }))).toEqual(new Set(["r1c2"]));
    });

    it("does not reveal via a diagonal neighbor", () => {
        const puzzle = withFog(["r2c2"]);
        // r1c1 is correct but only diagonal to r2c2 (the neighbors are r1c2 and r2c1).
        expect(hiddenCells(puzzle, lookupFromRecord({ r1c1: 1 }))).toEqual(new Set(["r2c2"]));
    });

    it("does not reveal via a neighbor filled with the wrong value", () => {
        const puzzle = withFog(["r2c2"]);
        expect(hiddenCells(puzzle, lookupFromRecord({ r1c1: 1, r2c1: 1 /* wrong: the solution is 2 */ }))).toEqual(
            new Set(["r2c2"]),
        );
    });

    it("never hides a cell outside the declared hidden list, regardless of state", () => {
        const puzzle = withFog(["r2c2"]);
        expect(hiddenCells(puzzle, lookupFromRecord({}))).not.toContain("r1c2");
    });

    it("does not self-reveal a hidden given just because it's trivially correct", () => {
        // The value of a given always equals the solution by construction.
        // So that alone cannot clear it. Only a known-correct neighbor can.
        // Here r2c2 is a hidden given with no revealed neighbor.
        // It must stay hidden, although it is already correct.
        const chain: CompiledPuzzle = {
            ...basePuzzle,
            givens: { r1c1: 1, r2c2: 1 },
            fog: { hidden: ["r2c2"] },
        };
        expect(hiddenCells(chain, lookupFromRecord({ r1c1: 1, r2c2: 1 }))).toEqual(new Set(["r2c2"]));
    });

    it("cascades through a chain of hidden cells in one pass, once player progress starts it", () => {
        // Linear 1x3 strip: r1c1 (non-given) - r1c2 (hidden given) - r1c3 (hidden, non-given, unfilled).
        // The player fills in r1c1 correctly. This reveals r1c2.
        // (A hidden given has a known value when it is revealed.)
        // Then r1c2 reveals r1c3 by the same propagation.
        // This all happens in one hiddenCells() call, not one step per edit.
        // r1c3 reveals although it has no value.
        const strip: CompiledPuzzle = {
            ...basePuzzle,
            geometry: { type: "grid", width: 3, height: 1 },
            givens: { r1c2: 2 },
            solution: { r1c1: 1, r1c2: 2, r1c3: 3 },
            fog: { hidden: ["r1c2", "r1c3"] },
        };
        expect(hiddenCells(strip, lookupFromRecord({ r1c1: 1, r1c2: 2 }))).toEqual(new Set());
    });

    it("does not let a revealed-but-still-empty cell propagate further on its own", () => {
        // Same strip, but the player has not filled in r1c1.
        // r1c2 (hidden given) has no correct neighbor to propagate from, so it stays hidden.
        // r1c3 (which borders only r1c2) also stays hidden.
        const strip: CompiledPuzzle = {
            ...basePuzzle,
            geometry: { type: "grid", width: 3, height: 1 },
            givens: { r1c2: 2 },
            solution: { r1c1: 1, r1c2: 2, r1c3: 3 },
            fog: { hidden: ["r1c2", "r1c3"] },
        };
        expect(hiddenCells(strip, lookupFromRecord({}))).toEqual(new Set(["r1c2", "r1c3"]));
    });
});
