// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useMemo, useState } from "react";

import PuzzlePlayer from "@/player/PuzzlePlayer.tsx";
import VisualBuilder from "@/features/author/VisualBuilder.tsx";
import { useVisualBuilder } from "@/features/author/use_visual_builder.ts";
import { AUTHORING_SCHEMAS } from "@/authoring/schema.ts";
import { compilePuzzle } from "@/runtime/compile.ts";
import { definitions } from "@/definitions/index.ts";
import type { CellId } from "@/runtime/geometry.ts";
import type { PuzzleDefinition } from "@/runtime/puzzle.ts";

afterEach(() => {
    cleanup();
});

const ALL_TOOLS = [...AUTHORING_SCHEMAS.map((schema) => schema.name), "fog", "rule", "dynamic"];

const basePuzzle: PuzzleDefinition = {
    version: 1,
    metadata: { id: "vb-test", title: "Visual Builder Test" },
    geometry: { type: "grid", width: 4, height: 4 },
    domain: { values: [1, 2, 3, 4] },
    constraints: [],
};

/** This copies how index.tsx of Author joins these two parts.
 *  There is one PuzzlePlayer board (the same board that the Author page already shows).
 *  `onSelectionChange` sends the selection out.
 *  `onSelectionEnd` calls `onBoardSelectionEnd` of the hook, so the end of a drag commits a constraint.
 *  See the comment in use_visual_builder.ts for why there is only one board. */
const Harness = ({
    def,
    onChange,
    initialTools = ALL_TOOLS,
    onTools,
}: {
    def: PuzzleDefinition | undefined;
    onChange: (next: PuzzleDefinition) => void;
    /** The toolbox that the page passes in. The default is all tools pinned. */
    initialTools?: readonly string[];
    onTools?: (tools: readonly string[]) => void;
}) => {
    const [selection, setSelection] = useState<ReadonlySet<CellId>>(new Set());
    const [tools, setTools] = useState(initialTools);
    const state = useVisualBuilder(def, selection, onChange, {
        tools,
        onChange: (next, nextDef) => {
            setTools(next);
            onTools?.(next);
            if (nextDef) onChange(nextDef);
        },
    });
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

const renderBuilder = (def: PuzzleDefinition, onChange = vi.fn(), initialTools?: readonly string[], onTools = vi.fn()) => {
    const utils = render(<Harness def={def} onChange={onChange} initialTools={initialTools} onTools={onTools} />);
    return { ...utils, onChange, onTools };
};

describe("VisualBuilder quick access (#158)", () => {
    it("starts empty except for tools the puzzle already uses; everything else is behind 'Add tool'", () => {
        renderBuilder({ ...basePuzzle, constraints: [{ use: "antiknight" }] }, vi.fn(), []);

        expect(screen.getByRole("button", { name: /^✓ Antiknight/ })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Thermometer" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Add tool" }));
        const menu = screen.getByRole("menu");
        expect(within(menu).getByText("Thermometer")).toBeTruthy();
        expect(within(menu).getByText("Lines & regions")).toBeTruthy(); // group heading
        expect(within(menu).queryByText("Antiknight")).toBeNull();
    });

    it("picking from 'Add tool' pins it and starts placing it", () => {
        const { onTools } = renderBuilder(basePuzzle, vi.fn(), []);
        fireEvent.click(screen.getByRole("button", { name: "Add tool" }));
        fireEvent.click(within(screen.getByRole("menu")).getByText("Thermometer"));

        expect(screen.getByRole("button", { name: "Thermometer" }).getAttribute("aria-pressed")).toBe("true");
        expect(onTools).toHaveBeenCalledWith(["thermometer"]);
    });

    it("keeps a tool in the toolbox after its last constraint is removed (#159)", () => {
        const { onChange, onTools } = renderBuilder({ ...basePuzzle, constraints: [{ use: "antiknight" }] }, vi.fn(), []);

        fireEvent.click(screen.getByLabelText("Remove constraint"));
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onTools).toHaveBeenCalledWith(["antiknight"]);
    });

    it("x removes a tool and cleans up its placed constraints in one step, even while it is in use (#160)", () => {
        const puzzle: PuzzleDefinition = {
            ...basePuzzle,
            constraints: [{ use: "minimum", cell: "r1c1" }, { use: "antiknight" }, { use: "minimum", cell: "r2c2" }],
        };
        const { onChange, onTools } = renderBuilder(puzzle, vi.fn(), ["minimum", "antiknight", "thermometer"]);

        const x = screen.getByLabelText(/Remove Minimum marker/) as HTMLButtonElement;
        expect(x.disabled).toBe(false);
        expect(x.title).toMatch(/2 placed constraints/);
        fireEvent.click(x);

        expect(onChange).toHaveBeenCalledTimes(1); // the cleanup goes with the tool change and is not a second step
        expect((onChange.mock.calls[0][0] as PuzzleDefinition).constraints).toEqual([{ use: "antiknight" }]);
        expect(onTools).toHaveBeenCalledWith(["antiknight", "thermometer"]);
    });
});

