// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useMemo, useState } from "react";

import PuzzlePlayer from "@/player/PuzzlePlayer.tsx";
import VisualBuilder from "@/features/author/VisualBuilder.tsx";
import { useVisualBuilder } from "@/features/author/use_visual_builder.ts";
import { compilePuzzle } from "@/runtime/compile.ts";
import { definitions } from "@/definitions/index.ts";
import type { CellId } from "@/runtime/geometry.ts";
import type { PuzzleDefinition } from "@/runtime/puzzle.ts";

afterEach(() => {
    cleanup();
});

const basePuzzle: PuzzleDefinition = {
    version: 1,
    metadata: { id: "vb-test", title: "Visual Builder Test" },
    geometry: { type: "grid", width: 4, height: 4 },
    domain: { values: [1, 2, 3, 4] },
    constraints: [],
};

/** Mirrors exactly how Author's index.tsx composes these two pieces: a single
 *  PuzzlePlayer board (the same one the Author page already shows), its
 *  selection mirrored out via onSelectionChange, and onSelectionEnd wired to
 *  the hook's onBoardSelectionEnd so finishing a drag commits a constraint —
 *  see use_visual_builder.ts's own comment for why there's only ever one
 *  board, not two. */
const Harness = ({ def, onChange }: { def: PuzzleDefinition | undefined; onChange: (next: PuzzleDefinition) => void }) => {
    const [selection, setSelection] = useState<ReadonlySet<CellId>>(new Set());
    const state = useVisualBuilder(def, selection, onChange);
    const compiled = useMemo(() => {
        if (!def) return undefined;
        const c = compilePuzzle(def, definitions);
        if (c instanceof Error) throw c;
        return c;
    }, [def]);
    return (
        <>
            <VisualBuilder def={def} state={state} />
            {compiled && (
                <PuzzlePlayer
                    puzzle={compiled}
                    onSelectionChange={setSelection}
                    onSelectionEnd={state.onBoardSelectionEnd}
                    previewObjects={state.previewObjects}
                />
            )}
        </>
    );
};

const renderBuilder = (def: PuzzleDefinition, onChange = vi.fn()) => {
    const utils = render(<Harness def={def} onChange={onChange} />);
    return { ...utils, onChange };
};

