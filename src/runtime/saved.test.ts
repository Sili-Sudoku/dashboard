import { describe, expect, it } from "vitest";

import { PROGRESS_FORMAT, decodeSaved, encodeSaved, type SavedFormat } from "@/runtime/saved.ts";

describe("saved data", () => {
    it("writes a version next to the data and reads it back", () => {
        const text = encodeSaved({ a: 1 }, PROGRESS_FORMAT);
        expect(JSON.parse(text)).toEqual({ v: PROGRESS_FORMAT.version, data: { a: 1 } });
        expect(decodeSaved(text, PROGRESS_FORMAT)).toEqual({ a: 1 });
    });

    it("reads a save of the first release, which has no version, as it is", () => {
        expect(decodeSaved('{"board":[],"selected":"r1c1"}', PROGRESS_FORMAT)).toEqual({ board: [], selected: "r1c1" });
        expect(decodeSaved('{"elapsedMs":5}', PROGRESS_FORMAT)).toEqual({ elapsedMs: 5 });
    });

    it("gives nothing for a save of a newer app, and does not guess", () => {
        expect(decodeSaved('{"v":99,"data":{"a":1}}', PROGRESS_FORMAT)).toBeUndefined();
    });

    it("throws for text that is not JSON, so that callers can use their catch", () => {
        expect(() => decodeSaved("{nope", PROGRESS_FORMAT)).toThrow();
    });

    it("runs the migrations in order from the saved version to the current one", () => {
        const v3: SavedFormat = {
            version: 3,
            migrations: {
                0: (d) => d,
                1: (d) => ({ ...(d as object), one: true }),
                2: (d) => ({ ...(d as object), two: true }),
            },
        };
        expect(decodeSaved('{"v":1,"data":{"x":1}}', v3)).toEqual({ x: 1, one: true, two: true });
        expect(decodeSaved('{"v":2,"data":{"x":1}}', v3)).toEqual({ x: 1, two: true });
        expect(decodeSaved('{"x":1}', v3)).toEqual({ x: 1, one: true, two: true });
    });

    it("gives nothing when a migration is missing", () => {
        const gap: SavedFormat = { version: 2, migrations: { 0: (d) => d } };
        expect(decodeSaved('{"v":1,"data":{}}', gap)).toBeUndefined();
    });

    it("treats a version that is not a whole number as damaged", () => {
        expect(decodeSaved('{"v":-1,"data":{}}', PROGRESS_FORMAT)).toBeUndefined();
        expect(decodeSaved('{"v":0.5,"data":{}}', PROGRESS_FORMAT)).toBeUndefined();
    });
});
