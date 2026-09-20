import { describe, expect, it } from "vitest";
import { compilePuzzle } from "@/runtime/compile.ts";
import { evaluate, lookupFromRecord } from "@/runtime/evaluate.ts";
import { definitions } from "@/definitions/index.ts";
import { whisperLinePuzzle } from "@/puzzles/whisper_line.ts";
import type { PuzzleDefinition } from "@/runtime/puzzle.ts";

/**
 * "German Whispers": along a line, every adjacent pair of digits differs by >= 5.
 * This variant is NOT in src/definitions. It is written straight into the puzzle
 * as primitive constraints — no engine change, no definition, no registry entry.
 */
const whisperPair = (a: string, b: string) => [
    "or",
    [">=", ["-", ["value", a], ["value", b]], 5],
    [">=", ["-", ["value", b], ["value", a]], 5],
];

const puzzle: PuzzleDefinition = {
    version: 1,
    metadata: { id: "whisper", title: "Ad-hoc German Whispers" },
    geometry: { type: "grid", width: 4, height: 4, boxWidth: 2, boxHeight: 2 },
    domain: { values: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
    objects: [{ kind: "path", cells: ["r1c1", "r2c1", "r3c1"], style: { stroke: "green" } }],
    constraints: [
        whisperPair("r1c1", "r2c1"),
        whisperPair("r2c1", "r3c1"),
    ],
};

describe("a brand-new variant, expressed only in the puzzle file", () => {
    it("compiles with an EMPTY definition registry", () => {
        const compiled = compilePuzzle(puzzle, {});
        expect(compiled).not.toBeInstanceOf(Error);
    });

    it("evaluates: 1-6-1 satisfies, 1-6-3 violates the second pair", () => {
        const compiled = compilePuzzle(puzzle, {});
        if (compiled instanceof Error) throw compiled;

        const ok = evaluate(compiled, lookupFromRecord({ r1c1: 1, r2c1: 6, r3c1: 1 }));
        expect(ok.constraints.map((c) => c.status)).toEqual(["satisfied", "satisfied"]);

        const bad = evaluate(compiled, lookupFromRecord({ r1c1: 1, r2c1: 6, r3c1: 3 }));
        expect(bad.constraints.map((c) => c.status)).toEqual(["satisfied", "violated"]);
        expect(bad.violatedCells.has("r3c1")).toBe(true);
    });
});

describe("the built-in whisper-line puzzle carries the variant as primitives", () => {
    const compiled = compilePuzzle(whisperLinePuzzle, definitions);
    if (compiled instanceof Error) throw compiled;

    it("the whisper constraints have source 'primitive', not a definition", () => {
        const nonSudoku = compiled.constraints.filter((c) => c.source !== "sudoku");
        expect(nonSudoku).toHaveLength(3);
        expect(nonSudoku.every((c) => c.source === "primitive")).toBe(true);
        expect(Array.isArray(nonSudoku[0].expr) && nonSudoku[0].expr[0]).toBe("or");
    });

    it("no 'whispers' definition exists in the registry", () => {
        expect(definitions).not.toHaveProperty("whispers");
        expect(definitions).not.toHaveProperty("germanWhispers");
    });

    it("the stated solution completes it", () => {
        const result = evaluate(compiled, lookupFromRecord(whisperLinePuzzle.solution ?? {}));
        expect(result.complete).toBe(true);
        expect(result.status).toBe("valid");
    });
});
