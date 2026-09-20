import { describe, expect, it } from "vitest";
import { createGeometry } from "@/runtime/geometry.ts";
import { compilePuzzle } from "@/runtime/compile.ts";
import { evaluate, lookupFromRecord } from "@/runtime/evaluate.ts";
import type { CompileContext } from "@/definitions/types.ts";
import { sudoku } from "@/definitions/sudoku.ts";
import { thermometer } from "@/definitions/thermometer.ts";
import { killer } from "@/definitions/killer.ts";
import { arrow } from "@/definitions/arrow.ts";
import { definitions } from "@/definitions/index.ts";
import type { PuzzleDefinition } from "@/runtime/puzzle.ts";

const ctx = (w = 9, h = 9): CompileContext => ({
    geometry: createGeometry({ type: "grid", width: w, height: h }),
    regions: {},
    domain: [1, 2, 3, 4, 5, 6, 7, 8, 9],
});

describe("sudoku definition", () => {
    it("emits one allDifferent per row, column and box — and nothing engine-specific", () => {
        const out = sudoku({}, ctx());
        if (out instanceof Error) throw out;
        expect(out.constraints).toHaveLength(27);
        for (const c of out.constraints) {
            expect(Array.isArray(c.expr) && c.expr[0]).toBe("allDifferent");
        }
    });

    it("can skip boxes and add extra named regions", () => {
        const withRegion: CompileContext = { ...ctx(), regions: { "window:1": ["r2c2", "r2c3"] } };
        const out = sudoku({ boxes: false, extraRegions: ["window:1"] }, withRegion);
        if (out instanceof Error) throw out;
        expect(out.constraints).toHaveLength(9 + 9 + 1);
    });
});

describe("thermometer definition", () => {
    it("compiles to a single strictIncreasing over the path and adds visuals", () => {
        const out = thermometer({ cells: ["r1c1", "r1c2", "r1c3"] }, ctx());
        if (out instanceof Error) throw out;
        expect(out.constraints[0].expr).toEqual(["strictIncreasing", ["cells", ["r1c1", "r1c2", "r1c3"]]]);
        expect(out.objects?.map((o) => o.kind).sort()).toEqual(["circle", "path"]);
    });

    it("rejects a path shorter than two cells or with bad cells", () => {
        expect(thermometer({ cells: ["r1c1"] }, ctx())).toBeInstanceOf(Error);
        expect(thermometer({ cells: ["r1c1", "r99c1"] }, ctx())).toBeInstanceOf(Error);
    });
});

describe("killer definition", () => {
    it("compiles to allDifferent plus an optional sum and a cage visual", () => {
        const out = killer({ cells: ["r1c1", "r1c2"], sum: 7 }, ctx());
        if (out instanceof Error) throw out;
        expect(out.constraints.map((c) => (Array.isArray(c.expr) ? c.expr[0] : c.expr))).toEqual([
            "allDifferent",
            "==",
        ]);
        expect(out.objects?.[0]).toMatchObject({ kind: "cage", label: "7" });
    });

    it("omits the sum constraint when no target is given", () => {
        const out = killer({ cells: ["r1c1", "r1c2"] }, ctx());
        if (out instanceof Error) throw out;
        expect(out.constraints).toHaveLength(1);
    });
});

describe("arrow definition", () => {
    it("compiles to sum(shaft) == value(bulb)", () => {
        const out = arrow({ bulb: "r1c1", cells: ["r1c2", "r1c3"] }, ctx());
        if (out instanceof Error) throw out;
        expect(out.constraints[0].expr).toEqual([
            "==",
            ["sum", ["cells", ["r1c2", "r1c3"]]],
            ["value", "r1c1"],
        ]);
    });

    it("treats a multi-cell bulb as a multi-digit number", () => {
        const out = arrow({ bulb: ["r1c1", "r1c2"], cells: ["r2c1", "r2c2"] }, ctx());
        if (out instanceof Error) throw out;
        expect(out.constraints[0].expr).toEqual([
            "==",
            ["sum", ["cells", ["r2c1", "r2c2"]]],
            ["+", ["*", 10, ["value", "r1c1"]], ["value", "r1c2"]],
        ]);
    });
});

describe("definitions are not privileged", () => {
    const primitivePuzzle: PuzzleDefinition = {
        version: 1,
        metadata: { id: "p", title: "p" },
        geometry: { type: "grid", width: 4, height: 4, boxWidth: 2, boxHeight: 2 },
        domain: { values: [1, 2, 3, 4] },
        constraints: [["allDifferent", ["cells", "row:0"]]],
    };

    it("a primitive-only puzzle compiles with an empty registry", () => {
        expect(compilePuzzle(primitivePuzzle, {})).not.toBeInstanceOf(Error);
    });

    it("the same primitives a definition emits can be hand-written and evaluate identically", () => {
        const viaDefinition = compilePuzzle(
            {
                ...primitivePuzzle,
                constraints: [{ use: "thermometer", cells: ["r1c1", "r1c2", "r1c3", "r1c4"] }],
            },
            definitions,
        );
        const viaPrimitive = compilePuzzle(
            {
                ...primitivePuzzle,
                constraints: [["strictIncreasing", ["cells", ["r1c1", "r1c2", "r1c3", "r1c4"]]]],
            },
            {},
        );
        if (viaDefinition instanceof Error || viaPrimitive instanceof Error) throw new Error("compile failed");

        const board = { r1c1: 1, r1c2: 2, r1c3: 4, r1c4: 3 };
        const a = evaluate(viaDefinition, lookupFromRecord(board));
        const b = evaluate(viaPrimitive, lookupFromRecord(board));
        expect(a.constraints[0].status).toBe("violated");
        expect(b.constraints[0].status).toBe("violated");
    });
});
