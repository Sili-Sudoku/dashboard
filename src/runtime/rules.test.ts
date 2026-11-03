import { describe, expect, it } from "vitest";
import { compilePuzzle } from "@/runtime/compile.ts";
import { evaluate, lookupFromRecord } from "@/runtime/evaluate.ts";
import { PuzzleSession } from "@/runtime/session.ts";
import { hiddenCells } from "@/runtime/fog.ts";
import { holdingRules, ruleAbsentCells, ruleHiddenCells, visibleObjects } from "@/runtime/rules.ts";
import { parsePuzzle } from "@/runtime/serialization.ts";
import { solve } from "@/runtime/solver.ts";
import { definitions } from "@/definitions/index.ts";
import type { PuzzleDefinition } from "@/runtime/puzzle.ts";

const base: PuzzleDefinition = {
    version: 1,
    metadata: { id: "rules", title: "rules" },
    geometry: { type: "grid", width: 4, height: 4, boxWidth: 2, boxHeight: 2 },
    domain: { values: [1, 2, 3, 4] },
    constraints: [{ use: "sudoku" }],
    objects: [{ id: "badge", kind: "text", at: "r1c1", text: "★" }],
};

const topRowDone = ["allDifferent", ["cells", "row:0"]] as const;

const compile = (def: PuzzleDefinition) => {
    const c = compilePuzzle(def, definitions);
    if (c instanceof Error) throw c;
    return c;
};

