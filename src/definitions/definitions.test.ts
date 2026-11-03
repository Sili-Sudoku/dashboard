import { describe, expect, it } from "vitest";
import { createGeometry } from "@/runtime/geometry.ts";
import { compilePuzzle } from "@/runtime/compile.ts";
import { evaluate, lookupFromRecord } from "@/runtime/evaluate.ts";
import { evalPredicate } from "@/runtime/operators.ts";
import type { CompileContext } from "@/definitions/types.ts";
import { sudoku } from "@/definitions/sudoku.ts";
import { thermometer } from "@/definitions/thermometer.ts";
import { killer } from "@/definitions/killer.ts";
import { arrow } from "@/definitions/arrow.ts";
import { kropkiDifference, kropkiRatio } from "@/definitions/kropki.ts";
import { odd, even } from "@/definitions/parity.ts";
import { antiknight } from "@/definitions/antiknight.ts";
import { antiking } from "@/definitions/antiking.ts";
import { nonconsecutive } from "@/definitions/nonconsecutive.ts";
import { disjointgroups } from "@/definitions/disjointgroups.ts";
import { palindrome } from "@/definitions/palindrome.ts";
import { clone } from "@/definitions/clone.ts";
import { quadruple } from "@/definitions/quadruple.ts";
import { minimum, maximum } from "@/definitions/minmax.ts";
import { xv } from "@/definitions/xv.ts";
import { sandwich } from "@/definitions/sandwich.ts";
import { betweenline } from "@/definitions/betweenline.ts";
import { negativeRatio, negativeDifference, negativeXV } from "@/definitions/negative.ts";
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
    it("starts the shaft at the bulb's rim and stops the head short of the last digit", () => {
        const out = arrow({ bulb: "r1c1", cells: ["r1c2", "r1c3"] }, ctx());
        if (out instanceof Error) throw out;
        const shaft = out.objects?.find((o) => o.kind === "line");
        expect(shaft).toMatchObject({ kind: "line", arrow: true, trim: { start: 0.4, end: 0.3 } });
    });

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

    it("uses the puzzle's own domain as the positional base, not a hardcoded 10", () => {
        const wideDomain: CompileContext = { ...ctx(), domain: Array.from({ length: 25 }, (_, i) => i + 1) };
        const out = arrow({ bulb: ["r1c1", "r1c2"], cells: ["r2c1", "r2c2"] }, wideDomain);
        if (out instanceof Error) throw out;
        // The base is 26 (max domain value 25, plus one), not 10.
        // With base 10, a bulb cell that holds 12 would collide with the ones column.
        expect(out.constraints[0].expr).toEqual([
            "==",
            ["sum", ["cells", ["r2c1", "r2c2"]]],
            ["+", ["*", 26, ["value", "r1c1"]], ["value", "r1c2"]],
        ]);
    });
});

describe("kropki dot definitions", () => {
    it("difference dot: default value 1, either order", () => {
        const out = kropkiDifference({ cells: ["r1c1", "r1c2"] }, ctx());
        if (out instanceof Error) throw out;
        expect(out.constraints[0].expr).toEqual([
            "or",
            ["==", ["-", ["value", "r1c1"], ["value", "r1c2"]], 1],
            ["==", ["-", ["value", "r1c2"], ["value", "r1c1"]], 1],
        ]);
    });

    it("ratio dot: explicit value, either order", () => {
        const out = kropkiRatio({ cells: ["r1c1", "r1c2"], value: 3 }, ctx());
        if (out instanceof Error) throw out;
        expect(out.constraints[0].expr).toEqual([
            "or",
            ["==", ["value", "r1c1"], ["*", 3, ["value", "r1c2"]]],
            ["==", ["value", "r1c2"], ["*", 3, ["value", "r1c1"]]],
        ]);
    });

    it("rejects anything other than exactly 2 cells", () => {
        expect(kropkiDifference({ cells: ["r1c1", "r1c2", "r1c3"] }, ctx())).toBeInstanceOf(Error);
    });
});

