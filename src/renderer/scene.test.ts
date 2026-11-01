import { describe, expect, it } from "vitest";
import { createGeometry } from "@/runtime/geometry.ts";
import { compilePuzzle } from "@/runtime/compile.ts";
import { evaluate, lookupFromRecord } from "@/runtime/evaluate.ts";
import { definitions } from "@/definitions/index.ts";
import { demoMixed } from "@/puzzles/demo_mixed.ts";
import { buildScene, cageOutline, describeObject, resolvePointRef, type SceneInput } from "@/renderer/scene.ts";

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

    it("trims a line's ends along its length, and puts the arrowhead on the trimmed end", () => {
        const shapes = describeObject(
            { kind: "line", points: [{ x: 0, y: 0 }, { x: 4, y: 0 }], arrow: true, trim: { start: 1, end: 0.5 } },
            geo,
            10,
        );
        expect(shapes[0]).toMatchObject({ kind: "polyline", points: [{ x: 10, y: 0 }, { x: 35, y: 0 }] });
        expect(shapes[1]).toMatchObject({ kind: "arrowhead", at: { x: 35, y: 0 } });
    });

    it("trims across a bend, keeping the interior vertices", () => {
        const [shape] = describeObject(
            { kind: "line", points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }], trim: { start: 0.5, end: 0.5 } },
            geo,
            10,
        );
        expect(shape).toMatchObject({ points: [{ x: 5, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 15 }] });
    });

    it("leaves a line alone when there is not enough of it to trim", () => {
        const [shape] = describeObject(
            { kind: "line", points: [{ x: 0, y: 0 }, { x: 0.5, y: 0 }], trim: { start: 0.4, end: 0.3 } },
            geo,
            10,
        );
        expect(shape).toMatchObject({ points: [{ x: 0, y: 0 }, { x: 5, y: 0 }] });
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

    it("insets a single cell into a closed square, each segment ending where the next begins", () => {
        const segs = cageOutline(["r1c1"], geo);
        const near = (p: { x: number; y: number }, x: number, y: number) => {
            expect(p.x).toBeCloseTo(x, 6);
            expect(p.y).toBeCloseTo(y, 6);
        };
        // clockwise from the top edge: (0.08,0.08) -> (0.92,0.08) -> (0.92,0.92) -> (0.08,0.92) -> back
        near(segs[0][0], 0.08, 0.08);
        near(segs[0][1], 0.92, 0.08);
        near(segs[1][0], 0.92, 0.08);
        near(segs[1][1], 0.92, 0.92);
        near(segs[2][1], 0.08, 0.92);
        near(segs[3][1], 0.08, 0.08);
    });

    it("turns an L-shaped cage's concave corner at one shared point", () => {
        // r1c1 r2c1 r2c2: the concave vertex (1,1) insets to (0.92, 1.08), inside the cage.
        const segs = cageOutline(["r1c1", "r2c1", "r2c2"], geo);
        const touching = segs.filter(([a, b]) =>
            [a, b].some((p) => Math.abs(p.x - 0.92) < 1e-6 && Math.abs(p.y - 1.08) < 1e-6),
        );
        expect(touching).toHaveLength(2);
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
            centerNotesOf: () => [],
            flaggedCells: new Set(),
            incorrectCells: new Set(),
            isGiven: (c) => c in puzzle.givens,
            selection: new Set(),
            cursor: null,
            hiddenCells: new Set(),
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
            centerNotesOf: () => [],
            flaggedCells: new Set(),
            incorrectCells: new Set(),
            isGiven: (c) => c in puzzle.givens,
            selection: new Set(),
            cursor: null,
            hiddenCells: new Set(),
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
            centerNotesOf: () => [],
            flaggedCells: new Set(),
            incorrectCells: new Set(),
            isGiven: (c) => c in puzzle.givens,
            selection: new Set(["r1c8"]),
            cursor: "r1c8",
            hiddenCells: new Set(),
            evaluation: evaluate(puzzle, lookupFromRecord(broken)),
        });
        const cell = scene.cells.find((c) => c.cell === "r1c8");
        expect(cell?.tone).toBe("violated");
        expect(cell?.ring).toBe("cursor");
    });

    describe("same-value highlight (#73)", () => {
        // r1c1=5, r1c5=7, r2c1=6 ... come from the demo's givens; fill extra 5s by hand.
        const values: Record<string, number> = { r1c1: 5, r4c4: 5, r7c9: 5, r2c2: 3 };
        const at = (c: string): number | null => values[c] ?? null;
        // Not Partial<SceneInput>: its `valueOf` property collides with Object.prototype.valueOf when TS checks a partial.
        const build = (
            over: Partial<Pick<SceneInput, "cursor" | "selection" | "hiddenCells" | "highlightSameValue">> = {},
            valueOf: (c: string) => number | null = at,
        ) =>
            buildScene({
                puzzle,
                valueOf,
                notesOf: () => [],
                centerNotesOf: () => [],
                flaggedCells: new Set(),
                incorrectCells: new Set(),
                isGiven: () => false,
                selection: new Set(),
                cursor: "r1c1",
                hiddenCells: new Set(),
                evaluation: evaluate(puzzle, lookupFromRecord(values)),
                highlightSameValue: true,
                ...over,
            });
        const same = (scene: ReturnType<typeof buildScene>) =>
            scene.cells.filter((c) => c.sameValue).map((c) => c.cell).sort();

        it("flags every other cell sharing the cursor cell's value, not the cursor itself", () => {
            expect(same(build())).toEqual(["r4c4", "r7c9"]);
        });

        it("flags nothing when the cursor cell is empty, or there is no cursor", () => {
            expect(same(build({ cursor: "r9c9" }))).toEqual([]);
            expect(same(build({ cursor: null }))).toEqual([]);
        });

        it("is off unless asked for", () => {
            expect(same(build({ highlightSameValue: false }))).toEqual([]);
        });

        it("never flags a fog-hidden cell, and gives nothing away when the cursor itself is hidden", () => {
            expect(same(build({ hiddenCells: new Set(["r4c4"]) }, (c) => (c === "r4c4" ? null : at(c))))).toEqual(["r7c9"]);
            expect(same(build({ hiddenCells: new Set(["r1c1"]) }, (c) => (c === "r1c1" ? null : at(c))))).toEqual([]);
        });

        it("leaves selection, cursor ring and tone untouched", () => {
            const scene = build({ selection: new Set(["r1c1", "r4c4"]) });
            const cell = scene.cells.find((c) => c.cell === "r4c4");
            expect(cell?.sameValue).toBe(true);
            expect(cell?.ring).toBe("selected");
        });
    });

    it("resolves colour marks to palette colours, keeping each mark's 1-based position (#35)", () => {
        const scene = buildScene({
            puzzle,
            valueOf: () => null,
            notesOf: () => [],
            centerNotesOf: () => [],
            colorsOf: (c) => (c === "r1c1" ? [0, 2] : c === "r1c2" ? [99] : []),
            markPalette: ["#111111", "#222222", "#333333"],
            flaggedCells: new Set(),
            incorrectCells: new Set(),
            isGiven: () => false,
            selection: new Set(),
            cursor: null,
            hiddenCells: new Set(),
            evaluation: evaluate(puzzle, () => null),
        });
        expect(scene.cells.find((c) => c.cell === "r1c1")?.marks).toEqual([
            { position: 1, color: "#111111" },
            { position: 3, color: "#333333" },
        ]);
        expect(scene.cells.find((c) => c.cell === "r1c2")?.marks).toEqual([]);
        expect(scene.cells.find((c) => c.cell === "r1c3")?.marks).toEqual([]);
    });

    it("resolves the background mark to the theme surface, reported as digit 0 (#35)", () => {
        const scene = buildScene({
            puzzle,
            valueOf: () => null,
            notesOf: () => [],
            centerNotesOf: () => [],
            colorsOf: (c) => (c === "r1c1" ? [0, 9] : []),
            markPalette: ["#111111"],
            flaggedCells: new Set(),
            incorrectCells: new Set(),
            isGiven: () => false,
            selection: new Set(),
            cursor: null,
            hiddenCells: new Set(),
            evaluation: evaluate(puzzle, () => null),
        });
        expect(scene.cells.find((c) => c.cell === "r1c1")?.marks).toEqual([
            { position: 1, color: "#111111" },
            { position: 0, color: "var(--surface)" },
        ]);
    });

    it("carries per-cell centre notes into the scene, distinct from corner notes", () => {
        const scene = buildScene({
            puzzle,
            valueOf: () => null,
            notesOf: (c) => (c === "r1c1" ? [1, 2] : []),
            centerNotesOf: (c) => (c === "r1c1" ? [3] : []),
            flaggedCells: new Set(),
            incorrectCells: new Set(),
            isGiven: (c) => c in puzzle.givens,
            selection: new Set(),
            cursor: null,
            hiddenCells: new Set(),
            evaluation: evaluate(puzzle, () => null),
        });
        const cell = scene.cells.find((c) => c.cell === "r1c1");
        expect(cell?.notes).toEqual([1, 2]);
        expect(cell?.centerNotes).toEqual([3]);
    });

    it("orders shapes by z", () => {
        const scene = buildScene({
            puzzle,
            valueOf: () => null,
            notesOf: () => [],
            centerNotesOf: () => [],
            flaggedCells: new Set(),
            incorrectCells: new Set(),
            isGiven: () => false,
            selection: new Set(),
            cursor: null,
            hiddenCells: new Set(),
            evaluation: evaluate(puzzle, () => null),
        });
        const zs = scene.shapes.map((s) => s.style.z);
        expect([...zs]).toEqual([...zs].sort((a, b) => a - b));
    });

    it("trusts valueOf as already fog-aware, and only styles given digits once revealed", () => {
        // This module does no masking of its own — PuzzleSession.displayState
        // is responsible for ever passing in a hidden given's real value, so
        // here r1c1 (hidden, given) simulates the player's own guess
        // underneath it (5), not the puzzle's actual clue.
        const scene = buildScene({
            puzzle,
            valueOf: (c) => (c === "r1c1" ? 5 : c === "r1c3" ? 9 : null),
            notesOf: () => [],
            centerNotesOf: () => [],
            flaggedCells: new Set(),
            incorrectCells: new Set(),
            isGiven: (c) => c in puzzle.givens,
            selection: new Set(),
            cursor: null,
            hiddenCells: new Set(["r1c1", "r1c3"]),
            evaluation: evaluate(puzzle, () => null),
        });
        // Value passes straight through, whatever it is.
        expect(scene.cells.find((c) => c.cell === "r1c1")?.value).toBe(5);
        expect(scene.cells.find((c) => c.cell === "r1c3")?.value).toBe(9);
        // r1c1 is structurally given, but still hidden — rendered as a plain
        // entry (not given-digit styling) until it's actually revealed.
        expect(scene.cells.find((c) => c.cell === "r1c1")?.given).toBe(false);
        // unlisted cells are unaffected either way.
        expect(scene.cells.find((c) => c.cell === "r1c2")?.hidden).toBe(false);
        expect(scene.cells.find((c) => c.cell === "r1c1")?.hidden).toBe(true);
    });

    it("recolors a constraint's shape when its id is flagged invalid", () => {
        const scene = buildScene({
            puzzle: { ...puzzle, objects: [{ kind: "path", cells: ["r1c1", "r1c2"], id: "thermometer#2" }] },
            valueOf: () => null,
            notesOf: () => [],
            centerNotesOf: () => [],
            flaggedCells: new Set(),
            incorrectCells: new Set(),
            isGiven: () => false,
            selection: new Set(),
            cursor: null,
            hiddenCells: new Set(),
            evaluation: evaluate(puzzle, () => null),
            invalidConstraintIds: new Set(["thermometer#2"]),
        });
        const shape = scene.shapes.find((s) => s.kind === "polyline");
        expect(shape?.style.stroke).toBe("var(--violated-line)");
    });

    it("leaves a shape's styling alone when its id isn't in invalidConstraintIds", () => {
        const scene = buildScene({
            puzzle: { ...puzzle, objects: [{ kind: "path", cells: ["r1c1", "r1c2"], id: "thermometer#1" }] },
            valueOf: () => null,
            notesOf: () => [],
            centerNotesOf: () => [],
            flaggedCells: new Set(),
            incorrectCells: new Set(),
            isGiven: () => false,
            selection: new Set(),
            cursor: null,
            hiddenCells: new Set(),
            evaluation: evaluate(puzzle, () => null),
            invalidConstraintIds: new Set(["thermometer#2"]),
        });
        const shape = scene.shapes.find((s) => s.kind === "polyline");
        expect(shape?.style.stroke).not.toBe("var(--violated-line)");
    });
});

describe("grid line draw order", () => {
    it("draws every heavy region line after every thin cell divider", () => {
        const puzzle = compilePuzzle(demoMixed, definitions);
        if (puzzle instanceof Error) throw puzzle;
        const scene = buildScene({
            puzzle,
            valueOf: () => null,
            notesOf: () => [],
            centerNotesOf: () => [],
            flaggedCells: new Set(),
            incorrectCells: new Set(),
            isGiven: () => false,
            selection: new Set(),
            cursor: null,
            hiddenCells: new Set(),
            evaluation: evaluate(puzzle, lookupFromRecord({})),
        });
        const weights = scene.gridLines.map((l) => l.weight);
        expect(weights).toContain(1);
        expect(weights).toContain(3);
        expect(weights).toEqual([...weights].sort((a, b) => a - b));
    });
});
