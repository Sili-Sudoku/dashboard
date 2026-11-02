import { describe, expect, it } from "vitest";

import { cornerSlot } from "@/renderer/corner_slot.ts";

describe("cornerSlot", () => {
    it("fills the four corners first, in reading order", () => {
        expect(cornerSlot(0)).toEqual({ col: 0, row: 0 });
        expect(cornerSlot(1)).toEqual({ col: 2, row: 0 });
        expect(cornerSlot(2)).toEqual({ col: 0, row: 2 });
        expect(cornerSlot(3)).toEqual({ col: 2, row: 2 });
    });

    it("then uses the middle of the sides, and the centre last", () => {
        expect(cornerSlot(4)).toEqual({ col: 1, row: 0 });
        expect(cornerSlot(8)).toEqual({ col: 1, row: 1 });
    });

    it("keeps further notes inside the cell (the centre) instead of off its edge", () => {
        expect(cornerSlot(20)).toEqual({ col: 1, row: 1 });
    });

    it("gives every slot of the first nine notes a different place", () => {
        const places = Array.from({ length: 9 }, (_, i) => JSON.stringify(cornerSlot(i)));
        expect(new Set(places).size).toBe(9);
    });
});
