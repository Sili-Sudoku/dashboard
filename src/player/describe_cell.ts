import { parseGridCellId } from "@/runtime/geometry.ts";
import type { CellShape } from "@/renderer/scene.ts";

/**
 * Describes one cell in plain language for the screen-reader live region.
 * The board is an SVG with no per-cell DOM.
 * This text tells a non-sighted player where the cursor is and what is in the cell.
 * It gives the position first (it changes when the arrows move), then the content, then the problems.
 */
export const describeCell = (cell: CellShape): string => {
    const rc = parseGridCellId(cell.cell);
    const where = rc ? `Row ${rc.row + 1}, column ${rc.col + 1}` : `Cell ${cell.cell}`;

    if (cell.hidden) return `${where}: hidden by fog`;

    let what: string;
    if (cell.value !== null) what = `${cell.value}${cell.given ? ", given" : ""}`;
    else if (cell.notes.length > 0 || cell.centerNotes.length > 0) {
        const parts = [];
        if (cell.centerNotes.length > 0) parts.push(`center notes ${cell.centerNotes.join(" ")}`);
        if (cell.notes.length > 0) parts.push(`corner notes ${cell.notes.join(" ")}`);
        what = parts.join(", ");
    } else what = "empty";

    const problems = [
        cell.tone === "violated" && "breaks a rule",
        cell.tone === "invalid" && "not allowed here",
        cell.incorrect && "wrong",
        cell.flagged && "a note rules out the right digit",
    ].filter(Boolean);

    if (cell.marks.length > 0) {
        const names = cell.marks.map((m) => (m.position === 0 ? "background" : String(m.position)));
        what += `, color ${names.join(" and ")}`;
    }

    return `${where}: ${what}${problems.length > 0 ? ` (${problems.join(", ")})` : ""}`;
};

const briefCell = (cell: CellShape): string => {
    if (cell.hidden) return "hidden";
    if (cell.value !== null) return `${cell.value}${cell.given ? " given" : ""}`;
    return cell.notes.length > 0 || cell.centerNotes.length > 0 ? "notes" : "empty";
};

export type ReadKind = "row" | "col" | "box" | "givens";

const REGION_NAME = { row: "Row", col: "Column", box: "Box" } as const;

/**
 * Describes a region for the screen-reader live region.
 * A non-sighted player can ask "what's in this row?" without a step through each cell.
 * `region` is the `row:N`, `col:N` or `box:N` selector of the geometry that contains the cursor.
 * `region` is undefined when there is no cursor, or when the geometry has no region of that kind.
 * "givens" ignores the region and lists each revealed given on the board.
 */
export const describeRegion = (
    kind: ReadKind,
    cells: readonly CellShape[],
    region?: { selector: string; cells: readonly string[] },
): string => {
    if (kind === "givens") {
        const givens = cells.filter((c) => c.given && !c.hidden && c.value !== null);
        if (givens.length === 0) return "No givens";
        const where = (c: CellShape) => {
            const rc = parseGridCellId(c.cell);
            return rc ? `row ${rc.row + 1} column ${rc.col + 1}` : c.cell;
        };
        return `${givens.length} ${givens.length === 1 ? "given" : "givens"}: ${givens.map((c) => `${where(c)} is ${c.value}`).join("; ")}`;
    }
    if (!region) return `No ${REGION_NAME[kind].toLowerCase()} here`;
    const members = new Set(region.cells);
    const index = Number(region.selector.split(":")[1]) + 1;
    return `${REGION_NAME[kind]} ${index}: ${cells
        .filter((c) => members.has(c.cell))
        .map(briefCell)
        .join(", ")}`;
};
