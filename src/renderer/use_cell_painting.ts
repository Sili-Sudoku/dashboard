import { useRef, type PointerEvent as ReactPointerEvent } from "react";

import type { CellId } from "@/runtime/geometry.ts";
import { cellsAreNeighbours, cellsTouchDiagonally, isNearCorner } from "@/renderer/board_math.ts";

/** The pointer is close to both an x edge and a y edge of its cell. A bare DOM with no layout never is. */
const inCornerZone = (e: ReactPointerEvent<SVGRectElement>): boolean => {
    const box = e.currentTarget.getBoundingClientRect();
    if (!box.width || !box.height) return false;
    return isNearCorner((e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height);
};

interface Callbacks {
    onPaintStart: (cell: CellId, additive: boolean) => void;
    onPaintMove: (cell: CellId) => void;
    onPaintEnd: () => void;
}

/**
 * Select cells by dragging across them.
 *
 * Diagonal sweep: a drag from A to the cell C diagonal to it passes a side cell B near the shared corner.
 * Entering B close to a corner is held back ("pending"). If the pointer then enters C, B is dropped and only A and C
 * are selected (German whispers and other diagonal lines). In any other case B is painted, as before.
 */
export function useCellPainting({ onPaintStart, onPaintMove, onPaintEnd }: Callbacks) {
    const painting = useRef(false);
    const lastPainted = useRef<CellId | null>(null);
    const pendingCell = useRef<CellId | null>(null);

    const paint = (cell: CellId) => {
        pendingCell.current = null;
        lastPainted.current = cell;
        onPaintMove(cell);
    };

    const flushPending = () => {
        if (pendingCell.current) paint(pendingCell.current);
    };

    const handleCellDown = (cell: CellId) => (e: ReactPointerEvent) => {
        if (e.button === 1 || e.button === 2) return; // middle or right click pans (see use_board_view)
        e.preventDefault();
        painting.current = true;
        // preventDefault() above also suppresses the click-to-focus of the browser. So focus
        // the board by hand. This is what makes Tab step between cells (see use_puzzle_session).
        (e.currentTarget as SVGElement).ownerSVGElement?.focus({ preventScroll: true });
        (e.target as Element).releasePointerCapture?.(e.pointerId);
        lastPainted.current = cell;
        pendingCell.current = null;
        onPaintStart(cell, e.shiftKey || e.metaKey || e.ctrlKey);
    };

    const handleCellEnter = (cell: CellId) => (e: ReactPointerEvent<SVGRectElement>) => {
        if (!painting.current) return;
        const last = lastPainted.current;
        const pending = pendingCell.current;
        if (last && pending && cellsTouchDiagonally(last, cell) && cellsAreNeighbours(pending, cell)) {
            pendingCell.current = null; // the diagonal step: the side cell was only crossed on the way
            paint(cell);
            return;
        }
        flushPending();
        if (last && cellsAreNeighbours(lastPainted.current ?? last, cell) && inCornerZone(e)) {
            pendingCell.current = cell;
            return;
        }
        paint(cell);
    };

    // Once the pointer is well inside the pending cell (not near a corner), the player means that cell.
    const handleCellMove = (cell: CellId) => (e: ReactPointerEvent<SVGRectElement>) => {
        if (painting.current && pendingCell.current === cell && !inCornerZone(e)) paint(cell);
    };

    const stopPainting = () => {
        if (!painting.current) return;
        flushPending(); // released in the corner zone of a cell: the player ended there
        painting.current = false;
        lastPainted.current = null;
        onPaintEnd();
    };

    return { handleCellDown, handleCellEnter, handleCellMove, stopPainting };
}