describe("dynamic rules", () => {
    it("holds only when `when` is definitely true, not while it is undecided", () => {
        const c = compile({ ...base, rules: [{ when: [...topRowDone], then: { show: ["badge"] } }] });
        const rule = c.rules[0]!;
        expect(holdingRules(c, lookupFromRecord({ r1c1: 1, r1c2: 2 })).has(rule)).toBe(false);
        expect(holdingRules(c, lookupFromRecord({ r1c1: 1, r1c2: 2, r1c3: 3, r1c4: 4 })).has(rule)).toBe(true);
        expect(holdingRules(c, lookupFromRecord({ r1c1: 1, r1c2: 1, r1c3: 3, r1c4: 4 })).has(rule)).toBe(false);
    });

    it("shows an object only while its rule holds, and hides one while it holds", () => {
        const done = lookupFromRecord({ r1c1: 1, r1c2: 2, r1c3: 3, r1c4: 4 });
        const none = lookupFromRecord({});
        const shown = compile({ ...base, rules: [{ when: [...topRowDone], then: { show: ["badge"] } }] });
        expect(visibleObjects(shown, none)).toHaveLength(0);
        expect(visibleObjects(shown, done)).toHaveLength(1);
        const hidden = compile({ ...base, rules: [{ when: [...topRowDone], then: { hide: ["badge"] } }] });
        expect(visibleObjects(hidden, none)).toHaveLength(1);
        expect(visibleObjects(hidden, done)).toHaveLength(0);
    });

    it("keeps cells hidden until a rule reveals them, alongside fog", () => {
        const c = compile({
            ...base,
            solution: { r1c1: 1 },
            rules: [{ when: [...topRowDone], then: { reveal: ["row:3", "r2c2"] } }],
        });
        const none = lookupFromRecord({});
        expect([...ruleHiddenCells(c, none)].sort()).toEqual(["r2c2", "r4c1", "r4c2", "r4c3", "r4c4"]);
        expect(ruleHiddenCells(c, lookupFromRecord({ r1c1: 1, r1c2: 2, r1c3: 3, r1c4: 4 })).size).toBe(0);
        expect(hiddenCells(c, none).size).toBe(5);
    });

    it("keeps cells off the board until `appear` holds, and counts them as hidden meanwhile", () => {
        const c = compile({
            ...base,
            givens: { r4c4: 1 },
            rules: [{ when: [...topRowDone], then: { appear: ["row:3"] } }],
        });
        const none = lookupFromRecord({});
        expect([...ruleAbsentCells(c, none)].sort()).toEqual(["r4c1", "r4c2", "r4c3", "r4c4"]);
        expect(hiddenCells(c, none).has("r4c4")).toBe(true); // so a given there cannot leak
        expect(ruleAbsentCells(c, lookupFromRecord({ r1c1: 1, r1c2: 2, r1c3: 3, r1c4: 4 })).size).toBe(0);
    });

    it("can't select, step onto or fill an absent cell, and steps over it", () => {
        const c = compile({ ...base, rules: [{ when: [...topRowDone], then: { appear: ["r2c2"] } }] });
        const session = new PuzzleSession(c);
        session.select("r2c2");
        expect([...session.getSelection()]).not.toContain("r2c2");
        session.select("r2c1");
        session.moveCursor("right");
        expect(session.getCursor()).toBe("r2c3"); // the cursor skips r2c2
        session.select("r1c1", "replace");
        session.select("r2c2", "add");
        session.input(3);
        expect(session.valueOf("r2c2")).toBeNull();
        expect(session.valueOf("r1c1")).toBe(3);
    });

    it("enable/disable fold into the constraints, so the evaluator and solver need no rule knowledge", async () => {
        const gated = compile({
            ...base,
            constraints: [{ rule: ["<", ["value", "r2c1"], ["value", "r2c2"]], name: "ordered" }],
            rules: [{ when: ["==", ["value", "r1c1"], 1], then: { enable: ["ordered"] } }],
        });
        const violated = (values: Record<string, number>) =>
            evaluate(gated, lookupFromRecord(values)).constraints[0]!.status;
        expect(violated({ r2c1: 3, r2c2: 2 })).toBe("incomplete"); // condition undecided
        expect(violated({ r1c1: 2, r2c1: 3, r2c2: 2 })).toBe("satisfied"); // condition false: rule not enforced
        expect(violated({ r1c1: 1, r2c1: 3, r2c2: 2 })).toBe("violated"); // rule enforced and broken
        expect(gated.constraints[0]!.cells).toEqual(expect.arrayContaining(["r1c1", "r2c1", "r2c2"]));

        const off = compile({
            ...base,
            constraints: [{ rule: ["<", ["value", "r2c1"], ["value", "r2c2"]], name: "ordered" }],
            rules: [{ when: ["==", ["value", "r1c1"], 1], then: { disable: ["ordered"] } }],
        });
        expect(evaluate(off, lookupFromRecord({ r1c1: 1, r2c1: 3, r2c2: 2 })).constraints[0]!.status).toBe("satisfied");
        expect(evaluate(off, lookupFromRecord({ r1c1: 2, r2c1: 3, r2c2: 2 })).constraints[0]!.status).toBe("violated");

        // the solver obeys it with no extra support: if r1c1=1, "ordered" is binding
        const found = await solve(
            compile({
                ...base,
                givens: { r1c1: 1 },
                constraints: [{ rule: ["<", ["value", "r2c1"], ["value", "r2c2"]], name: "ordered" }],
                rules: [{ when: ["==", ["value", "r1c1"], 1], then: { enable: ["ordered"] } }],
            }),
        );
        expect(found.solution).toBeDefined();
        expect((found.solution!.r2c1 as number) < (found.solution!.r2c2 as number)).toBe(true);
    });

    it("reaches constraints by compiled id as well as by name", () => {
        const c = compile({
            ...base,
            rules: [{ when: ["==", ["value", "r1c1"], 1], then: { disable: ["sudoku#1"] } }],
        });
        expect((c.constraints[0]!.expr as unknown[])[0]).toBe("or");
        expect((c.constraints[1]!.expr as unknown[])[0]).toBe("allDifferent");
    });

    it("rejects rules that point at nothing", () => {
        const when = ["==", ["value", "r1c1"], 1];
        const err = (then: object) => compilePuzzle({ ...base, rules: [{ id: "r", when, then }] }, definitions);
        expect(err({ show: ["nope"] })).toEqual(new Error('rule "r": show: no visual object has the id "nope"'));
        expect((err({ enable: ["nope"] }) as Error).message).toMatch(/enable: no constraint/);
        expect((err({ reveal: ["zzz"] }) as Error).message).toMatch(/neither a cell nor a region/);
        expect(compilePuzzle({ ...base, rules: [{ when: ["nope", 1], then: {} }] }, definitions)).toBeInstanceOf(Error);
        expect(compilePuzzle({ ...base, rules: [{ when: ["value", "r9c9"], then: {} }] }, definitions)).toBeInstanceOf(
            Error,
        );
    });

    it("follows the board through the session, including undo", () => {
        const c = compile({ ...base, rules: [{ when: [...topRowDone], then: { show: ["badge"] } }] });
        const session = new PuzzleSession(c);
        expect(session.getVisibleObjects()).toHaveLength(0);
        for (const [cell, v] of [
            ["r1c1", 1],
            ["r1c2", 2],
            ["r1c3", 3],
            ["r1c4", 4],
        ] as const) {
            session.select(cell);
            session.input(v);
        }
        expect(session.getVisibleObjects()).toHaveLength(1);
        session.undo();
        expect(session.getVisibleObjects()).toHaveLength(0);
    });

    it("validates the shape in a puzzle file", () => {
        const ok = { ...base, rules: [{ when: [...topRowDone], then: { show: ["badge"] } }] };
        expect(parsePuzzle(ok)).not.toBeInstanceOf(Error);
        expect(parsePuzzle({ ...ok, rules: "x" })).toBeInstanceOf(Error);
        expect(parsePuzzle({ ...ok, rules: [{ when: "x", then: {} }] })).toBeInstanceOf(Error);
        expect(parsePuzzle({ ...ok, rules: [{ when: [...topRowDone], then: { explode: [] } }] })).toBeInstanceOf(Error);
        expect(parsePuzzle({ ...ok, rules: [{ when: [...topRowDone], then: { show: [1] } }] })).toBeInstanceOf(Error);
    });
});
