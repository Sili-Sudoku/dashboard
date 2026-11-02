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

    it("disables box regions entirely for a non-perfect-square default size", () => {
        const nonSquare = createGeometry({ type: "grid", width: 6, height: 6 });
        expect(nonSquare.regionSelectors.some((s) => s.startsWith("box:"))).toBe(false);
        expect(nonSquare.resolveRegion("box:0")).toBeUndefined();

        // Defaulting only one axis onto a non-square size is just as degenerate,
        // even if the other axis was given explicitly.
        const partial = createGeometry({ type: "grid", width: 6, height: 6, boxWidth: 3 });
        expect(partial.regionSelectors.some((s) => s.startsWith("box:"))).toBe(false);
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

describe("GridGeometry.boardLines", () => {
    it("emits a divider per grid line, marking box boundaries and the outer border major", () => {
        const lines = new GridGeometry({ type: "grid", width: 9, height: 9 }).boardLines();
        const vertical = lines.filter((l) => l.points[0].x === l.points[1].x);
        expect(lines).toHaveLength(20);
        expect(vertical.filter((l) => l.major).map((l) => l.points[0].x)).toEqual([0, 3, 6, 9]);
        expect(vertical[0].points).toEqual([
            { x: 0, y: 0 },
            { x: 0, y: 9 },
        ]);
    });

    it("honours non-square boxes", () => {
        const lines = new GridGeometry({ type: "grid", width: 6, height: 4, boxWidth: 3, boxHeight: 2 }).boardLines();
        const horizontal = lines.filter((l) => l.points[0].y === l.points[1].y);
        expect(horizontal.filter((l) => l.major).map((l) => l.points[0].y)).toEqual([0, 2, 4]);
    });
});

describe("CompositeGeometry", () => {
    const samurai = createGeometry({
        type: "composite",
        grids: [
            { id: "nw", row: 0, col: 0, width: 9, height: 9 },
            { id: "ne", row: 0, col: 12, width: 9, height: 9 },
            { id: "mid", row: 6, col: 6, width: 9, height: 9 },
            { id: "sw", row: 12, col: 0, width: 9, height: 9 },
            { id: "se", row: 12, col: 12, width: 9, height: 9 },
        ],
    });
    const twin = createGeometry({
        type: "composite",
        grids: [
            { row: 0, col: 0, width: 4, height: 4 },
            { row: 0, col: 6, width: 4, height: 4 },
        ],
    });

    it("has each shared cell once, in row-major order, with gaps left empty", () => {
        expect(samurai.cells).toHaveLength(5 * 81 - 4 * 9);
        expect(new Set(samurai.cells).size).toBe(samurai.cells.length);
        expect(samurai.has("r1c10")).toBe(false); // between nw and ne
        expect(samurai.has("r7c7")).toBe(true); // nw's corner box is mid's too
        expect(samurai.cells[0]).toBe("r1c1");
        expect(samurai.bounds()).toEqual({ minX: 0, minY: 0, maxX: 21, maxY: 21 });
    });

    it("gives each grid its own rows, columns and boxes", () => {
        expect(samurai.resolveRegion("row:0")).toBeUndefined(); // ambiguous across grids, so not offered
        expect(samurai.resolveRegion("nw/row:0")).toHaveLength(9);
        expect(samurai.resolveRegion("ne/col:0")?.[0]).toBe("r1c13");
        expect(samurai.resolveRegion("mid/box:0")).toEqual(samurai.resolveRegion("nw/box:8"));
        expect(samurai.regionSelectors.filter((s) => s.startsWith("mid/"))).toHaveLength(27);
    });

    it("keeps adjacency to cells that exist, and steps the keyboard over a gap", () => {
        expect(twin.neighbors("r1c4")).toEqual(["r2c4", "r1c3"]);
        expect(twin.adjacent("r1c4", "r1c7")).toBe(false);
        expect(twin.step("r1c4", "right")).toBe("r1c7");
        expect(twin.step("r1c7", "left")).toBe("r1c4");
        expect(twin.step("r1c1", "up")).toBeUndefined();
        expect(twin.step("r1c10", "right")).toBeUndefined();
    });

    it("draws shared edges once and heavy where either grid says so", () => {
        const lines = samurai.boardLines();
        // the nw/mid shared box is a box edge of both: its top edge (y=6, x 6..9) lies inside a longer heavy line
        const covers = (horizontal: boolean, fixed: number, from: number, to: number, major: boolean) =>
            lines.some(
                (l) =>
                    l.major === major &&
                    (horizontal
                        ? l.points[0]!.y === fixed && l.points[1]!.y === fixed && l.points[0]!.x <= from && l.points[1]!.x >= to
                        : l.points[0]!.x === fixed && l.points[1]!.x === fixed && l.points[0]!.y <= from && l.points[1]!.y >= to),
            );
        expect(covers(true, 6, 6, 9, true)).toBe(true);
        expect(covers(false, 4, 0, 6, false)).toBe(true); // a plain divider inside nw alone
        // no edge is emitted twice
        const keys = lines.flatMap((l) => {
            const [a, b] = l.points as [{ x: number; y: number }, { x: number; y: number }];
            return a.y === b.y
                ? Array.from({ length: b.x - a.x }, (_, i) => `h${a.y},${a.x + i}`)
                : Array.from({ length: b.y - a.y }, (_, i) => `v${a.x},${a.y + i}`);
        });
        expect(new Set(keys).size).toBe(keys.length);
    });

    it("rejects layouts that make no sense", () => {
        expect(() => createGeometry({ type: "composite", grids: [] })).toThrow();
        expect(() =>
            createGeometry({
                type: "composite",
                grids: [
                    { id: "a", row: 0, col: 0, width: 4, height: 4 },
                    { id: "a", row: 0, col: 6, width: 4, height: 4 },
                ],
            }),
        ).toThrow(/both called/);
        expect(() => createGeometry({ type: "composite", grids: [{ row: -1, col: 0, width: 4, height: 4 }] })).toThrow();
    });
});
