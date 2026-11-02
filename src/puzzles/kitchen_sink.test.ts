import { describe, expect, it } from "vitest";
import { compilePuzzle } from "@/runtime/compile.ts";
import { parsePuzzle } from "@/runtime/serialization.ts";
import { definitions } from "@/definitions/index.ts";
import { kitchenSink } from "@/puzzles/kitchen_sink.ts";

/**
 * Deliberately lighter than the `describe.each` suite in `puzzles.test.ts`. This
 * puzzle has no `solution` (see the header comment of kitchen_sink.ts), so
 * it is not in the shared `puzzleRegistry` and does not go through
 * the solution-consistency checks of that suite. This test checks only that the puzzle is
 * structurally valid and compiles. This is the purpose of this file.
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