describe("VisualBuilder", () => {
    it("shows a fallback message instead of a palette when there's nothing valid to build on", () => {
        render(<Harness def={undefined} onChange={vi.fn()} />);
        expect(screen.getByText(/fix the json errors/i)).toBeTruthy();
        expect(screen.queryByText("Antiknight (global)")).toBeNull();
    });

    it("adds a zero-field (global) constraint the moment it's picked from the palette, no Add button at all", () => {
        const { onChange } = renderBuilder(basePuzzle);

        fireEvent.click(screen.getByText("Antiknight (global)"));

        expect(onChange).toHaveBeenCalledTimes(1);
        const next = onChange.mock.calls[0][0] as PuzzleDefinition;
        expect(next.constraints).toEqual([{ use: "antiknight" }]);
        expect(screen.queryByText(/Add Antiknight/)).toBeNull();
    });

    it("doesn't add an already-present global rule a second time, and disables its palette button (#121)", () => {
        const { onChange } = renderBuilder({ ...basePuzzle, constraints: [{ use: "antiknight" }] });

        const button = screen.getByRole("button", { name: "Antiknight (global)" }) as HTMLButtonElement;
        expect(button.disabled).toBe(true);
        fireEvent.click(button);
        expect(onChange).not.toHaveBeenCalled();
    });

    it("only offers Add for schemas that need typed input beyond a board drag (#119)", () => {
        renderBuilder(basePuzzle);

        fireEvent.click(screen.getByText("Thermometer"));
        expect(screen.queryByText(/^Add /)).toBeNull();
        expect(screen.getByText("Done")).toBeTruthy();

        fireEvent.click(screen.getByText("XV"));
        expect(screen.getByText(/^Add XV/)).toBeTruthy();
    });

    it("places a single-cell constraint by dragging directly on the board, no Add click needed", () => {
        const { container, onChange } = renderBuilder(basePuzzle);

        fireEvent.click(screen.getByText("Minimum marker"));

        const cells = container.querySelectorAll<SVGRectElement>(".cell-bg");
        const svg = container.querySelector("svg.board") as SVGSVGElement;
        fireEvent.pointerDown(cells[5]); // r2c2 on a 4x4 grid (0-indexed row-major)
        fireEvent.pointerUp(svg); // ends the gesture -- commits since a single cell is all this schema needs

        expect(onChange).toHaveBeenCalledTimes(1);
        const next = onChange.mock.calls[0][0] as PuzzleDefinition;
        expect(next.constraints).toEqual([{ use: "minimum", cell: "r2c2" }]);
    });

    it("places a multi-cell constraint by dragging across several board cells, no Add click needed", () => {
        const { container, onChange } = renderBuilder(basePuzzle);

        fireEvent.click(screen.getByText("Thermometer"));
        const cells = container.querySelectorAll<SVGRectElement>(".cell-bg");
        const svg = container.querySelector("svg.board") as SVGSVGElement;
        fireEvent.pointerDown(cells[0]); // r1c1
        fireEvent.pointerEnter(cells[1]); // r1c2
        fireEvent.pointerEnter(cells[2]); // r1c3
        fireEvent.pointerUp(svg); // ends the gesture -- commits

        expect(onChange).toHaveBeenCalledTimes(1);
        const next = onChange.mock.calls[0][0] as PuzzleDefinition;
        expect(next.constraints).toEqual([{ use: "thermometer", cells: ["r1c1", "r1c2", "r1c3"] }]);
    });

    it("grows the in-progress shape live as cells are dragged, before the gesture even ends", () => {
        const { container } = renderBuilder(basePuzzle);

        fireEvent.click(screen.getByText("Thermometer"));
        const cells = container.querySelectorAll<SVGRectElement>(".cell-bg");
        const polyline = () => container.querySelector(".shapes polyline");

        fireEvent.pointerDown(cells[0]); // r1c1 -- thermometer needs 2+ cells, so no preview shape yet
        expect(polyline()).toBeNull();

        fireEvent.pointerEnter(cells[1]); // r1c2 -- now enough for a path
        expect(polyline()?.getAttribute("points")?.split(" ")).toHaveLength(2);

        fireEvent.pointerEnter(cells[2]); // r1c3 -- the line grows again, still mid-drag
        expect(polyline()?.getAttribute("points")?.split(" ")).toHaveLength(3);
    });

    it("fills a two-cell-field schema (arrow: bulb vs shaft) by switching the active field and dragging, committing once both are filled", () => {
        const { container, onChange } = renderBuilder(basePuzzle);

        fireEvent.click(screen.getByText("Arrow"));
        const cells = container.querySelectorAll<SVGRectElement>(".cell-bg");
        const svg = container.querySelector("svg.board") as SVGSVGElement;

        fireEvent.pointerDown(cells[0]); // r1c1 -> bulb, the default active field
        fireEvent.pointerUp(svg); // shaft still empty -- not complete yet, no commit
        expect(onChange).not.toHaveBeenCalled();

        fireEvent.click(screen.getByText(/Shaft path/)); // switch the active field to "cells"
        fireEvent.pointerDown(cells[1]); // r1c2 selected, replaces the board selection
        fireEvent.pointerEnter(cells[2]); // + r1c3
        fireEvent.pointerUp(svg); // both fields filled now -- commits

        expect(onChange).toHaveBeenCalledTimes(1);
        const next = onChange.mock.calls[0][0] as PuzzleDefinition;
        expect(next.constraints).toEqual([{ use: "arrow", bulb: ["r1c1"], cells: ["r1c2", "r1c3"] }]);
    });

    it("remembers a typed param across placements and across switching schemas (#117)", () => {
        const { container, onChange } = renderBuilder(basePuzzle);
        const svg = container.querySelector("svg.board")!;
        const cells = container.querySelectorAll<SVGRectElement>(".cell-bg");
        const drag = (a: number, b: number) => {
            fireEvent.pointerDown(cells[a]);
            fireEvent.pointerEnter(cells[b]);
            fireEvent.pointerUp(svg);
        };

        fireEvent.click(screen.getByText("XV"));
        fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "10" } });
        drag(0, 1);
        expect(onChange).toHaveBeenCalledTimes(1);

        // the second placement reuses the 10 with no re-typing, so the drag alone commits it
        expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("10");
        drag(4, 5);
        expect(onChange).toHaveBeenCalledTimes(2);
        expect((onChange.mock.calls[1][0] as PuzzleDefinition).constraints).toEqual([
            { use: "xv", cells: ["r2c1", "r2c2"], target: 10 },
        ]);

        // switch to another schema and back: still 10, and changing it sticks too
        fireEvent.click(screen.getByText("Minimum marker"));
        fireEvent.click(screen.getByText("XV"));
        expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("10");
        fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "5" } });
        drag(8, 9);
        expect((onChange.mock.calls[2][0] as PuzzleDefinition).constraints).toEqual([
            { use: "xv", cells: ["r3c1", "r3c2"], target: 5 },
        ]);
    });

    it("lists already-placed constraints and removes one on click", () => {
        const withConstraint: PuzzleDefinition = {
            ...basePuzzle,
            constraints: [{ use: "antiknight" }, { use: "minimum", cell: "r2c2" }],
        };
        const { onChange } = renderBuilder(withConstraint);

        expect(screen.getByText("Antiknight (global)", { selector: "li span" })).toBeTruthy();
        expect(screen.getByText("Minimum marker (cell=r2c2)")).toBeTruthy();

        fireEvent.click(screen.getAllByLabelText("Remove constraint")[0]);
        expect(onChange).toHaveBeenCalledTimes(1);
        const next = onChange.mock.calls[0][0] as PuzzleDefinition;
        expect(next.constraints).toEqual([{ use: "minimum", cell: "r2c2" }]);
    });
});
