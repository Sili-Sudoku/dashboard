import { describe, expect, it } from "vitest";

import { NOT_OFFERED, OPERATOR_SIGNATURES, operatorsFor, signatureOf } from "@/authoring/operators.ts";
import { operatorNames } from "@/runtime/operators.ts";

describe("operator signatures (#127)", () => {
    it("describe exactly the runtime's operators, bar the few the builder expresses another way", () => {
        const described = new Set(OPERATOR_SIGNATURES.map((s) => s.name));
        const runtime = new Set(operatorNames());
        for (const name of runtime) {
            expect(described.has(name) || NOT_OFFERED.includes(name), `operator "${name}" has no signature`).toBe(true);
        }
        for (const name of described) expect(runtime.has(name), `"${name}" is not a runtime operator`).toBe(true);
        expect(OPERATOR_SIGNATURES.length).toBe(described.size); // no duplicates
    });

    it("offers a number-slot only operators that produce a number, a rule-slot only rules", () => {
        expect(operatorsFor("num").every((s) => s.returns === "num")).toBe(true);
        expect(operatorsFor("bool").every((s) => s.returns === "bool")).toBe(true);
        expect(signatureOf("count")?.args[1]).toMatchObject({ kind: "bool", bindsEach: true });
    });

    it("gives variadic operators a minimum, and fixed ones no `rest`", () => {
        expect(signatureOf("and")?.rest?.min).toBe(2);
        expect(signatureOf("==")?.rest).toBeUndefined();
    });
});
