import { describe, expect, it } from "vitest";

import {
    addArg,
    argSpec,
    bindsEachAt,
    describeExpr,
    getAt,
    isComplete,
    leafFor,
    newOp,
    removeArg,
    setAt,
    specAt,
    toExpr,
    type RuleNode,
} from "@/authoring/rule_tree.ts";
import { signatureOf } from "@/authoring/operators.ts";
import { compilePuzzle } from "@/runtime/compile.ts";
import { definitions } from "@/definitions/index.ts";

const cells = (...ids: string[]): RuleNode => ({ k: "cells", cells: ids, selector: "" });
const num = (value: number): RuleNode => ({ k: "num", value });

describe("rule tree", () => {
    it("starts an operator with an empty slot per argument, and its minimum for a variadic one", () => {
        expect(newOp("==")).toEqual({ k: "op", name: "==", args: [null, null] });
        expect((newOp("and") as unknown as { args: unknown[] }).args).toHaveLength(2);
        expect(isComplete(newOp("=="))).toBe(false);
    });

    it("builds `sum of cells = 15` and turns it into the runtime's own expression", () => {
        let tree = setAt(null, [], newOp("=="));
        tree = setAt(tree, [0], newOp("sum"));
        tree = setAt(tree, [0, 0], cells("r1c1", "r1c2", "r1c3"));
        expect(isComplete(tree)).toBe(false);
        tree = setAt(tree, [1], num(15));
        expect(isComplete(tree)).toBe(true);
        expect(toExpr(tree as RuleNode)).toEqual(["==", ["sum", ["cells", ["r1c1", "r1c2", "r1c3"]]], 15]);
    });

    it("says what each slot takes, including the repeating one", () => {
        const tree = setAt(null, [], newOp("and"));
        expect(specAt(tree, [])).toMatchObject({ kind: "bool" });
        expect(specAt(tree, [1])).toMatchObject({ kind: "bool" });
        expect(specAt(tree, [2])).toBeUndefined();
        expect(argSpec(signatureOf("count")!, 1)).toMatchObject({ kind: "bool", bindsEach: true });
    });

    it("grows and shrinks a variadic operator, but never below its minimum", () => {
        let tree = setAt(null, [], newOp("or"));
        tree = addArg(tree, []);
        expect((tree as unknown as { args: unknown[] }).args).toHaveLength(3);
        tree = removeArg(tree, [], 2);
        expect((tree as unknown as { args: unknown[] }).args).toHaveLength(2);
        expect(removeArg(tree, [], 1)).toBe(tree); // already at the minimum
        expect(addArg(setAt(null, [], newOp("==")), [])).toEqual(newOp("==")); // not variadic: unchanged
    });

    it("offers `$` only under a count's per-cell rule", () => {
        let tree = setAt(null, [], newOp("=="));
        tree = setAt(tree, [0], newOp("count"));
        expect(bindsEachAt(tree, [0, 1])).toBe(true);
        expect(bindsEachAt(tree, [0, 0])).toBe(false);
        expect(bindsEachAt(tree, [1])).toBe(false);
    });

    it("writes the leaves the way the runtime reads them", () => {
        expect(toExpr({ k: "cells", cells: [], selector: " row:2 " })).toEqual(["cells", "row:2"]);
        expect(toExpr({ k: "cell", cell: "r2c2" })).toBe("r2c2");
        expect(toExpr({ k: "each" })).toBe("$");
        expect(leafFor("bool")).toBeNull();
        expect(leafFor("nums")).toEqual({ k: "cells", cells: [], selector: "" });
    });

    it("reads a tree by path", () => {
        const tree = setAt(setAt(null, [], newOp("not")), [0], newOp("==")) as RuleNode;
        expect(getAt(tree, [0])).toMatchObject({ name: "==" });
        expect(getAt(tree, [0, 5])).toBeNull();
    });
});

describe("describeExpr", () => {
    it("reads infix rules naturally", () => {
        expect(describeExpr(["==", ["sum", ["cells", ["r1c1", "r1c2"]]], 15])).toBe("sum(r1c1, r1c2) = 15");
        expect(describeExpr([">=", ["-", ["value", "r1c1"], ["value", "r1c2"]], 5])).toBe(
            "(value(r1c1) − value(r1c2)) ≥ 5",
        );
        expect(describeExpr(["and", ["<", 1, 2], ["not", ["==", 1, 2]]])).toBe("(1 < 2) and not(1 = 2)");
    });

    it("shortens a long cell list and keeps a selector as written", () => {
        const ids = Array.from({ length: 9 }, (_, i) => `r1c${i + 1}`);
        expect(describeExpr(["allDifferent", ["cells", ids]])).toBe("allDifferent(r1c1…r1c9 (9 cells))");
        expect(describeExpr(["allDifferent", ["cells", "row:0"]])).toBe("allDifferent(row:0)");
    });

    it("never throws on odd input", () => {
        expect(() => describeExpr([])).not.toThrow();
        expect(describeExpr(true)).toBe("true");
    });
});

describe("a finished tree is a real constraint", () => {
    it("compiles as a puzzle's raw constraint", () => {
        const tree = setAt(
            setAt(setAt(null, [], newOp("==")), [0], newOp("sum")),
            [0, 0],
            cells("r1c1", "r1c2"),
        ) as RuleNode;
        const full = setAt(tree, [1], num(3)) as RuleNode;
        const result = compilePuzzle(
            {
                version: 1,
                metadata: { id: "r", title: "r" },
                geometry: { type: "grid", width: 2, height: 2 },
                domain: { values: [1, 2] },
                constraints: [toExpr(full)],
            },
            definitions,
        );
        expect(result instanceof Error).toBe(false);
    });
});
