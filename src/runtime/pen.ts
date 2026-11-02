/**
 * The pen layer (#45): the player's own freehand annotations — lines drawn across the grid and
 * X / O marks — separate from digits, notes and colours (as in SudokuPad's pen tool). Nothing
 * here touches the puzzle or its evaluation.
 *
 * Everything sits on a half-cell lattice measured from the grid's top-left corner, so a point
 * can be a cell's centre, the middle of an edge between two cells, or a corner where four
 * meet: (1,1) is the centre of the top-left cell, (2,1) the midpoint of its right edge, (2,2)
 * the corner it shares with three neighbours. Points are integers, so equal points compare
 * equal and the whole layer is plain, serialisable data.
 */

export type PenMarkKind = "x" | "o";

/** A lattice point, in half-cells from the grid's top-left corner. */
export interface PenPoint {
    x: number;
    y: number;
}

export interface PenState {
    /** Line pieces between neighbouring lattice points, each as a normalised `"x,y|x,y"` key. */
    readonly segments: readonly string[];
    /** X / O marks by lattice point (`"x,y"`). */
    readonly marks: Readonly<Record<string, PenMarkKind>>;
}

export const EMPTY_PEN: PenState = { segments: [], marks: {} };

export const isPenEmpty = (pen: PenState): boolean => pen.segments.length === 0 && Object.keys(pen.marks).length === 0;

export const pointKey = (p: PenPoint): string => `${p.x},${p.y}`;

export const parsePointKey = (key: string): PenPoint => {
    const [x, y] = key.split(",").map(Number);
    return { x: x ?? 0, y: y ?? 0 };
};

/** One piece of line between two neighbouring points; the same piece however it was drawn. */
export const segmentKey = (a: PenPoint, b: PenPoint): string => {
    const [first, second] = a.x < b.x || (a.x === b.x && a.y <= b.y) ? [a, b] : [b, a];
    return `${pointKey(first)}|${pointKey(second)}`;
};

export const parseSegmentKey = (key: string): [PenPoint, PenPoint] => {
    const [a, b] = key.split("|");
    return [parsePointKey(a ?? ""), parsePointKey(b ?? "")];
};

/** The lattice point nearest a position in board pixels (`origin` is where the grid's top-left sits). */
export const snapToLattice = (px: number, py: number, origin: PenPoint, cellSize: number): PenPoint => ({
    x: Math.round(((px - origin.x) / cellSize) * 2),
    y: Math.round(((py - origin.y) / cellSize) * 2),
});

/**
 * The pieces a stroke covers. A fast drag skips lattice points, so consecutive points further
 * apart than one step are walked in single steps (diagonal first) — nothing is left out.
 */
export const strokeSegments = (points: readonly PenPoint[]): string[] => {
    const out: string[] = [];
    for (let i = 1; i < points.length; i++) {
        let at = points[i - 1] as PenPoint;
        const to = points[i] as PenPoint;
        while (at.x !== to.x || at.y !== to.y) {
            const next = { x: at.x + Math.sign(to.x - at.x), y: at.y + Math.sign(to.y - at.y) };
            out.push(segmentKey(at, next));
            at = next;
        }
    }
    return [...new Set(out)];
};

/**
 * Draws a stroke. Like SudokuPad, drawing over a line that's already there rubs it out: if
 * every piece of the stroke exists it removes them, otherwise it adds whichever are missing.
 */
export const applyStroke = (pen: PenState, points: readonly PenPoint[]): PenState => {
    const pieces = strokeSegments(points);
    if (pieces.length === 0) return pen;
    const have = new Set(pen.segments);
    const erasing = pieces.every((s) => have.has(s));
    for (const s of pieces) {
        if (erasing) have.delete(s);
        else have.add(s);
    }
    return { ...pen, segments: [...have].sort() };
};

/** What a click does to the mark at a point: nothing -> X -> O -> nothing. */
export const cycleMark = (pen: PenState, point: PenPoint): PenState => {
    const key = pointKey(point);
    const marks = { ...pen.marks };
    if (marks[key] === undefined) marks[key] = "x";
    else if (marks[key] === "x") marks[key] = "o";
    else delete marks[key];
    return { ...pen, marks };
};

const MAX_COORD = 10_000;
const validPoint = (p: PenPoint): boolean =>
    Number.isInteger(p.x) && Number.isInteger(p.y) && Math.abs(p.x) <= MAX_COORD && Math.abs(p.y) <= MAX_COORD;

/** Reads a stored pen layer defensively — whatever isn't well-formed is dropped, never thrown on. */
export const sanitizePen = (raw: unknown): PenState => {
    if (!raw || typeof raw !== "object") return EMPTY_PEN;
    const { segments, marks } = raw as { segments?: unknown; marks?: unknown };
    const keep = new Set<string>();
    if (Array.isArray(segments)) {
        for (const s of segments) {
            if (typeof s !== "string" || !/^-?\d+,-?\d+\|-?\d+,-?\d+$/.test(s)) continue;
            const [a, b] = parseSegmentKey(s);
            if (!validPoint(a) || !validPoint(b)) continue;
            if (Math.abs(a.x - b.x) > 1 || Math.abs(a.y - b.y) > 1 || (a.x === b.x && a.y === b.y)) continue;
            keep.add(segmentKey(a, b));
        }
    }
    const keptMarks: Record<string, PenMarkKind> = {};
    if (marks && typeof marks === "object") {
        for (const [key, kind] of Object.entries(marks)) {
            if ((kind === "x" || kind === "o") && /^-?\d+,-?\d+$/.test(key) && validPoint(parsePointKey(key))) {
                keptMarks[key] = kind;
            }
        }
    }
    return { segments: [...keep].sort(), marks: keptMarks };
};