describe("odd/even definitions", () => {
    it("odd compiles to a disjunction over the domain's odd values", () => {
        const out = odd({ cell: "r1c1" }, ctx());
        if (out instanceof Error) throw out;
        expect(out.constraints[0].expr).toEqual([
            "or",
            ["==", ["value", "r1c1"], 1],
            ["==", ["value", "r1c1"], 3],
            ["==", ["value", "r1c1"], 5],
            ["==", ["value", "r1c1"], 7],
            ["==", ["value", "r1c1"], 9],
        ]);
    });

    it("even supports multiple cells via the 'cells' parameter", () => {
        const out = even({ cells: ["r1c1", "r1c2"] }, ctx());
        if (out instanceof Error) throw out;
        expect(out.constraints).toHaveLength(2);
        expect(out.constraints[1].expr).toEqual([
            "or",
            ["==", ["value", "r1c2"], 2],
            ["==", ["value", "r1c2"], 4],
            ["==", ["value", "r1c2"], 6],
            ["==", ["value", "r1c2"], 8],
        ]);
    });

    it("evaluates correctly on a board", () => {
        const geometry = createGeometry({ type: "grid", width: 4, height: 4 });
        const compileCtx: CompileContext = { geometry, regions: {}, domain: [1, 2, 3, 4] };
        const out = odd({ cell: "r1c1" }, compileCtx);
        if (out instanceof Error) throw out;
        const evalCtx = { geometry, regions: {}, domain: [1, 2, 3, 4], valueOf: lookupFromRecord({ r1c1: 2 }) };
        expect(evalPredicate(out.constraints[0].expr, evalCtx)).toBe(false);
    });
});

describe("antiknight definition", () => {
    it("emits != only for knight-move pairs", () => {
        const out = antiknight({}, ctx(3, 3));
        if (out instanceof Error) throw out;
        const labels = out.constraints.map((c) => c.label);
        expect(labels).toContain("antiknight r1c1-r2c3");
        expect(labels).toContain("antiknight r1c1-r3c2");
        expect(labels.some((l) => l === "antiknight r1c1-r1c2")).toBe(false);
        for (const c of out.constraints) expect(Array.isArray(c.expr) && c.expr[0]).toBe("!=");
    });
});

describe("antiking definition", () => {
    it("emits != for every king-move pair, orthogonal and diagonal", () => {
        const out = antiking({}, ctx(3, 3));
        if (out instanceof Error) throw out;
        const labels = out.constraints.map((c) => c.label);
        expect(labels).toContain("antiking r1c1-r1c2");
        expect(labels).toContain("antiking r1c1-r2c2");
        expect(labels.some((l) => l === "antiking r1c1-r3c3")).toBe(false);
    });
});

describe("nonconsecutive definition", () => {
    it("emits one deduped constraint per orthogonal adjacency", () => {
        const out = nonconsecutive({}, ctx(2, 2));
        if (out instanceof Error) throw out;
        expect(out.constraints).toHaveLength(4);
        for (const c of out.constraints) expect(Array.isArray(c.expr) && c.expr[0]).toBe("and");
    });
});

describe("negative definitions", () => {
    it("negativeRatio emits one deduped constraint per adjacency, minus excluded pairs", () => {
        const out = negativeRatio({ excludePairs: [["r1c1", "r1c2"]] }, ctx(2, 2));
        if (out instanceof Error) throw out;
        expect(out.constraints).toHaveLength(3);
        for (const c of out.constraints) expect(Array.isArray(c.expr) && c.expr[0]).toBe("and");
    });

    it("negativeRatio is violated once a pair lands in a 2:1 ratio", () => {
        const puzzle: PuzzleDefinition = {
            version: 1,
            metadata: { id: "p", title: "p" },
            geometry: { type: "grid", width: 1, height: 2 },
            domain: { values: [1, 2, 3, 4, 6] },
            constraints: [{ use: "negativeRatio" }],
        };
        const compiled = compilePuzzle(puzzle, definitions);
        if (compiled instanceof Error) throw compiled;
        const result = evaluate(compiled, lookupFromRecord({ r1c1: 2, r2c1: 4 }));
        expect(result.status).toBe("invalid");
    });

    it("negativeDifference excludes pairs already carrying an explicit kropki dot", () => {
        const out = negativeDifference({ excludePairs: [["r1c1", "r1c2"], ["r1c2", "r1c1"]] }, ctx(2, 1));
        if (out instanceof Error) throw out;
        expect(out.constraints).toHaveLength(0);
    });

    it("negativeXV forbids both the X and V sums for every unmarked adjacency", () => {
        const out = negativeXV({}, ctx(2, 1));
        if (out instanceof Error) throw out;
        expect(out.constraints).toHaveLength(1);
        expect(out.constraints[0].expr).toEqual([
            "and",
            ["!=", ["+", ["value", "r1c1"], ["value", "r1c2"]], 5],
            ["!=", ["+", ["value", "r1c1"], ["value", "r1c2"]], 10],
        ]);
    });
});

