import { describe, expect, it } from "vitest";

import { drawsObjects, readOverride, withOverride } from "@/authoring/style_override.ts";
import type { PuzzleDefinition } from "@/runtime/puzzle.ts";

const def: PuzzleDefinition = {
    version: 1,
    metadata: { id: "s", title: "s" },
    geometry: { type: "grid", width: 4, height: 4 },
    domain: { values: [1, 2, 3, 4] },
    constraints: [],
};
const thermo = { use: "thermometer", cells: ["r1c1", "r1c2", "r1c3"] };

describe("style override helpers (#165)", () => {
    it("reads what is set, and nothing for a bare expression", () => {
        expect(readOverride(thermo)).toEqual({ color: undefined, dashed: undefined, opacity: undefined });
        expect(readOverride({ ...thermo, color: "#fff", style: { dashed: true, opacity: 0.5 } })).toEqual({
            color: "#fff",
            dashed: true,
            opacity: 0.5,
        });
        expect(readOverride(["==", 1, 1])).toEqual({});
    });

    it("writes only what changed, and drops what goes back to default", () => {
        const colored = withOverride(thermo, { color: "#2c7a4b" });
        expect(colored).toEqual({ ...thermo, color: "#2c7a4b" });
        const more = withOverride(colored, { dashed: true, opacity: 0.4 });
        expect(more).toEqual({ ...thermo, color: "#2c7a4b", style: { dashed: true, opacity: 0.4 } });
        expect(withOverride(more, { color: undefined })).toEqual({ ...thermo, style: { dashed: true, opacity: 0.4 } });
        expect(
            withOverride(withOverride(more, { dashed: undefined }), { opacity: undefined, color: undefined }),
        ).toEqual(thermo);
    });

    it("keeps style properties it doesn't edit", () => {
        const spec = { ...thermo, style: { strokeWidth: 0.5, dashed: true } };
        expect(withOverride(spec, { dashed: undefined })).toEqual({ ...thermo, style: { strokeWidth: 0.5 } });
    });

    it("keeps a pattern and a picture exclusive", () => {
        const striped = withOverride(thermo, { pattern: "stripes" });
        expect(readOverride(striped).pattern).toBe("stripes");
        const pic = withOverride(striped, { image: "data:image/png;base64,AA==" });
        expect(readOverride(pic)).toMatchObject({ image: "data:image/png;base64,AA==", pattern: undefined });
        expect(withOverride(pic, { image: undefined, pattern: undefined })).toEqual(thermo);
    });

    it("knows which constraints draw something", () => {
        expect(drawsObjects(thermo, def)).toBe(true);
        expect(drawsObjects({ use: "sudoku" }, def)).toBe(false);
        expect(drawsObjects({ use: "antiknight" }, def)).toBe(false);
        expect(drawsObjects({ use: "nonexistent" }, def)).toBe(false);
        expect(drawsObjects({ use: "thermometer" }, def)).toBe(false); // incomplete: it produces an error, so it draws nothing
        expect(drawsObjects(["==", 1, 1], def)).toBe(false);
    });
});
