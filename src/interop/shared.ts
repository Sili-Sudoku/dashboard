import { GridGeometry, type CellId } from "@/runtime/geometry.ts";

/** Helpers that both interop formats need.
 *  They are in one place.
 *  A fix from a real case of one format (e.g. the box-size regression) then reaches the other. */

export const slugify = (s: string): string => {
    const slug = s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return slug || "puzzle";
};

const divisorsOf = (n: number): number[] => {
    const out: number[] = [];
    for (let d = 1; d <= n; d++) if (n % d === 0) out.push(d);
    return out;
};

const regionSignature = (groups: readonly (readonly CellId[])[]): string =>
    groups
        .map((g) => [...g].sort().join(","))
        .sort()
        .join("|");

/** Find the (boxWidth, boxHeight) whose standard box:N partition matches the given per-cell groups exactly, if any.
 *  This lets a rectangular tiling that is not sqrt-shaped (e.g. 6x6 with 3x2 boxes) show correct box lines.
 *  Without it, the importer treats such a tiling as jigsaw. */
export const findRectangularBoxes = (
    size: number,
    actualGroups: readonly (readonly CellId[])[],
): { boxWidth: number; boxHeight: number } | undefined => {
    const want = regionSignature(actualGroups);
    for (const bw of divisorsOf(size)) {
        for (const bh of divisorsOf(size)) {
            const geo = new GridGeometry({ type: "grid", width: size, height: size, boxWidth: bw, boxHeight: bh });
            const boxCount = Math.ceil(size / bw) * Math.ceil(size / bh);
            const groups: CellId[][] = [];
            for (let i = 0; i < boxCount; i++) {
                const g = geo.resolveRegion(`box:${i}`);
                if (g) groups.push([...g]);
            }
            if (regionSignature(groups) === want) return { boxWidth: bw, boxHeight: bh };
        }
    }
    return undefined;
};
