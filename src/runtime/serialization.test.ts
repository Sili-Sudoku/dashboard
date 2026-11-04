import { describe, expect, it } from "vitest";
import { LIMITS, parsePuzzle, encodePuzzle, decodePuzzle } from "@/runtime/serialization.ts";
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

describe("named rules in a puzzle file", () => {
    const withConstraints = (constraints: unknown[]) => ({
        version: 1,
        metadata: { id: "n", title: "n" },
        geometry: { type: "grid", width: 2, height: 2 },
        domain: { values: [1, 2] },
        constraints,
    });

    it("accepts { rule, name } and rejects malformed ones", () => {
        expect(
            parsePuzzle(withConstraints([{ rule: ["==", 1, 1], name: "Twos" }, { rule: ["==", 1, 1] }])),
        ).not.toBeInstanceOf(Error);
        expect(parsePuzzle(withConstraints([{ rule: "nope" }]))).toBeInstanceOf(Error);
        expect(parsePuzzle(withConstraints([{ rule: ["==", 1, 1], name: 3 }]))).toBeInstanceOf(Error);
    });
});

describe("limits on outside data", () => {
    const base = {
        version: 1,
        metadata: { id: "x", title: "x" },
        geometry: { type: "grid", width: 3, height: 3 },
        domain: { values: [1, 2, 3] },
        constraints: [],
    };

    it("rejects a puzzle with too many cells, in a grid or a composite", () => {
        const huge = parsePuzzle({ ...base, geometry: { type: "grid", width: 1000, height: 1000 } });
        expect(huge).toBeInstanceOf(Error);
        expect((huge as Error).message).toMatch(/too many cells/);
        const grids = Array.from({ length: 200 }, (_, i) => ({ width: 9, height: 9, row: i * 9, col: 0 }));
        expect(parsePuzzle({ ...base, geometry: { type: "composite", grids } })).toBeInstanceOf(Error);
        expect(parsePuzzle(base)).not.toBeInstanceOf(Error);
    });

    it("rejects text and encoded strings that are too long, before parsing them", () => {
        expect((parsePuzzle(" ".repeat(LIMITS.jsonChars + 1)) as Error).message).toMatch(/too long/);
        expect((decodePuzzle("1" + "A".repeat(LIMITS.encodedChars)) as Error).message).toMatch(/too long/);
    });
});

describe("free-text fields of the metadata", () => {
    const withMeta = (extra: Record<string, unknown>) => ({
        version: 1,
        metadata: { id: "x", title: "x", ...extra },
        geometry: { type: "grid", width: 3, height: 3 },
        domain: { values: [1, 2, 3] },
        constraints: [],
    });

    it("accepts normal text, including markup (the app shows it as text)", () => {
        const result = parsePuzzle(withMeta({ description: "<img src=x onerror=alert(1)> & more", tags: ["a", "b"] }));
        expect(result).not.toBeInstanceOf(Error);
    });

    it("rejects text that is too long", () => {
        const limits = [
            ["title", LIMITS.title],
            ["author", LIMITS.author],
            ["description", LIMITS.description],
        ] as const;
        for (const [field, limit] of limits) {
            const result = parsePuzzle(withMeta({ [field]: "a".repeat(limit + 1) }));
            expect((result as Error).message).toMatch(new RegExp(`metadata.${field} is too long`));
            expect(parsePuzzle(withMeta({ [field]: "a".repeat(limit) }))).not.toBeInstanceOf(Error);
        }
        expect(parsePuzzle(withMeta({ tags: Array(LIMITS.tags + 1).fill("a") }))).toBeInstanceOf(Error);
        expect(parsePuzzle(withMeta({ tags: ["a".repeat(LIMITS.tag + 1)] }))).toBeInstanceOf(Error);
    });

    it("accepts an https source and rejects any other kind of link", () => {
        expect(parsePuzzle(withMeta({ source: "https://example.com/p/1" }))).not.toBeInstanceOf(Error);
        for (const bad of ["javascript:alert(1)", "data:text/html,x", "http://example.com", "example.com", ""]) {
            const result = parsePuzzle(withMeta({ source: bad }));
            expect((result as Error).message).toMatch(/metadata.source must be a link/);
        }
        expect(parsePuzzle(withMeta({ source: 5 }))).toBeInstanceOf(Error);
        const long = "https://example.com/" + "a".repeat(LIMITS.source);
        expect((parsePuzzle(withMeta({ source: long })) as Error).message).toMatch(/metadata.source is too long/);
    });

    it("rejects a field that is not a string, which would break the page that shows it", () => {
        expect(parsePuzzle(withMeta({ description: { a: 1 } }))).toBeInstanceOf(Error);
        expect(parsePuzzle(withMeta({ author: 5 }))).toBeInstanceOf(Error);
        expect(parsePuzzle(withMeta({ tags: "sudoku" }))).toBeInstanceOf(Error);
    });
});
