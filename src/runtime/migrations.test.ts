import { describe, expect, it } from "vitest";

import { migratePuzzle, type Migration } from "@/runtime/migrations.ts";
import { parsePuzzle } from "@/runtime/serialization.ts";

describe("migratePuzzle", () => {
    const addOne: Migration = (p) => ({ ...p, domain: { values: [1], ...(p.domain as object) }, fromOne: true });
    const addTwo: Migration = (p) => ({ ...p, fromTwo: true });

    it("leaves a puzzle of the current version as it is", () => {
        const puzzle = { version: 1, a: 1 };
        expect(migratePuzzle(puzzle, {}, 1)).toBe(puzzle);
    });

    it("applies each step in order, and sets the version after each step", () => {
        const result = migratePuzzle({ version: 1, name: "x" }, { 1: addOne, 2: addTwo }, 3);
        expect(result).toMatchObject({ version: 3, name: "x", fromOne: true, fromTwo: true });
    });

    it("starts at the version of the file, and does not change its input", () => {
        const input = { version: 2 };
        expect(migratePuzzle(input, { 1: addOne, 2: addTwo }, 3)).toMatchObject({ version: 3, fromTwo: true });
        expect(input).toEqual({ version: 2 });
    });

    it("tells a newer file to update the app", () => {
        const result = migratePuzzle({ version: 5 }, {}, 1);
        expect((result as Error).message).toMatch(/version 5.*up to version 1.*Update the app/);
    });

    it("rejects a version that is missing or not a whole number, and a gap in the migrations", () => {
        for (const version of [undefined, "1", 0, -1, 1.5, null]) {
            expect(migratePuzzle({ version }, {}, 1)).toBeInstanceOf(Error);
        }
        expect((migratePuzzle({ version: 1 }, { 2: addTwo }, 3) as Error).message).toMatch(/no migration from 1/);
    });
});

describe("parsePuzzle and the version", () => {
    it("reports a puzzle of a newer version in plain words", () => {
        const result = parsePuzzle({ version: 2, metadata: { id: "x", title: "x" } });
        expect((result as Error).message).toMatch(/Update the app/);
    });
});
