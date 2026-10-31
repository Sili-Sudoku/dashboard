/**
 * Baseline perf numbers for the large-puzzle work (#47 incremental eval, #48
 * viewport virtualization, #65 patch-based undo/redo). #71 originally asked
 * for these to be measured BEFORE that work landed; by the time #71 was
 * picked up, #47/#48/#65 were already done (each with its own one-off
 * measurement buried in its own card comment) — so this exists instead as a
 * committed, reusable reference: future large-puzzle optimizations should
 * diff against these numbers rather than guessing. Run with `npm run bench`.
 */

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
        // Native-scale viewport (not fitView's letterboxed overview, which
        // always shows the whole scene scaled down and so never culls
        // anything) -- this is the scenario virtualization actually targets:
        // scrolled/zoomed in to see real cell detail. Measured: culls 625
        // cells down to 315 rendered (~50%) at this size.
        const view = expandViewport({ left: 0, top: 0, width: 1200, height: 800 }, scene.cellSize * 2);
        scene.cells.filter((c) => cellInViewport(c, view));
    });
});
