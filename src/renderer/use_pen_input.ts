import { useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";

import { snapToLattice, strokeSegments, type PenPoint } from "@/runtime/pen.ts";
import type { Scene } from "@/renderer/scene.ts";
import type { ViewportRect } from "@/renderer/virtualize.ts";

/**
 * Pen input. While set, the board does not select cells. A drag draws a line.
 * A click that does not leave its lattice point gives that point to `onMark`.
 * `onMark` cycles the point through X, O, and nothing.
 */
export interface PenInput {
    /** The line pieces already drawn. A stroke that lies fully on them erases them. The preview shows this. */
    segments: readonly string[];
    onStroke: (points: PenPoint[]) => void;
    onMark: (point: PenPoint) => void;
}

/** Turns pointer events on the pen surface into lattice points, a live draft stroke and a commit on release. */
export function usePenInput(pen: PenInput | undefined, scene: Scene, view: ViewportRect | null) {
    // The pen stroke being drawn, as lattice points. It shows live and commits on release.
    const [penDraft, setPenDraft] = useState<PenPoint[]>([]);

    const latticePoint = (e: ReactPointerEvent<SVGElement>): PenPoint | undefined => {
        const el = e.currentTarget as SVGGraphicsElement;
        const matrix = el.getScreenCTM?.();
        let x: number;
        let y: number;
        if (matrix) {
            const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
            x = p.x;
            y = p.y;
        } else {
            // No screen matrix (a bare DOM): map through the box of the SVG and its viewBox instead.
            const svgEl = el.ownerSVGElement;
            if (!svgEl) return undefined;
            const box = svgEl.getBoundingClientRect();
            const vb = view ?? { left: 0, top: 0, width: scene.width, height: scene.height };
            if (!box.width || !box.height) return undefined;
            x = vb.left + ((e.clientX - box.left) / box.width) * vb.width;
            y = vb.top + ((e.clientY - box.top) / box.height) * vb.height;
        }
        return snapToLattice(x, y, scene.origin, scene.cellSize);
    };

    /** The segments a stroke would remove, when it lies fully on lines that are already drawn. */
    const erasingPieces = useMemo(() => {
        if (!pen || penDraft.length < 2) return undefined;
        const pieces = strokeSegments(penDraft);
        const have = new Set(pen.segments);
        return pieces.length > 0 && pieces.every((k) => have.has(k)) ? pieces : undefined;
    }, [pen, penDraft]);

    const penDown = (e: ReactPointerEvent<SVGElement>) => {
        if (!pen || e.button !== 0) return;
        const at = latticePoint(e);
        if (!at) return;
        e.preventDefault();
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        setPenDraft([at]);
    };
    const penMove = (e: ReactPointerEvent<SVGElement>) => {
        if (!pen || penDraft.length === 0) return;
        const at = latticePoint(e);
        const last = penDraft[penDraft.length - 1];
        if (at && last && (at.x !== last.x || at.y !== last.y)) setPenDraft([...penDraft, at]);
    };
    const penUp = (e: ReactPointerEvent<SVGElement>) => {
        if (!pen || penDraft.length === 0) return;
        const at = latticePoint(e);
        const points = at ? [...penDraft, at] : penDraft;
        setPenDraft([]);
        const moved = points.some((p) => p.x !== points[0]?.x || p.y !== points[0]?.y);
        if (moved) pen.onStroke(points);
        else if (at) pen.onMark(at);
    };
    const penCancel = () => setPenDraft([]);

    return { penDraft, erasingPieces, penDown, penMove, penUp, penCancel };
}
