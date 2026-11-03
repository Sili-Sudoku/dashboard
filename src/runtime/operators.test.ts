import { describe, expect, it } from "vitest";
import { evalExpr, staticCheckExpr } from "@/runtime/operators.ts";
import { ExpressionError } from "@/runtime/expression.ts";
import { makeCtx, run } from "@/runtime/test_support.ts";

describe("primitive operators", () => {
    describe("references and grouping", () => {
        it("value reads a cell or reports unknown", () => {
            expect(run(["value", "r1c1"], { values: { r1c1: 4 } })).toEqual({ t: "num", v: 4 });
            expect(run(["value", "r1c1"])).toEqual({ t: "unknown" });
        });

        it("cells resolves selectors, named regions and explicit lists", () => {
            expect(run(["cells", "row:0"])).toEqual({ t: "cells", v: expect.any(Array) });
            expect(run(["cells", ["r1c1", "r1c2"]])).toEqual({ t: "cells", v: ["r1c1", "r1c2"] });
            expect(run(["cells", "cage:A"], { regions: { "cage:A": ["r5c5", "r5c6"] } })).toEqual({
                t: "cells",
                v: ["r5c5", "r5c6"],
            });
        });

        it("values returns a nullable list preserving empties", () => {
            expect(run(["values", ["r1c1", "r1c2", "r1c3"]], { values: { r1c1: 1, r1c3: 3 } })).toEqual({
                t: "nums",
                v: [1, null, 3],
            });
        });
    });

    describe("arithmetic", () => {
        it("sums a group, unknown until every cell is filled", () => {
            expect(run(["sum", ["cells", ["r1c1", "r1c2"]]], { values: { r1c1: 4, r1c2: 5 } })).toEqual({
                t: "num",
                v: 9,
            });
            expect(run(["sum", ["cells", ["r1c1", "r1c2"]]], { values: { r1c1: 4 } })).toEqual({ t: "unknown" });
        });

        it("supports +, -, * over scalars", () => {
            expect(run(["+", 2, 3, 4])).toEqual({ t: "num", v: 9 });
            expect(run(["-", 10, 3])).toEqual({ t: "num", v: 7 });
            expect(run(["*", 10, ["value", "r1c1"]], { values: { r1c1: 3 } })).toEqual({ t: "num", v: 30 });
            expect(run(["+", 1, ["value", "r1c1"]])).toEqual({ t: "unknown" });
        });
    });

    describe("counting", () => {
        it("countValue counts matching cells once all are known", () => {
            const values = { r1c1: 5, r1c2: 5, r1c3: 2 };
            expect(run(["countValue", ["cells", ["r1c1", "r1c2", "r1c3"]], 5], { values })).toEqual({ t: "num", v: 2 });
            expect(run(["countValue", ["cells", ["r1c1", "r1c2", "r1c3"]], 5], { values: { r1c1: 5 } })).toEqual({
                t: "unknown",
            });
        });

        it("count evaluates a predicate with $ bound to each value", () => {
            const values = { r1c1: 6, r1c2: 2, r1c3: 8 };
            expect(run(["count", ["cells", ["r1c1", "r1c2", "r1c3"]], [">", "$", 4]], { values })).toEqual({
                t: "num",
                v: 2,
            });
        });
    });

    describe("grouping predicates", () => {
        it("allDifferent: false on a duplicate, unknown while incomplete, true when clean and full", () => {
            expect(run(["allDifferent", ["cells", ["r1c1", "r1c2"]]], { values: { r1c1: 3, r1c2: 3 } })).toEqual({
                t: "bool",
                v: false,
            });
            expect(run(["allDifferent", ["cells", ["r1c1", "r1c2"]]], { values: { r1c1: 3 } })).toEqual({
                t: "unknown",
            });
            expect(run(["allDifferent", ["cells", ["r1c1", "r1c2"]]], { values: { r1c1: 3, r1c2: 4 } })).toEqual({
                t: "bool",
                v: true,
            });
        });
    });

    describe("ordering", () => {
        const seq = ["cells", ["r1c1", "r1c2", "r1c3"]] as const;
        it("strictIncreasing flags a bad pair immediately", () => {
            expect(run(["strictIncreasing", seq], { values: { r1c1: 5, r1c2: 3 } })).toEqual({ t: "bool", v: false });
        });
        it("strictIncreasing is unknown when only a partial prefix is known and consistent", () => {
            expect(run(["strictIncreasing", seq], { values: { r1c1: 1, r1c2: 4 } })).toEqual({ t: "unknown" });
        });
        it("strictIncreasing is true once the whole sequence is known and ordered", () => {
            expect(run(["strictIncreasing", seq], { values: { r1c1: 1, r1c2: 4, r1c3: 6 } })).toEqual({
                t: "bool",
                v: true,
            });
        });
        it("increasing allows equal neighbours", () => {
            expect(run(["increasing", seq], { values: { r1c1: 2, r1c2: 2, r1c3: 5 } })).toEqual({ t: "bool", v: true });
        });
    });

    describe("comparison and logic (Kleene)", () => {
        it("comparisons are unknown if either side is unknown", () => {
            expect(run(["==", ["value", "r1c1"], 5])).toEqual({ t: "unknown" });
            expect(run(["==", ["value", "r1c1"], 5], { values: { r1c1: 5 } })).toEqual({ t: "bool", v: true });
            expect(run(["<", 2, 3])).toEqual({ t: "bool", v: true });
        });

        it("and/or/not follow three-valued logic", () => {
            expect(run(["and", true, ["==", ["value", "r1c1"], 1]])).toEqual({ t: "unknown" });
            expect(run(["and", false, ["==", ["value", "r1c1"], 1]])).toEqual({ t: "bool", v: false });
            expect(run(["or", true, ["==", ["value", "r1c1"], 1]])).toEqual({ t: "bool", v: true });
            expect(run(["not", true])).toEqual({ t: "bool", v: false });
            expect(run(["not", ["==", ["value", "r1c1"], 1]])).toEqual({ t: "unknown" });
        });

        it("implies short-circuits a false antecedent", () => {
            expect(run(["implies", false, ["==", ["value", "r1c1"], 1]])).toEqual({ t: "bool", v: true });
        });
    });

    describe("adjacency", () => {
        it("uses the geometry", () => {
            expect(run(["adjacent", "r1c1", "r1c2"])).toEqual({ t: "bool", v: true });
            expect(run(["adjacent", "r1c1", "r3c3"])).toEqual({ t: "bool", v: false });
        });
    });

    describe("errors", () => {
        it("throws on unknown operator, selector, and bad bare strings", () => {
            expect(() => evalExpr(["bogusOp", 1], makeCtx())).toThrow(ExpressionError);
            expect(() => evalExpr(["cells", "cage:missing"], makeCtx())).toThrow(/unknown cell or region/);
            expect(() => evalExpr("hello", makeCtx())).toThrow(/bare string/);
        });

        it("staticCheckExpr catches unknown operators without a board", () => {
            expect(() => staticCheckExpr(["allDifferent", ["cells", "row:0"]])).not.toThrow();
            expect(() => staticCheckExpr(["nope", 1])).toThrow(/unknown operator/);
        });
    });
});
