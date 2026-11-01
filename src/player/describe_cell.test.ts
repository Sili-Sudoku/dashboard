import { describe, expect, it } from "vitest";

import { describeCell } from "@/player/describe_cell.ts";
import type { CellShape } from "@/renderer/scene.ts";

const cell = (over: Partial<CellShape> = {}): CellShape => ({
    cell: "r3c4",
    x: 0,
    y: 0,
    size: 64,
    tone: "normal",
    ring: "cursor",
    value: null,
    given: false,
    notes: [],
    centerNotes: [],
    flagged: false,
    incorrect: false,
    hidden: false,
    sameValue: false,
    marks: [],
    ...over,
});

describe("describeCell", () => {
    it("gives 1-based row and column, then the content", () => {
        expect(describeCell(cell())).toBe("Row 3, column 4: empty");
        expect(describeCell(cell({ value: 5 }))).toBe("Row 3, column 4: 5");
        expect(describeCell(cell({ value: 5, given: true }))).toBe("Row 3, column 4: 5, given");
    });

    it("reads out notes when there's no value", () => {
        expect(describeCell(cell({ notes: [1, 2], centerNotes: [3] }))).toBe(
            "Row 3, column 4: center notes 3, corner notes 1 2",
        );
    });

    it("says what's wrong, since colour alone isn't available to a screen reader", () => {
        expect(describeCell(cell({ value: 5, tone: "violated" }))).toBe("Row 3, column 4: 5 (breaks a rule)");
        expect(describeCell(cell({ value: 5, tone: "invalid", incorrect: true }))).toBe(
            "Row 3, column 4: 5 (not allowed here, wrong)",
        );
    });

    it("doesn't leak what's under fog", () => {
        expect(describeCell(cell({ hidden: true, value: 7 }))).toBe("Row 3, column 4: hidden by fog");
    });

    it("falls back to the raw id for a non-grid geometry", () => {
        expect(describeCell(cell({ cell: "hex:2:-1" }))).toBe("Cell hex:2:-1: empty");
    });
});

describe("describeCell colour marks", () => {
    it("names palette colours by their key, and the background mark as 'background'", () => {
        const marks = [
            { position: 1, color: "#f4c7c2" },
            { position: 0, color: "var(--surface)" },
        ];
        expect(describeCell(cell({ marks }))).toBe("Row 3, column 4: empty, color 1 and background");
    });
});
