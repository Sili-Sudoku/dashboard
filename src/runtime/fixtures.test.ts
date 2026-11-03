import { describe, expect, it } from "vitest";

import { definitions } from "@/definitions/index.ts";
import { compilePuzzle } from "@/runtime/compile.ts";
import { isDefinitionRef, isNamedRule, PUZZLE_FORMAT_VERSION } from "@/runtime/puzzle.ts";
import { decodePuzzle, parsePuzzle } from "@/runtime/serialization.ts";

/**
 * Puzzles that must always load.
 * Each file in `fixtures/v<N>/` is a puzzle as the app wrote it at format version N: a `.json` file,
 * or a `.link.txt` file (the text after `/p/` in a share link). Never edit or delete one.
 * When the format changes, add a migration (migrations.ts) and keep the old files: this test then proves
 * that the migration still opens them.
 */
const files = import.meta.glob("./fixtures/v*/*", { query: "?raw", import: "default", eager: true }) as Record<
    string,
    string
>;

const entries = Object.entries(files).map(([path, text]) => {
    const [, version, name] = /fixtures\/v(\d+)\/(.+)$/.exec(path) ?? [];
    return { path, version: Number(version), name, text: text.trim() };
});

describe("puzzle fixtures of every format version", () => {
    it("has fixtures for each format version up to the current one", () => {
        const versions = new Set(entries.map((e) => e.version));
        for (let v = 1; v <= PUZZLE_FORMAT_VERSION; v++) expect(versions.has(v), `no fixtures for v${v}`).toBe(true);
    });

    for (const entry of entries.filter((e) => e.name.endsWith(".json"))) {
        it(`${entry.path} parses and compiles`, () => {
            const parsed = parsePuzzle(entry.text);
            if (parsed instanceof Error) throw parsed;
            expect(parsed.version).toBe(PUZZLE_FORMAT_VERSION);
            const compiled = compilePuzzle(parsed, definitions);
            if (compiled instanceof Error) throw compiled;
        });
    }

    for (const entry of entries.filter((e) => e.name.endsWith(".link.txt"))) {
        it(`${entry.path} decodes to the puzzle in the .json file of the same name`, () => {
            const decoded = decodePuzzle(entry.text);
            if (decoded instanceof Error) throw decoded;
            const sibling = entries.find((e) => e.path === entry.path.replace(".link.txt", ".json"));
            expect(sibling, "a link needs a .json file of the same name").toBeDefined();
            expect(decoded).toEqual(parsePuzzle(sibling!.text));
        });
    }

    it("the showcase uses every definition and every optional field of the format", () => {
        const showcase = entries.find((e) => e.name === "kitchen_sink_showcase.json");
        const puzzle = parsePuzzle(showcase!.text);
        if (puzzle instanceof Error) throw puzzle;
        const used = new Set(puzzle.constraints.map((c) => (isDefinitionRef(c) ? c.use : undefined)));
        for (const name of Object.keys(definitions)) expect(used.has(name), `showcase lacks "${name}"`).toBe(true);
        expect(puzzle.constraints.some((c) => Array.isArray(c)), "a bare primitive constraint").toBe(true);
        expect(puzzle.constraints.some(isNamedRule), "a named rule").toBe(true);
        for (const key of ["regions", "givens", "rules", "objects"] as const) expect(puzzle[key], key).toBeDefined();
        expect(puzzle.presentation?.theme, "presentation.theme").toBeDefined();
        for (const key of ["author", "description", "difficulty", "tags"] as const)
            expect(puzzle.metadata[key], key).toBeDefined();
    });

    it("the other files cover what the showcase cannot: a solution with fog, and a composite grid", () => {
        const kinds = entries
            .filter((e) => e.name.endsWith(".json"))
            .map((e) => parsePuzzle(e.text))
            .map((p) => (p instanceof Error ? undefined : p));
        expect(kinds.some((p) => p?.fog && p.solution), "fog with a solution").toBe(true);
        expect(kinds.some((p) => p?.geometry.type === "composite"), "composite geometry").toBe(true);
    });
});