describe("VisualBuilder", () => {
    it("shows a fallback message instead of a palette when there's nothing valid to build on", () => {
        render(<Harness def={undefined} onChange={vi.fn()} />);
        expect(screen.getByText(/fix the json errors/i)).toBeTruthy();
        expect(screen.queryByText("Antiknight")).toBeNull();
    });

    it("adds a zero-field (global) constraint the moment it's picked from the palette, no Add button at all", () => {
        const { onChange } = renderBuilder(basePuzzle);

        fireEvent.click(screen.getByText("Antiknight"));

        expect(onChange).toHaveBeenCalledTimes(1);
        const next = onChange.mock.calls[0][0] as PuzzleDefinition;
        expect(next.constraints).toEqual([{ use: "antiknight" }]);
        expect(screen.queryByText(/Add Antiknight/)).toBeNull();
    });

    it("doesn't add an already-present global rule a second time, and disables its palette button (#121)", () => {
        const { onChange } = renderBuilder({ ...basePuzzle, constraints: [{ use: "antiknight" }] });

        const button = screen.getByRole("button", { name: /^✓ Antiknight/ }) as HTMLButtonElement;
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
        fireEvent.pointerUp(svg); // ends the gesture -- commits, because this schema needs only one cell

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

        fireEvent.pointerDown(cells[0]); // r1c1 -- a thermometer needs 2+ cells, so no preview shape yet
        expect(polyline()).toBeNull();

        fireEvent.pointerEnter(cells[1]); // r1c2 -- now enough for a path
        expect(polyline()?.getAttribute("points")?.split(" ")).toHaveLength(2);

        fireEvent.pointerEnter(cells[2]); // r1c3 -- the line grows again, the drag continues
        expect(polyline()?.getAttribute("points")?.split(" ")).toHaveLength(3);
    });

    it("fills a two-cell-field schema (arrow: bulb vs shaft) by switching the active field and dragging, committing once both are filled", () => {
        const { container, onChange } = renderBuilder(basePuzzle);

        fireEvent.click(screen.getByText("Arrow"));
        const cells = container.querySelectorAll<SVGRectElement>(".cell-bg");
        const svg = container.querySelector("svg.board") as SVGSVGElement;

        fireEvent.pointerDown(cells[0]); // r1c1 -> bulb, the default active field
        fireEvent.pointerUp(svg); // shaft is still empty -- not complete, no commit
        expect(onChange).not.toHaveBeenCalled();

        fireEvent.click(screen.getByText(/Shaft path/)); // change the active field to "cells"
        fireEvent.pointerDown(cells[1]); // r1c2 is selected and replaces the board selection
        fireEvent.pointerEnter(cells[2]); // + r1c3
        fireEvent.pointerUp(svg); // both fields are full -- commits

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

        // the second placement reuses the 10 with no new typing, so the drag alone commits it
        expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("10");
        drag(4, 5);
        expect(onChange).toHaveBeenCalledTimes(2);
        expect((onChange.mock.calls[1][0] as PuzzleDefinition).constraints).toEqual([
            { use: "xv", cells: ["r2c1", "r2c2"], target: 10 },
        ]);

        // change to another schema and back: the value is still 10, and a new value also stays
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

describe("VisualBuilder fog tool (#129)", () => {
    const solved = { ...basePuzzle, solution: { r1c1: 1 } };
    const drag = (container: HTMLElement, from: number, to = from) => {
        const cells = container.querySelectorAll<SVGRectElement>(".cell-bg");
        const svg = container.querySelector("svg.board") as SVGSVGElement;
        fireEvent.pointerDown(cells[from]!);
        if (to !== from) fireEvent.pointerEnter(cells[to]!);
        fireEvent.pointerUp(svg);
    };
    const lastDef = (onChange: ReturnType<typeof vi.fn>) =>
        onChange.mock.calls[onChange.mock.calls.length - 1]![0] as PuzzleDefinition;
    const pickFog = () => fireEvent.click(screen.getByRole("button", { name: "Fog" }));

    it("is a tool like the rest: behind 'Add tool' until picked, then pinned and in use", () => {
        const { onTools } = renderBuilder(solved, vi.fn(), []);
        expect(screen.queryByRole("button", { name: "Fog" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Add tool" }));
        const menu = screen.getByRole("menu");
        expect(within(menu).getByText("Hidden cells")).toBeTruthy(); // its group heading
        fireEvent.click(within(menu).getByText("Fog"));

        expect(onTools).toHaveBeenCalledWith(["fog"]);
        expect(screen.getByRole("button", { name: "Fog" }).getAttribute("aria-pressed")).toBe("true");
        expect(screen.getByText(/Drag on the board to hide cells/)).toBeTruthy();
    });

    it("hides the cells you drag across, adding to any already hidden", () => {
        const { container, onChange } = renderBuilder({ ...solved, fog: { hidden: ["r4c4"] } }, vi.fn(), ["fog"]);
        pickFog();
        drag(container, 0, 1); // r1c1, r1c2
        expect(lastDef(onChange).fog).toEqual({ hidden: ["r4c4", "r1c1", "r1c2"] });
    });

    it("reveals cells instead when asked, and drops the fog field once none are left", () => {
        const { container, onChange } = renderBuilder({ ...solved, fog: { hidden: ["r1c1", "r1c2"] } }, vi.fn(), ["fog"]);
        pickFog();
        fireEvent.click(screen.getByRole("checkbox", { name: "Reveal instead of hide" }));
        drag(container, 0);
        expect(lastDef(onChange).fog).toEqual({ hidden: ["r1c2"] });

        cleanup();
        const second = renderBuilder({ ...solved, fog: { hidden: ["r1c1"] } }, vi.fn(), ["fog"]);
        pickFog();
        fireEvent.click(screen.getByRole("checkbox", { name: "Reveal instead of hide" }));
        drag(second.container, 0);
        expect("fog" in lastDef(second.onChange)).toBe(false);
    });

    it("clears all fog", () => {
        const { onChange } = renderBuilder({ ...solved, fog: { hidden: ["r1c1"] } }, vi.fn(), ["fog"]);
        pickFog();
        fireEvent.click(screen.getByRole("button", { name: "Clear fog" }));
        expect("fog" in lastDef(onChange)).toBe(false);
    });

    it("needs a solution first: a drag does nothing, and Find solution stores the solver's", async () => {
        const { container, onChange } = renderBuilder(basePuzzle, vi.fn(), ["fog"]);
        pickFog();
        expect(screen.getByText(/needs a solution first/)).toBeTruthy();
        drag(container, 0);
        expect(onChange).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole("button", { name: "Find solution" }));
        await waitFor(() => expect(onChange).toHaveBeenCalled());
        expect(Object.keys(lastDef(onChange).solution ?? {})).toHaveLength(16);
    });

    it("x removes the tool and the fog it set, as one step", () => {
        const { onChange, onTools } = renderBuilder({ ...solved, fog: { hidden: ["r2c2"] } }, vi.fn(), ["fog"]);
        fireEvent.click(screen.getByLabelText("Remove Fog from quick access"));
        expect(onTools).toHaveBeenCalledWith([]);
        expect("fog" in lastDef(onChange)).toBe(false);
    });

    it("tints the fogged cells on the board while authoring", () => {
        const { container } = renderBuilder({ ...solved, fog: { hidden: ["r2c2", "r3c3"] } }, vi.fn(), ["fog"]);
        expect(container.querySelectorAll(".shapes rect").length).toBeGreaterThanOrEqual(2);
    });
});

describe("VisualBuilder custom rule tool (#127)", () => {
    const pick = (label: string | RegExp, option: string | RegExp) => {
        fireEvent.click(screen.getByRole("button", { name: label }));
        fireEvent.click(within(screen.getByRole("menu")).getByText(option));
    };
    const lastDef = (onChange: ReturnType<typeof vi.fn>) =>
        onChange.mock.calls[onChange.mock.calls.length - 1]![0] as PuzzleDefinition;

    it("builds `sum of the dragged cells = 7` from parts and adds it as a raw expression", () => {
        const { container, onChange } = renderBuilder(basePuzzle, vi.fn(), ["rule"]);
        fireEvent.click(screen.getByRole("button", { name: "Custom rule" }));
        const add = screen.getByRole("button", { name: "Add rule" }) as HTMLButtonElement;
        expect(add.disabled).toBe(true);

        pick("Rule", "equals (=)");
        pick("Left", "sum of");
        pick("Numbers", "Cells from the board");
        const cells = container.querySelectorAll<SVGRectElement>(".cell-bg");
        const svg = container.querySelector("svg.board") as SVGSVGElement;
        fireEvent.pointerDown(cells[0]!);
        fireEvent.pointerEnter(cells[1]!);
        fireEvent.pointerUp(svg);
        expect(add.disabled).toBe(true); // the right-hand side is still empty

        pick("Right", "A number");
        fireEvent.change(screen.getByLabelText("Right"), { target: { value: "7" } });
        expect(add.disabled).toBe(false);
        fireEvent.click(add);

        expect(lastDef(onChange).constraints).toEqual([["==", ["sum", ["cells", ["r1c1", "r1c2"]]], 7]]);
    });

    it("names the rule when asked, and shows that name in the list", () => {
        const { onChange } = renderBuilder(basePuzzle, vi.fn(), ["rule"]);
        fireEvent.click(screen.getByRole("button", { name: "Custom rule" }));
        pick("Rule", "equals (=)");
        pick("Left", "A number");
        fireEvent.change(screen.getByLabelText("Left"), { target: { value: "2" } });
        pick("Right", "A number");
        fireEvent.change(screen.getByLabelText("Right"), { target: { value: "2" } });
        fireEvent.change(screen.getByLabelText("Name"), { target: { value: " Twos " } });
        fireEvent.click(screen.getByRole("button", { name: "Add rule" }));

        expect(lastDef(onChange).constraints).toEqual([{ rule: ["==", 2, 2], name: "Twos" }]);
        expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe(""); // ready for the next rule
    });

    it("grows a variadic operator, and offers `$` only inside a count's per-cell rule", () => {
        renderBuilder(basePuzzle, vi.fn(), ["rule"]);
        fireEvent.click(screen.getByRole("button", { name: "Custom rule" }));
        pick("Rule", "all of");
        expect(screen.getAllByRole("button", { name: /^Rule \d$/ })).toHaveLength(2);
        fireEvent.click(screen.getByRole("button", { name: /^Add another/ }));
        expect(screen.getAllByRole("button", { name: /^Rule \d$/ })).toHaveLength(3);

        pick("Rule 1", "equals (=)");
        fireEvent.click(screen.getByRole("button", { name: "Left" }));
        expect(within(screen.getByRole("menu")).queryByText(/cell being checked/)).toBeNull();
        fireEvent.click(within(screen.getByRole("menu")).getByText("how many cells satisfy"));
        pick(/^Where/, "is less than (<)");
        fireEvent.click(screen.getByRole("button", { name: "Left" }));
        expect(within(screen.getByRole("menu")).getByText(/cell being checked/)).toBeTruthy();
    });

    it("shows as quick access when the puzzle already has custom rules, and x removes them as one step", () => {
        const puzzle: PuzzleDefinition = { ...basePuzzle, constraints: [{ use: "antiknight" }, ["==", 1, 1]] };
        const { onChange, onTools } = renderBuilder(puzzle, vi.fn(), []);
        expect(screen.getByRole("button", { name: "Custom rule" })).toBeTruthy();
        expect(screen.getByText("1 = 1")).toBeTruthy();
        fireEvent.click(screen.getByLabelText(/Remove Custom rule/));
        expect(lastDef(onChange).constraints).toEqual([{ use: "antiknight" }]);
        expect(onTools).toHaveBeenCalledWith([]);
    });
});

describe("VisualBuilder dynamic rules (#167)", () => {
    const lastDef = (onChange: ReturnType<typeof vi.fn>) =>
        onChange.mock.calls[onChange.mock.calls.length - 1]![0] as PuzzleDefinition;
    const pick = (slot: string | RegExp, item: string) => {
        fireEvent.click(screen.getByRole("button", { name: slot }));
        fireEvent.click(within(screen.getByRole("menu")).getByText(item));
    };

    it("builds a when/then rule from the condition editor and effect targets", () => {
        const puzzle: PuzzleDefinition = { ...basePuzzle, constraints: [{ use: "antiknight" }] };
        const { onChange } = renderBuilder(puzzle, vi.fn(), ["dynamic"]);
        fireEvent.click(screen.getByRole("button", { name: "Dynamic rule" }));
        const add = screen.getByRole("button", { name: "Add dynamic rule" }) as HTMLButtonElement;
        expect(add.disabled).toBe(true);

        pick("Condition", "equals (=)");
        pick("Left", "A number");
        fireEvent.change(screen.getByLabelText("Left"), { target: { value: "1" } });
        pick("Right", "A number");
        fireEvent.change(screen.getByLabelText("Right"), { target: { value: "1" } });
        expect(add.disabled).toBe(true); // no effect yet

        pick("Add effect", "Reveal cells");
        const input = screen.getByLabelText("Reveal cells: cells or regions");
        fireEvent.change(input, { target: { value: "row:0, r2c2" } });
        fireEvent.keyDown(input, { key: "Enter" });
        pick("Add effect", "Stop enforcing constraints");
        pick("Stop enforcing constraints: pick a constraint", "antiknight");
        fireEvent.change(screen.getByLabelText("Name"), { target: { value: " open-up " } });
        expect(add.disabled).toBe(false);
        fireEvent.click(add);

        expect(lastDef(onChange).rules).toEqual([
            { id: "open-up", when: ["==", 1, 1], then: { reveal: ["row:0", "r2c2"], disable: ["antiknight"] } },
        ]);
        expect(lastDef(onChange).constraints).toEqual(puzzle.constraints);
    });

    it("lists existing rules, removes one, and x on the tool takes all of them", () => {
        const rules = [
            { id: "a", when: ["==", 1, 1], then: { reveal: ["row:0"] } },
            { when: ["==", 2, 2], then: { reveal: ["row:1"] } },
        ] as PuzzleDefinition["rules"];
        const puzzle: PuzzleDefinition = { ...basePuzzle, rules };
        const { onChange, onTools } = renderBuilder(puzzle, vi.fn(), []);
        expect(screen.getByText("a: when 1 = 1 → reveal row:0")).toBeTruthy();
        fireEvent.click(screen.getAllByLabelText("Remove dynamic rule")[0]!);
        expect(lastDef(onChange).rules).toEqual([rules![1]]);

        fireEvent.click(screen.getByLabelText(/Remove Dynamic rule/));
        expect(lastDef(onChange).rules).toBeUndefined();
        expect(onTools).toHaveBeenCalledWith([]);
    });
});

describe("VisualBuilder constraint styling (#165)", () => {
    const thermo = { use: "thermometer", cells: ["r1c1", "r1c2", "r1c3"] };
    const lastDef = (onChange: ReturnType<typeof vi.fn>) =>
        onChange.mock.calls[onChange.mock.calls.length - 1]![0] as PuzzleDefinition;

    it("offers styling only for constraints that draw something", () => {
        renderBuilder({ ...basePuzzle, constraints: [{ use: "antiknight" }, thermo] }, vi.fn(), []);
        expect(screen.getAllByLabelText("Style constraint")).toHaveLength(1);
    });

    it("sets a colour, dashed and opacity on that one constraint, and puts them back", () => {
        const other = { use: "thermometer", cells: ["r2c1", "r2c2"] };
        const { onChange } = renderBuilder({ ...basePuzzle, constraints: [thermo, other] }, vi.fn(), []);
        fireEvent.click(screen.getAllByLabelText("Style constraint")[0]!);

        fireEvent.click(screen.getByRole("button", { name: "Set colour" }));
        const color = lastDef(onChange).constraints[0] as { color?: string };
        expect(color.color).toMatch(/^#[0-9a-f]{6}$/i);
        expect(lastDef(onChange).constraints[1]).toEqual(other);

    });

    it("adds dashed and opacity next to what is already there, and removes them again", () => {
        const styled = { ...thermo, color: "#2c7a4b", style: { dashed: true } };
        const { onChange } = renderBuilder({ ...basePuzzle, constraints: [styled] }, vi.fn(), []);
        fireEvent.click(screen.getByLabelText("Style constraint"));
        fireEvent.change(screen.getByLabelText("Opacity"), { target: { value: "40" } });
        expect(lastDef(onChange).constraints[0]).toEqual({ ...styled, style: { dashed: true, opacity: 0.4 } });
        fireEvent.click(screen.getByLabelText("Dashed"));
        expect(lastDef(onChange).constraints[0]).toEqual({ ...thermo, color: "#2c7a4b" });
        fireEvent.click(screen.getByRole("button", { name: "Use default" }));
        expect(lastDef(onChange).constraints[0]).toEqual({ ...thermo, style: { dashed: true } });
    });

    it("compiles with what the editor wrote", () => {
        const { onChange } = renderBuilder({ ...basePuzzle, constraints: [thermo] }, vi.fn(), []);
        fireEvent.click(screen.getByLabelText("Style constraint"));
        fireEvent.click(screen.getByRole("button", { name: "Set colour" }));
        expect(compilePuzzle(lastDef(onChange), definitions)).not.toBeInstanceOf(Error);
    });
});
