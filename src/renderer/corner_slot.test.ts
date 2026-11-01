import { describe, expect, it } from "vitest";

import { cornerSlot } from "@/renderer/corner_slot.ts";

describe("cornerSlot", () => {
    it("lays 1-9 out row by row in a 3x3 grid", () => {
        expect(cornerSlot(1)).toEqual({ col: 0, row: 0 });
        expect(cornerSlot(6)).toEqual({ col: 2, row: 1 });
        expect(cornerSlot(9)).toEqual({ col: 2, row: 2 });
    });

    it("keeps 0 inside the cell (centre) rather than off its top-left", () => {
        expect(cornerSlot(0)).toEqual({ col: 1, row: 1 });
    });
});
