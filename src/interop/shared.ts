import { GridGeometry, type CellId } from "@/runtime/geometry.ts";

/** Helpers both interop formats need, kept in one place so a fix found via one
 *  format's real-world case (e.g. #80, the box-size regression) reaches the other. */

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

/** Find the (boxWidth, boxHeight) whose standard box:N partition matches the
 *  given per-cell groups exactly, if any — so a non-sqrt-shaped but still
 *  rectangular tiling (e.g. 6x6 with 3x2 boxes) renders its box lines
 *  correctly instead of being treated as jigsaw. */
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
