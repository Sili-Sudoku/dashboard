import { describe, expect, it } from "vitest";
import { compilePuzzle } from "@/runtime/compile.ts";
import { parsePuzzle } from "@/runtime/serialization.ts";
import { definitions } from "@/definitions/index.ts";
import { kitchenSink } from "@/puzzles/kitchen_sink.ts";

/**
 * Deliberately lighter than `puzzles.test.ts`'s `describe.each` suite: this
 * puzzle has no `solution` (see kitchen_sink.ts's header comment for why), so
 * it isn't registered in the shared `puzzleRegistry` and doesn't go through
 * that suite's solution-consistency checks. This only checks that it's
 * structurally valid and compiles — the thing this file actually exists to
 * demonstrate.
 */
describe("kitchen sink variant-coverage demo", () => {
    it("passes structural validation", () => {
        expect(parsePuzzle(kitchenSink)).not.toBeInstanceOf(Error);
    });

    it("compiles against the full definition registry", () => {
        const compiled = compilePuzzle(kitchenSink, definitions);
        expect(compiled).not.toBeInstanceOf(Error);
    });

    it("exercises every registered definition at least once", () => {
        const compiled = compilePuzzle(kitchenSink, definitions);
        if (compiled instanceof Error) throw compiled;
        const sourcesUsed = new Set(compiled.constraints.map((c) => c.source));
        for (const name of Object.keys(definitions)) {
            expect(sourcesUsed.has(name)).toBe(true);
        }
    });
});