describe("disjointgroups definition", () => {
    it("emits one allDifferent per box position", () => {
        const out = disjointgroups({}, ctx());
        if (out instanceof Error) throw out;
        expect(out.constraints).toHaveLength(9);
        for (const c of out.constraints) expect(Array.isArray(c.expr) && c.expr[0]).toBe("allDifferent");
    });

    it("errors when the geometry has no box regions", () => {
        const geometry = createGeometry({ type: "grid", width: 6, height: 6 });
        const noBoxCtx: CompileContext = { geometry, regions: {}, domain: [1, 2, 3, 4, 5, 6] };
        expect(disjointgroups({}, noBoxCtx)).toBeInstanceOf(Error);
    });
});

describe("palindrome definition", () => {
    it("pairs cells inward, skipping an odd middle", () => {
        const out = palindrome({ cells: ["r1c1", "r1c2", "r1c3"] }, ctx());
        if (out instanceof Error) throw out;
        expect(out.constraints).toEqual([{ expr: ["==", ["value", "r1c1"], ["value", "r1c3"]], label: "palindrome r1c1=r1c3" }]);
    });

    it("rejects a single-cell line", () => {
        expect(palindrome({ cells: ["r1c1"] }, ctx())).toBeInstanceOf(Error);
    });
});

describe("clone definition", () => {
    it("pairs cells positionally", () => {
        const out = clone({ cells: ["r1c1", "r1c2"], cloneCells: ["r2c1", "r2c2"] }, ctx());
        if (out instanceof Error) throw out;
        expect(out.constraints).toEqual([
            { expr: ["==", ["value", "r1c1"], ["value", "r2c1"]], label: "clone r1c1=r2c1" },
            { expr: ["==", ["value", "r1c2"], ["value", "r2c2"]], label: "clone r1c2=r2c2" },
        ]);
    });

    it("rejects mismatched lengths", () => {
        expect(clone({ cells: ["r1c1"], cloneCells: ["r2c1", "r2c2"] }, ctx())).toBeInstanceOf(Error);
    });
});

describe("quadruple definition", () => {
    it("requires each value at least its multiplicity in the clue", () => {
        const out = quadruple({ cells: ["r1c1", "r1c2", "r2c1", "r2c2"], values: [3, 3, 5] }, ctx());
        if (out instanceof Error) throw out;
        expect(out.constraints).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ expr: [">=", ["countValue", ["cells", ["r1c1", "r1c2", "r2c1", "r2c2"]], 3], 2] }),
                expect.objectContaining({ expr: [">=", ["countValue", ["cells", ["r1c1", "r1c2", "r2c1", "r2c2"]], 5], 1] }),
            ]),
        );
    });
});

describe("minimum/maximum definitions", () => {
    it("minimum compares <= every orthogonal neighbor", () => {
        const out = minimum({ cell: "r2c2" }, ctx());
        if (out instanceof Error) throw out;
        expect(out.constraints).toHaveLength(4);
        for (const c of out.constraints) expect(Array.isArray(c.expr) && c.expr[0]).toBe("<=");
    });

    it("maximum compares >= and respects a corner's fewer neighbors", () => {
        const out = maximum({ cell: "r1c1" }, ctx());
        if (out instanceof Error) throw out;
        expect(out.constraints).toHaveLength(2);
        for (const c of out.constraints) expect(Array.isArray(c.expr) && c.expr[0]).toBe(">=");
    });
});

