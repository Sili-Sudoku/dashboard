import { describe, expect, it } from "vitest";
import { parsePuzzle, encodePuzzle, decodePuzzle } from "@/runtime/serialization.ts";
import { compilePuzzle } from "@/runtime/compile.ts";
import { evaluate } from "@/runtime/evaluate.ts";
import { definitions } from "@/definitions/index.ts";
import { demoMixed } from "@/puzzles/demo_mixed.ts";
import type { PuzzleDefinition } from "@/runtime/puzzle.ts";

describe("parsePuzzle", () => {
    it("accepts a well-formed artifact", () => {
        expect(parsePuzzle(demoMixed)).not.toBeInstanceOf(Error);
        expect(parsePuzzle(JSON.stringify(demoMixed))).not.toBeInstanceOf(Error);
    });

    it("rejects malformed artifacts with a specific message", () => {
        expect(parsePuzzle("not json{")).toBeInstanceOf(Error);
        expect(parsePuzzle({ version: 1 })).toBeInstanceOf(Error);
        expect(parsePuzzle({ version: 99, metadata: { id: "x", title: "x" } })).toBeInstanceOf(Error);
        expect(
            parsePuzzle({ version: 1, metadata: { id: "x", title: "x" }, geometry: { type: "hex" } }),
        ).toBeInstanceOf(Error);
        expect(
            parsePuzzle({
                version: 1,
                metadata: { id: "x", title: "x" },
                geometry: { type: "grid", width: 9, height: 9 },
                domain: { values: [] },
                constraints: [],
            }),
        ).toBeInstanceOf(Error);
    });
});

describe("encode / decode", () => {
    it("round-trips an artifact through a URL-safe string without semantic loss", () => {
        const encoded = encodePuzzle(demoMixed);
        expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);

        const decoded = decodePuzzle(encoded);
        expect(decoded).not.toBeInstanceOf(Error);
        if (decoded instanceof Error) return;
        expect(decoded).toEqual(demoMixed);
    });

    it("a decoded puzzle compiles and evaluates identically to the original", () => {
        const decoded = decodePuzzle(encodePuzzle(demoMixed)) as PuzzleDefinition;
        const original = compilePuzzle(demoMixed, definitions);
        const fromWire = compilePuzzle(decoded, definitions);
        if (original instanceof Error || fromWire instanceof Error) throw new Error("compile failed");

        const lookup = (cell: string) => original.solution?.[cell] ?? null;
        expect(evaluate(fromWire, lookup)).toEqual(evaluate(original, lookup));
    });

    it("handles unicode in metadata", () => {
        const withUnicode: PuzzleDefinition = {
            ...demoMixed,
            metadata: { ...demoMixed.metadata, title: "螺旋 · спираль · 🌀" },
        };
        expect(decodePuzzle(encodePuzzle(withUnicode))).toEqual(withUnicode);
    });

    it("rejects a corrupt or unknown-codec payload", () => {
        expect(decodePuzzle("x")).toBeInstanceOf(Error);
        expect(decodePuzzle("9abcdef")).toBeInstanceOf(Error);
    });
});
