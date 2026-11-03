import { describe, expect, it } from "vitest";

import {
    AUTHORING_SCHEMAS,
    authoringSchemasOf,
    buildConstraintParams,
    cellFieldsOf,
    isSchemaComplete,
    summarizeConstraint,
} from "@/authoring/schema.ts";
import { definitions } from "@/definitions/index.ts";
import type { ConstraintDefinition } from "@/definitions/types.ts";
import type { ConstraintSpec } from "@/runtime/puzzle.ts";

describe("AUTHORING_SCHEMAS", () => {
    it("every schema name is a real entry in the definition registry", () => {
        for (const schema of AUTHORING_SCHEMAS) {
            expect(definitions[schema.name], `no definition registered for "${schema.name}"`).toBeDefined();
        }
    });

    it("has no duplicate names", () => {
        const names = AUTHORING_SCHEMAS.map((s) => s.name);
        expect(new Set(names).size).toBe(names.length);
    });
});

describe("buildConstraintParams", () => {
    it("omits a boolean left at its own default, includes it when flipped", () => {
        const schema = AUTHORING_SCHEMAS.find((s) => s.name === "thermometer")!;
        const base = buildConstraintParams(schema, { cells: ["r1c1", "r1c2"] });
        expect(base).toEqual({ cells: ["r1c1", "r1c2"] });

        const flipped = buildConstraintParams(schema, { cells: ["r1c1", "r1c2"], strict: false });
        expect(flipped).toEqual({ cells: ["r1c1", "r1c2"], strict: false });
    });

    it("omits an optional number left unset, includes a required one", () => {
        const xv = AUTHORING_SCHEMAS.find((s) => s.name === "xv")!;
        expect(buildConstraintParams(xv, { cells: ["r1c1", "r1c2"], target: 10 })).toEqual({
            cells: ["r1c1", "r1c2"],
            target: 10,
        });

        const killer = AUTHORING_SCHEMAS.find((s) => s.name === "killer")!;
        expect(buildConstraintParams(killer, { cells: ["r1c1"] })).toEqual({ cells: ["r1c1"] });
    });

    it("serializes a single-cell field as a bare string, not an array", () => {
        const minimum = AUTHORING_SCHEMAS.find((s) => s.name === "minimum")!;
        expect(buildConstraintParams(minimum, { cell: "r3c3" })).toEqual({ cell: "r3c3" });
    });

    it("serializes a numberList field as a number array", () => {
        const quadruple = AUTHORING_SCHEMAS.find((s) => s.name === "quadruple")!;
        expect(buildConstraintParams(quadruple, { cells: ["r1c1"], values: [3, 3] })).toEqual({
            cells: ["r1c1"],
            values: [3, 3],
        });
    });
});

describe("isSchemaComplete", () => {
    it("a global (zero-field) schema is always complete", () => {
        const antiknight = AUTHORING_SCHEMAS.find((s) => s.name === "antiknight")!;
        expect(isSchemaComplete(antiknight, {})).toBe(true);
    });

    it("rejects too few cells, a missing required number, or an undersized pair", () => {
        const thermometer = AUTHORING_SCHEMAS.find((s) => s.name === "thermometer")!;
        expect(isSchemaComplete(thermometer, { cells: ["r1c1"] })).toBe(false);
        expect(isSchemaComplete(thermometer, { cells: ["r1c1", "r1c2"] })).toBe(true);

        const xv = AUTHORING_SCHEMAS.find((s) => s.name === "xv")!;
        expect(isSchemaComplete(xv, { cells: ["r1c1", "r1c2"] })).toBe(false);
        expect(isSchemaComplete(xv, { cells: ["r1c1", "r1c2"], target: 10 })).toBe(true);

        const kropki = AUTHORING_SCHEMAS.find((s) => s.name === "kropkiDifference")!;
        expect(isSchemaComplete(kropki, { cells: ["r1c1", "r1c2", "r1c3"] })).toBe(false);
    });

    it("accepts a two-cell-field schema only once both fields are filled", () => {
        const arrow = AUTHORING_SCHEMAS.find((s) => s.name === "arrow")!;
        expect(isSchemaComplete(arrow, { bulb: ["r1c1"] })).toBe(false);
        expect(isSchemaComplete(arrow, { bulb: ["r1c1"], cells: ["r1c2", "r1c3"] })).toBe(true);
    });
});

describe("cellFieldsOf", () => {
    it("excludes number/boolean/numberList fields, keeping only cell/cells", () => {
        const killer = AUTHORING_SCHEMAS.find((s) => s.name === "killer")!;
        expect(cellFieldsOf(killer).map((f) => f.key)).toEqual(["cells"]);

        const sudoku = AUTHORING_SCHEMAS.find((s) => s.name === "sudoku")!;
        expect(cellFieldsOf(sudoku)).toEqual([]);
    });
});

describe("summarizeConstraint", () => {
    it("labels a definition reference using its schema, with params", () => {
        const spec: ConstraintSpec = { use: "killer", cells: ["r1c1", "r1c2"], sum: 10 };
        expect(summarizeConstraint(spec)).toBe("Killer cage (cells=r1c1,r1c2, sum=10)");
    });

    it("falls back to the raw use name for an unknown definition", () => {
        expect(summarizeConstraint({ use: "mystery" })).toBe("mystery");
    });

    it("flags a raw primitive expression distinctly", () => {
        expect(summarizeConstraint(["==", 1, 1])).toBe("1 = 1");
        expect(summarizeConstraint({ rule: ["==", 1, 1], name: "Twos" })).toBe("Twos");
        expect(summarizeConstraint({ use: "minimum", cell: "r1c1", color: "#fff", style: { dashed: true } })).toBe(
            summarizeConstraint({ use: "minimum", cell: "r1c1" }),
        );
        expect(summarizeConstraint({ rule: ["==", 1, 1] })).toBe("1 = 1");
    });
});

describe("authoringSchemasOf (a definition carries its own schema)", () => {
    it("collects the schema each definition declares, keyed by its registry name, and skips the rest", () => {
        const mine: ConstraintDefinition = () => ({ constraints: [] });
        mine.schema = { label: "Mine", fields: [{ kind: "cells", key: "cells", label: "Cells", min: 1 }] };
        const bare: ConstraintDefinition = () => ({ constraints: [] });

        const schemas = authoringSchemasOf({ mine, bare });
        expect(schemas).toEqual([{ name: "mine", label: "Mine", fields: mine.schema.fields }]);
    });

    it("gives the built-in palette exactly the definitions that declare one", () => {
        const declared = Object.entries(definitions)
            .filter(([, d]) => d.schema)
            .map(([name]) => name);
        expect(AUTHORING_SCHEMAS.map((s) => s.name)).toEqual(declared);
        expect(declared).toContain("thermometer");
    });
});