describe("minimum/maximum markers", () => {
    it.each([
        ["minimum", minimum],
        ["maximum", maximum],
    ])("keeps every %s chevron point clear of the cell's border lines", (_name, make) => {
        const out = make({ cell: "r2c2" }, ctx());
        if (out instanceof Error) throw out;
        // r2c2 spans x 1..2, y 1..2
        for (const obj of out.objects ?? []) {
            if (obj.kind !== "line") throw new Error("expected a line");
            for (const p of obj.points as { x: number; y: number }[]) {
                expect(p.x).toBeGreaterThan(1.08);
                expect(p.x).toBeLessThan(1.92);
                expect(p.y).toBeGreaterThan(1.08);
                expect(p.y).toBeLessThan(1.92);
            }
        }
    });
});

describe("xv definition", () => {
    it("sums to the target", () => {
        const out = xv({ cells: ["r1c1", "r1c2"], target: 10 }, ctx());
        if (out instanceof Error) throw out;
        expect(out.constraints[0].expr).toEqual(["==", ["+", ["value", "r1c1"], ["value", "r1c2"]], 10]);
    });

    it("rejects anything other than exactly 2 cells", () => {
        expect(xv({ cells: ["r1c1"], target: 10 }, ctx())).toBeInstanceOf(Error);
    });
});

describe("sandwich definition", () => {
    it("evaluates true when the sum between min and max matches", () => {
        const geometry = createGeometry({ type: "grid", width: 3, height: 1 });
        const compileCtx: CompileContext = { geometry, regions: {}, domain: [1, 2, 3] };
        const out = sandwich({ cells: ["r1c1", "r1c2", "r1c3"], sum: 2 }, compileCtx);
        if (out instanceof Error) throw out;
        const evalCtx = { geometry, regions: {}, domain: [1, 2, 3], valueOf: lookupFromRecord({ r1c1: 1, r1c2: 2, r1c3: 3 }) };
        expect(evalPredicate(out.constraints[0].expr, evalCtx)).toBe(true);
    });

    it("draws its sum just outside the line, before the first cell", () => {
        const row = ctx(3, 3);
        const rowOut = sandwich({ cells: ["r2c1", "r2c2", "r2c3"], sum: 5 }, { ...row, domain: [1, 2, 3] });
        if (rowOut instanceof Error) throw rowOut;
        expect(rowOut.objects).toEqual([expect.objectContaining({ kind: "text", text: "5", at: { x: -0.5, y: 1.5 } })]);

        const col = sandwich({ cells: ["r1c3", "r2c3", "r3c3"], sum: 4 }, { ...row, domain: [1, 2, 3] });
        if (col instanceof Error) throw col;
        expect(col.objects).toEqual([expect.objectContaining({ at: { x: 2.5, y: -0.5 } })]);
    });

    it("rejects a domain with only one value", () => {
        const geometry = createGeometry({ type: "grid", width: 2, height: 1 });
        const compileCtx: CompileContext = { geometry, regions: {}, domain: [1] };
        expect(sandwich({ cells: ["r1c1", "r1c2"], sum: 0 }, compileCtx)).toBeInstanceOf(Error);
    });
});

describe("betweenline definition", () => {
    it("evaluates true when the interior cell lies strictly between the endpoints", () => {
        const geometry = createGeometry({ type: "grid", width: 3, height: 1 });
        const compileCtx: CompileContext = { geometry, regions: {}, domain: [1, 2, 3, 4, 5, 6, 7, 8, 9] };
        const out = betweenline({ cells: ["r1c1", "r1c2", "r1c3"] }, compileCtx);
        if (out instanceof Error) throw out;
        const evalCtx = {
            geometry,
            regions: {},
            domain: compileCtx.domain,
            valueOf: lookupFromRecord({ r1c1: 1, r1c2: 5, r1c3: 9 }),
        };
        expect(evalPredicate(out.constraints[0].expr, evalCtx)).toBe(true);
    });

    it("rejects fewer than 3 cells", () => {
        expect(betweenline({ cells: ["r1c1", "r1c2"] }, ctx())).toBeInstanceOf(Error);
    });
});

describe("killer definition with distinct: false (little killer)", () => {
    it("omits allDifferent, keeping only the sum", () => {
        const out = killer({ cells: ["r1c1", "r2c2", "r3c3"], sum: 15, distinct: false }, ctx());
        if (out instanceof Error) throw out;
        expect(out.constraints).toHaveLength(1);
        expect(Array.isArray(out.constraints[0].expr) && out.constraints[0].expr[0]).toBe("==");
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
