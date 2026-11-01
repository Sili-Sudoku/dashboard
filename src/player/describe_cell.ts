import { parseGridCellId } from "@/runtime/geometry.ts";
import type { CellShape } from "@/renderer/scene.ts";

/**
 * Plain-language description of one cell, for the screen-reader live region —
 * the board itself is an SVG with no per-cell DOM, so this is how a non-sighted
 * player learns where the cursor is and what's in it. Position first (what
 * changes as arrows move), then content, then problems.
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
