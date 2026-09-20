import { describe, expect, it } from "vitest";
import { GridGeometry, createGeometry, GridCellId, parseGridCellId } from "@/runtime/geometry.ts";

describe("GridGeometry", () => {
    const geo = new GridGeometry({ type: "grid", width: 9, height: 9 });

    it("enumerates every cell once, in row-major order", () => {
        expect(geo.cells).toHaveLength(81);
        expect(geo.cells[0]).toBe("r1c1");
        expect(geo.cells[8]).toBe("r1c9");
        expect(geo.cells[9]).toBe("r2c1");
        expect(new Set(geo.cells).size).toBe(81);
    });

    it("resolves geometry regions", () => {
        expect(geo.resolveRegion("row:0")).toEqual([
            "r1c1", "r1c2", "r1c3", "r1c4", "r1c5", "r1c6", "r1c7", "r1c8", "r1c9",
        ]);
        expect(geo.resolveRegion("col:8")?.[0]).toBe("r1c9");
        expect(geo.resolveRegion("box:0")).toEqual(["r1c1", "r1c2", "r1c3", "r2c1", "r2c2", "r2c3", "r3c1", "r3c2", "r3c3"]);
        expect(geo.resolveRegion("box:4")).toContain("r5c5");
        expect(geo.resolveRegion("all")).toHaveLength(81);
        expect(geo.resolveRegion("row:99")).toBeUndefined();
        expect(geo.resolveRegion("nonsense")).toBeUndefined();
    });

    it("computes orthogonal adjacency", () => {
        expect(geo.adjacent("r1c1", "r1c2")).toBe(true);
        expect(geo.adjacent("r1c1", "r2c1")).toBe(true);
        expect(geo.adjacent("r1c1", "r2c2")).toBe(false);
        expect(geo.adjacent("r1c1", "r1c1")).toBe(false);
        expect([...geo.neighbors("r1c1")].sort()).toEqual(["r1c2", "r2c1"]);
        expect(geo.neighbors("r5c5")).toHaveLength(4);
    });

    it("steps a cursor and stops at edges", () => {
        expect(geo.step("r1c1", "right")).toBe("r1c2");
        expect(geo.step("r1c1", "down")).toBe("r2c1");
        expect(geo.step("r1c1", "up")).toBeUndefined();
        expect(geo.step("r9c9", "down")).toBeUndefined();
    });

    it("places cell centres and corners in geometry units", () => {
        expect(geo.center("r1c1")).toEqual({ x: 0.5, y: 0.5 });
        expect(geo.center("r2c3")).toEqual({ x: 2.5, y: 1.5 });
        expect(geo.anchor("r1c1", "br")).toEqual({ x: 1, y: 1 });
        expect(geo.bounds()).toEqual({ minX: 0, minY: 0, maxX: 9, maxY: 9 });
    });

    it("supports non-square grids and custom boxes", () => {
        const small = createGeometry({ type: "grid", width: 6, height: 6, boxWidth: 3, boxHeight: 2 });
        expect(small.cells).toHaveLength(36);
        expect(small.resolveRegion("box:0")).toEqual(["r1c1", "r1c2", "r1c3", "r2c1", "r2c2", "r2c3"]);
        expect(small.resolveRegion("box:1")).toEqual(["r1c4", "r1c5", "r1c6", "r2c4", "r2c5", "r2c6"]);
    });

    it("rejects malformed specs and unknown cells", () => {
        expect(() => new GridGeometry({ type: "grid", width: 0, height: 9 })).toThrow();
        expect(() => geo.center("r99c99")).toThrow();
        expect(geo.has("r1c1")).toBe(true);
        expect(geo.has("r10c1")).toBe(false);
    });

    it("round-trips cell ids", () => {
        expect(GridCellId(0, 0)).toBe("r1c1");
        expect(parseGridCellId("r3c7")).toEqual({ row: 2, col: 6 });
        expect(parseGridCellId("bogus")).toBeUndefined();
    });
});
