/** Baseline perf numbers for the large-puzzle work (incremental eval, viewport
 * virtualization, patch-based undo/redo). Each of these had its own one-off measurement
 * when it was built. So this file is a committed, reusable reference. Future large-puzzle
 * optimizations should compare against these numbers and not guess. Run with `npm run bench`. */

import { bench, describe } from "vitest";
import { compilePuzzle } from "@/runtime/compile.ts";
import { definitions } from "@/definitions/index.ts";
import { PuzzleSession } from "@/runtime/session.ts";
import { largeDemo } from "@/puzzles/large_demo.ts";
import { buildScene } from "@/renderer/scene.ts";
import { cellInViewport, expandViewport } from "@/renderer/virtualize.ts";

const compiled = () => {
    const result = compilePuzzle(largeDemo, definitions);
    if (result instanceof Error) throw result;
    return result;
};

describe("625-cell board (large-demo): single-cell edit", () => {
    bench("select + input + incremental eval", () => {
        const session = new PuzzleSession(compiled());
        session.select("r1c1");
        session.input(1);
        void session.evaluation;
    });
});

describe("625-cell board (large-demo): undo/redo", () => {
    bench("input, undo, redo (patch-based history)", () => {
        const session = new PuzzleSession(compiled());
        session.select("r1c1");
        session.input(1);
        session.undo();
        session.redo();
    });
});

describe("625-cell board (large-demo): viewport culling", () => {
    bench("buildScene + cull to a 1200x800 viewport, zoomed to native scale", () => {
        const session = new PuzzleSession(compiled());
        const scene = buildScene({
            puzzle: session.puzzle,
            valueOf: (c) => session.displayState(c).value,
            notesOf: (c) => session.displayState(c).notes,
            centerNotesOf: (c) => session.displayState(c).centerNotes,
            flaggedCells: session.getFlaggedCells(),
            incorrectCells: session.getIncorrectCells(),
            isGiven: (c) => session.isGiven(c),
            selection: session.getSelection(),
            cursor: session.getCursor(),
            evaluation: session.evaluation,
            hiddenCells: session.getHiddenCells(),
        });
        // Native-scale viewport. The letterboxed overview of fitView always shows the whole scene
        // scaled down, so it never culls anything. This scenario is the one that virtualization
        // targets: scrolled or zoomed in to see real cell detail. Measured: culls 625 cells down to
        // 315 rendered (~50%) at this size.
        const view = expandViewport({ left: 0, top: 0, width: 1200, height: 800 }, scene.cellSize * 2);
        scene.cells.filter((c) => cellInViewport(c, view));
    });
});
