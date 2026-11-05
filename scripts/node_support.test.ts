import { describe as suite, expect, it } from "vitest";
import { daysUntilEnd, describe, requiredMajor, WARN_DAYS, type Schedule } from "./node_support.ts";

const schedule: Schedule = { v24: { end: "2028-04-30" }, v22: { end: "2027-04-30" } };
const day = (iso: string) => new Date(iso);

suite("requiredMajor", () => {
    it("reads the major version from engines.node", () => {
        expect(requiredMajor(">=24")).toBe(24);
        expect(requiredMajor("^22.1.0")).toBe(22);
        expect(() => requiredMajor("latest")).toThrow();
    });
});

suite("daysUntilEnd", () => {
    it("counts days to the end of life, negative after it", () => {
        expect(daysUntilEnd(schedule, 24, day("2028-04-29"))).toBe(1);
        expect(daysUntilEnd(schedule, 24, day("2028-05-10"))).toBe(-10);
    });
    it("is undefined for a version that is not in the schedule", () => {
        expect(daysUntilEnd(schedule, 99, day("2026-11-05"))).toBeUndefined();
    });
});

suite("describe", () => {
    it("passes while the end of life is far away", () => {
        expect(describe(24, WARN_DAYS + 1).ok).toBe(true);
    });
    it("fails inside the warning window and after the end", () => {
        expect(describe(24, WARN_DAYS).ok).toBe(false);
        expect(describe(24, -1).message).toMatch(/past its end of life/);
    });
    it("does not fail for an unknown version", () => {
        expect(describe(99, undefined).ok).toBe(true);
    });
});
