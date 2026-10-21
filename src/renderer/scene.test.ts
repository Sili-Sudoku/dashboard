import { describe, expect, it } from "vitest";
import { createGeometry } from "@/runtime/geometry.ts";
import { compilePuzzle } from "@/runtime/compile.ts";
import { evaluate, lookupFromRecord } from "@/runtime/evaluate.ts";
import { definitions } from "@/definitions/index.ts";
import { demoMixed } from "@/puzzles/demo_mixed.ts";
import { buildScene, cageOutline, describeObject, resolvePointRef } from "@/renderer/scene.ts";

const geo = createGeometry({ type: "grid", width: 9, height: 9 });

describe("scene geometry", () => {
    it("resolves point references to geometry units", () => {
        expect(resolvePointRef("r1c1", geo)).toEqual({ x: 0.5, y: 0.5 });
        expect(resolvePointRef({ cell: "r1c1", corner: "br" }, geo)).toEqual({ x: 1, y: 1 });
        expect(resolvePointRef({ x: 3, y: 4 }, geo)).toEqual({ x: 3, y: 4 });
    });

    it("describes a path as a scaled polyline through cell centres", () => {
        const [shape] = describeObject({ kind: "path", cells: ["r1c1", "r1c2"] }, geo, 10);
        expect(shape).toMatchObject({ kind: "polyline", points: [{ x: 5, y: 5 }, { x: 15, y: 5 }] });
    });

    it("adds an arrowhead shape for an arrow line", () => {
        const shapes = describeObject(
            { kind: "line", points: ["r1c1", "r1c3"], arrow: true },
            geo,
            10,
        );
        expect(shapes.map((s) => s.kind)).toEqual(["polyline", "arrowhead"]);
    });

    it("outlines a 2x2 cage with 8 boundary segments and no interior edges", () => {
        const segments = cageOutline(["r1c1", "r1c2", "r2c1", "r2c2"], geo);
        expect(segments).toHaveLength(8);
    });

    it("outlines a single cell with 4 segments", () => {
        expect(cageOutline(["r5c5"], geo)).toHaveLength(4);
    });
});

describe("buildScene", () => {
    const puzzle = compilePuzzle(demoMixed, definitions);
    if (puzzle instanceof Error) throw puzzle;

    it("produces one cell shape per geometry cell and a viewBox sized from geometry", () => {
        const scene = buildScene({
            puzzle,
            valueOf: () => null,
            notesOf: () => [],
            isGiven: (c) => c in puzzle.givens,
            selection: new Set(),
            cursor: null,
            evaluation: evaluate(puzzle, () => null),
        });
        expect(scene.cells).toHaveLength(81);
        expect(scene.viewBox).toBe(`0 0 ${9 * 64} ${9 * 64}`);
        expect(scene.shapes.length).toBeGreaterThan(0);
    });

    it("tags violated cells so the renderer can colour them", () => {
        const broken = { ...(demoMixed.solution ?? {}), r1c8: 9, r2c8: 8 };
        const scene = buildScene({
            puzzle,
            valueOf: lookupFromRecord(broken),
            notesOf: () => [],
            isGiven: (c) => c in puzzle.givens,
            selection: new Set(),
            cursor: null,
            evaluation: evaluate(puzzle, lookupFromRecord(broken)),
        });
        expect(scene.cells.some((c) => c.tone === "violated")).toBe(true);
    });

    it("keeps a selection ring on a violated cell instead of masking it with the tone fill", () => {
        const broken = { ...(demoMixed.solution ?? {}), r1c8: 9, r2c8: 8 };
        const scene = buildScene({
            puzzle,
            valueOf: lookupFromRecord(broken),
            notesOf: () => [],
            isGiven: (c) => c in puzzle.givens,
            selection: new Set(["r1c8"]),
            cursor: "r1c8",
            evaluation: evaluate(puzzle, lookupFromRecord(broken)),
        });
        const cell = scene.cells.find((c) => c.cell === "r1c8");
        expect(cell?.tone).toBe("violated");
        expect(cell?.ring).toBe("cursor");
    });

    it("orders shapes by z", () => {
        const scene = buildScene({
            puzzle,
            valueOf: () => null,
            notesOf: () => [],
            isGiven: () => false,
            selection: new Set(),
            cursor: null,
            evaluation: evaluate(puzzle, () => null),
        });
        const zs = scene.shapes.map((s) => s.style.z);
        expect([...zs]).toEqual([...zs].sort((a, b) => a - b));
    });
});
