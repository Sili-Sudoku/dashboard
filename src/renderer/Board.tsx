import { parseSegmentKey, snapToLattice, strokeSegments, type PenPoint } from "@/runtime/pen.ts";
import {
    useCallback,
    useId,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
} from "react";
import { Lock, Maximize, Scan, Unlock, ZoomIn, ZoomOut } from "lucide-react";

import { useSettings } from "@/app/use_settings.ts";
import type { CellId } from "@/runtime/geometry.ts";
import type { Scene } from "@/renderer/scene.ts";
import { cornerSlot } from "@/renderer/corner_slot.ts";
import ShapeNode from "@/renderer/ShapeNode.tsx";
import {
    cellInViewport,
    clamp,
    clampView,
    expandViewport,
    fitView,
    lineInViewport,
    MAX_ZOOM,
    MIN_ZOOM,
    panView,
    shapeInViewport,
    ZOOM_STEP,
    zoomViewAt,
    type ViewportRect,
} from "@/renderer/virtualize.ts";

import "./board.css";

// Space kept free against window.innerWidth/innerHeight when the fit is clamped (#77 follow-up).
// This keeps the box away from the edge of the browser viewport.
const EDGE_MARGIN = 16;

// Matches the `.board-wrap { gap }` in board.css. The footer row is below the grid in the same wrap.
// This gap and the height of the row come out of the height budget.
const FOOTER_GAP = 8;

/**
 * Pen input (#45). While set, the board does not select cells. A drag draws a line.
 * A click that does not leave its lattice point gives that point to `onMark`.
 * `onMark` cycles the point through X, O, and nothing.
 */
export interface PenInput {
    /** The line pieces already drawn. A stroke that lies fully on them erases them. The preview shows this. */
    segments: readonly string[];
    onStroke: (points: PenPoint[]) => void;
    onMark: (point: PenPoint) => void;
}

/** How far from a cell's edges (a fraction of its size) the pointer counts as near a corner. */
const CORNER_ZONE = 0.3;

const parseCell = (cell: CellId): { row: number; col: number } | null => {
    const m = /^r(\d+)c(\d+)$/.exec(cell);
    return m ? { row: Number(m[1]), col: Number(m[2]) } : null;
};

const cellsAreNeighbours = (a: CellId, b: CellId): boolean => {
    const p = parseCell(a);
    const q = parseCell(b);
    return !!p && !!q && Math.abs(p.row - q.row) + Math.abs(p.col - q.col) === 1;
};

const cellsTouchDiagonally = (a: CellId, b: CellId): boolean => {
    const p = parseCell(a);
    const q = parseCell(b);
    return !!p && !!q && Math.abs(p.row - q.row) === 1 && Math.abs(p.col - q.col) === 1;
};

/** The pointer is close to both an x edge and a y edge of its cell. A bare DOM with no layout never is. */
const inCornerZone = (e: ReactPointerEvent<SVGRectElement>): boolean => {
    const box = e.currentTarget.getBoundingClientRect();
    if (!box.width || !box.height) return false;
    const fx = (e.clientX - box.left) / box.width;
    const fy = (e.clientY - box.top) / box.height;
    return (fx < CORNER_ZONE || fx > 1 - CORNER_ZONE) && (fy < CORNER_ZONE || fy > 1 - CORNER_ZONE);
};

interface Props {
    scene: Scene;
    /** When set, the board is in pen mode (see `PenInput`). */
    pen?: PenInput;
    onPaintStart: (cell: CellId, additive: boolean) => void;
    onPaintMove: (cell: CellId) => void;
    onPaintEnd: () => void;
    /** A double-click or double-tap on a cell. */
    onCellDoubleClick?: (cell: CellId) => void;
    onClearSelection: () => void;
    /** Accessible name for the board. The SVG has no per-cell DOM (see the live region in PuzzlePlayer). */
    label?: string;
    /** Id of an element that describes how to operate the board. */
    describedBy?: string;
    /** Shown in the row under the grid, left of the zoom button. The player puts its timer here. */
    footer?: ReactNode;
    /** A row above the grid, in the same box. It shares the left edge of the grid wherever the board is. */
    header?: ReactNode;
    /**
     * Removes the row under the grid (footer and zoom button).
     * The caller offers zoom elsewhere through `onZoomControls`.
     */
    hideFooter?: boolean;
    /** Publishes the zoom actions and state each time they change (null on unmount), for a menu of the caller. */
    onZoomControls?: (controls: ZoomControls | null) => void;
}

export interface ZoomControls {
    percent: number;
    locked: boolean;
    zoomIn: () => void;
    zoomOut: () => void;
    fit: () => void;
    actualSize: () => void;
    toggleLock: () => void;
}

/**
 * Culls scene.cells/gridLines/shapes to a margin around `viewport`.
 * Returns `scene` unchanged when `viewport` is null.
 */
const cullToViewport = (scene: Scene, viewport: ViewportRect | null): Scene => {
    if (!viewport) return scene;
    const v = expandViewport(viewport, scene.cellSize * 2);
    return {
        ...scene,
        cells: scene.cells.filter((c) => cellInViewport(c, v)),
        gridLines: scene.gridLines.filter((l) => lineInViewport(l.points, v)),
        shapes: scene.shapes.filter((s) => shapeInViewport(s, v)),
    };
};

/** Center notes share one text run. More candidates leave less room for each one.
 * A flat shrink rate for each character does not follow the rendered width of the text.
 * Short runs looked tiny and wasted space. Longer runs still grew toward the edge of the cell.
 * This code instead targets a roughly constant *rendered width* (~82% of the cell).
 * This leaves a clean margin on each side. It holds while the target is achievable.
 * It uses a typical ratio of digit width to font size.
 * MAX stops a run of 1-2 candidates from filling most of the cell.
 * Such a run would read as a huge digit that is off center.
 * MIN stops a long run (the candidate list of a large-domain puzzle) from shrinking until it is not legible.
 * That run overflows the target width a little. */
const CENTER_NOTE_TARGET_WIDTH = 0.82;
const CENTER_NOTE_GLYPH_WIDTH_EM = 0.6;
const centerNoteFontFactor = (charCount: number): number =>
    clamp(CENTER_NOTE_TARGET_WIDTH / (charCount * CENTER_NOTE_GLYPH_WIDTH_EM), 0.11, 0.3);

export default function Board({
    scene,
    pen,
    onPaintStart,
    onPaintMove,
    onPaintEnd,
    onCellDoubleClick,
    onClearSelection,
    label,
    describedBy,
    footer,
    header,
    hideFooter,
    onZoomControls,
}: Props) {
    const zoomPanelId = `zoom-${useId().replace(/:/g, "")}`;
    const hatchId = `hatch-${useId().replace(/:/g, "")}`;
    const painting = useRef(false);
    // The pen stroke being drawn (#45), as lattice points. It shows live and commits on release.
    const [penDraft, setPenDraft] = useState<PenPoint[]>([]);
    const panningFrom = useRef<{ x: number; y: number } | null>(null);
    // Two-finger touch pan/zoom (#70 follow-up). A touchscreen has no middle or right
    // button for the desktop pan below. One finger already drives the cell-selection drag (handleCellDown).
    // So this follows the convention of maps and photo viewers: a second finger pans and pinch-zooms.
    const activeTouches = useRef(new Map<number, { x: number; y: number }>());
    const pinchAnchor = useRef<{ x: number; y: number; dist: number } | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const measureRef = useRef<HTMLDivElement>(null);
    const [zoomOpen, setZoomOpen] = useState(false);
    const footerRef = useRef<HTMLDivElement>(null);
    const headerRef = useRef<HTMLDivElement>(null);
    const hasHeader = !!header;
    // The visible rect, in board units. This *is* the viewBox of the SVG. There is no scrolling.
    // Panning and zooming only change this rect, as in the canvas of SudokuPad.
    const [view, setView] = useState<ViewportRect | null>(null);
    const [zoomPct, setZoomPct] = useState(100);
    // Freezes the scale of the view (wheel, +/-, slider, Fit, Actual size). Panning still works.
    // It helps a player who changes the zoom by accident when they pan a puzzle that has the size they want.
    // It starts from the Settings value (#69) and saves to Settings.
    // Without this, it always started unlocked and forgot the choice on reload.
    const [settings, setSetting] = useSettings();
    const zoomLocked = settings.zoomLocked;
    // The on-screen size of the wrap/viewport box (#77 follow-up). It is a stable canvas.
    // The view pans and zooms *within* it. The box does not resize each time the player zooms.
    // It does track the space available in .board-measure through a ResizeObserver (below).
    // So it does not freeze at the size available on first mount.
    // It does not overflow when the window or devtools panel changes size.
    // It stays unset until the first measurement runs.
    const [boxSize, setBoxSize] = useState<{ width: number; height: number } | null>(null);

    useLayoutEffect(() => {
        const el = measureRef.current;
        if (!el) return;
        let firstFit = true;

        // Not fitView() here. fitView() letterboxes the viewBox to the aspect ratio of the *measured*
        // container. That is correct when the box has a fixed external shape
        // (for example, a later manual "Fit to screen").
        // Here the shape of the box is *derived* from the scene (below).
        // So the starting view is the bounding box of the scene, with no letterbox to
        // a container aspect ratio that the box does not keep.
        const fit = () => {
            const rect = el.getBoundingClientRect();
            // The *measured* size of .board-measure was not independent of its own children, as intended.
            // A logging run confirmed it. Every resize tick reported a size bigger than the last,
            // by about the same amount, each time Board.tsx set boxSize on the elements inside it.
            // This is a feedback loop, not a one-off misread.
            // The exact mechanism is unknown. The bounds of the window are a ceiling
            // that nothing can legitimately exceed. So clamp against them and do not trust
            // the size from flex outright. This caps the loop whatever the cause.
            const width = Math.min(rect.width, window.innerWidth - rect.left - EDGE_MARGIN);
            // The window limits the height, not the space left below the top of the board.
            // On a scrolling (phone) page the board can start below the fold.
            // Then "what is left" would shrink it to a thumbnail (it measured 182px of 374).
            const height = Math.min(rect.height, window.innerHeight - EDGE_MARGIN);
            if (width <= 0 || height <= 0) return;
            // The footer row is below the grid in the same wrap (see FOOTER_GAP).
            // Its height does not depend on the board size.
            // So it is safe (not circular) to measure it and subtract it from the budget.
            const footerHeight = footerRef.current?.getBoundingClientRect().height ?? 0;
            // The header row above the grid (when given) comes out of the budget in the same way.
            const headerHeight = headerRef.current ? headerRef.current.getBoundingClientRect().height + FOOTER_GAP : 0;
            const viewportHeight = height - footerHeight - headerHeight - (hideFooter ? 0 : FOOTER_GAP);
            if (width <= 0 || viewportHeight <= 0) return;
            const scale = clamp(Math.min(width / scene.width, viewportHeight / scene.height), MIN_ZOOM, MAX_ZOOM);
            setBoxSize({ width: scene.width * scale, height: scene.height * scale });
            // Only the first fit sets the starting view and zoom. Later resizes only let
            // the existing canvas grow or shrink. They must not reset the pan and zoom of the player.
            if (!firstFit) return;
            firstFit = false;
            setView({ left: 0, top: 0, width: scene.width, height: scene.height });
            // 100% = the whole board fits in the view, always. It is not the achieved physical scale.
            // That scale changes with screen size, DPI, and cell size. It had no stable meaning to the player
            // (#77 follow-up: a baseline fit read "169%" on one window and a different value on another).
            // Every other zoom % below has the same definition: scene.width / view.width * 100.
            setZoomPct(100);
        };

        fit();
        window.addEventListener("resize", fit);

        if (typeof ResizeObserver === "undefined") {
            // Not available in every test/legacy env. The initial fit above still runs.
            return () => window.removeEventListener("resize", fit);
        }
        const observer = new ResizeObserver(fit);
        observer.observe(el);
        return () => {
            window.removeEventListener("resize", fit);
            observer.disconnect();
        };
        // Runs again only if the scene changes (a different puzzle). PuzzlePlayer
        // remounts Board for each puzzle, so in practice this runs on mount only.
    }, [scene.width, scene.height, hideFooter, hasHeader]);

    const visibleScene = useMemo(() => cullToViewport(scene, view), [scene, view]);

    const applyZoom = useCallback(
        (fracX: number, fracY: number, factor: number) => {
            if (zoomLocked) return;
            const el = containerRef.current;
            if (!el || !view) return;
            const rect = el.getBoundingClientRect();
            const next = zoomViewAt(view, scene.width, scene.height, rect.width, fracX, fracY, factor);
            setView(next);
            // scene.width / view.width, not rect.width / view.width (see the mount-fit comment above).
            // This keeps the % of every zoom action relative to "whole board visible",
            // whatever the pixel size of the container.
            setZoomPct(Math.round((scene.width / next.width) * 100));
        },
        [view, scene.width, scene.height, zoomLocked],
    );

    const handleZoomSlider = (pct: number) => {
        if (!view) return;
        // Inverse of the display formula above: the view width (in board units) that
        // makes scene.width / viewWidth * 100 equal the % chosen with the slider.
        const targetWidth = (scene.width * 100) / pct;
        applyZoom(0.5, 0.5, view.width / targetWidth);
    };

    const handleFitToScreen = () => {
        if (zoomLocked) return;
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const next = fitView(scene.width, scene.height, rect.width, rect.height);
        setView(next);
        setZoomPct(Math.round((scene.width / next.width) * 100)); // always 100 (see above)
    };

    const handleResetZoom = () => {
        if (zoomLocked) return;
        const el = containerRef.current;
        if (!el || !view) return;
        const rect = el.getBoundingClientRect();
        const cx = view.left + view.width / 2;
        const cy = view.top + view.height / 2;
        // "Actual size" = 1 board unit for each screen pixel, centered on the current position.
        // It is a different zoom level from "fit", and it is useful by itself.
        // So it is not literally "100%", because 100% now always means "fit" (#77 follow-up).
        // The % shown below is this native scale relative to fit.
        // It uses the same formula as every other zoom action.
        const next = clampView(
            { left: cx - rect.width / 2, top: cy - rect.height / 2, width: rect.width, height: rect.height },
            scene.width,
            scene.height,
        );
        setView(next);
        setZoomPct(Math.round((scene.width / next.width) * 100));
    };

    // The latest handlers sit behind a stable surface. So publishing them does not re-fire on every render.
    const zoomActions = useRef({
        zoomIn: () => {},
        zoomOut: () => {},
        fit: () => {},
        actualSize: () => {},
        toggleLock: () => {},
    });
    useEffect(() => {
        zoomActions.current = {
            zoomIn: () => applyZoom(0.5, 0.5, ZOOM_STEP),
            zoomOut: () => applyZoom(0.5, 0.5, 1 / ZOOM_STEP),
            fit: handleFitToScreen,
            actualSize: handleResetZoom,
            toggleLock: () => setSetting("zoomLocked", !zoomLocked),
        };
    });
    useEffect(() => {
        if (!onZoomControls) return;
        onZoomControls({
            percent: zoomPct,
            locked: zoomLocked,
            zoomIn: () => zoomActions.current.zoomIn(),
            zoomOut: () => zoomActions.current.zoomOut(),
            fit: () => zoomActions.current.fit(),
            actualSize: () => zoomActions.current.actualSize(),
            toggleLock: () => zoomActions.current.toggleLock(),
        });
        return () => onZoomControls(null);
    }, [onZoomControls, zoomPct, zoomLocked]);

    // The onWheel prop of React is attached passively at the root (for scroll performance,
    // shared with every other wheel listener on the page). So preventDefault() inside it
    // cannot stop the page from scrolling under it. Only a native listener, registered
    // explicitly as non-passive, can zoom without the page scrolling at the same time.
    useLayoutEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const onNativeWheel = (e: WheelEvent) => {
            // Locked: let the wheel event do its normal action (scroll the page).
            // Do not take it for a zoom that does nothing.
            if (zoomLocked) return;
            e.preventDefault();
            const rect = el.getBoundingClientRect();
            const fracX = (e.clientX - rect.left) / rect.width;
            const fracY = (e.clientY - rect.top) / rect.height;
            const factor = Math.pow(ZOOM_STEP, -e.deltaY / 100);
            applyZoom(fracX, fracY, factor);
        };

        el.addEventListener("wheel", onNativeWheel, { passive: false });
        return () => el.removeEventListener("wheel", onNativeWheel);
    }, [applyZoom, zoomLocked]);

    // Panning (#49): drag with the middle or right button. So it never competes with
    // the left-button cell-selection drag below.
    const handleContainerPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (e.button !== 1 && e.button !== 2) return;
        e.preventDefault();
        panningFrom.current = { x: e.clientX, y: e.clientY };
    };

    const handleContainerPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (!panningFrom.current || !view) return;
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const dx = ((e.clientX - panningFrom.current.x) / rect.width) * view.width;
        const dy = ((e.clientY - panningFrom.current.y) / rect.height) * view.height;
        panningFrom.current = { x: e.clientX, y: e.clientY };
        setView((v) => (v ? panView(v, scene.width, scene.height, -dx, -dy) : v));
    };

    const stopPanning = () => {
        panningFrom.current = null;
    };

    // Tracked at the container level (not for each cell), because the second finger usually
    // lands on a cell. These *Capture handlers run in the capture phase, before the own
    // onPointerDown of that cell (bubble phase) below.
    // So stopPropagation() here stops a second finger from starting or extending a cell-selection drag.
    const handleTouchDownCapture = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (e.pointerType !== "touch") return;
        activeTouches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (activeTouches.current.size === 2) {
            e.stopPropagation();
            stopPainting();
            pinchAnchor.current = null;
        }
    };

    const handleTouchMoveCapture = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (!activeTouches.current.has(e.pointerId)) return;
        activeTouches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (activeTouches.current.size < 2) return;
        e.stopPropagation();
        const el = containerRef.current;
        const anchor = pinchAnchor.current;
        const [a, b] = [...activeTouches.current.values()];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (!el || !anchor) {
            pinchAnchor.current = { x: mid.x, y: mid.y, dist };
            return;
        }
        const rect = el.getBoundingClientRect();
        const factor = zoomLocked || anchor.dist === 0 ? 1 : dist / anchor.dist;
        const fracX = (mid.x - rect.left) / rect.width;
        const fracY = (mid.y - rect.top) / rect.height;
        // Reads the *pending* view through the updater form, not the `view` closed over at render time.
        // The pointermove events of two fingers often land in the same synchronous burst (no render between).
        // A second setView in that burst would compute from the same stale `view` and silently overwrite the first.
        setView((v) => {
            if (!v) return v;
            const dx = ((mid.x - anchor.x) / rect.width) * v.width;
            const dy = ((mid.y - anchor.y) / rect.height) * v.height;
            const panned = panView(v, scene.width, scene.height, -dx, -dy);
            const next =
                factor === 1 ? panned : zoomViewAt(panned, scene.width, scene.height, rect.width, fracX, fracY, factor);
            setZoomPct(Math.round((scene.width / next.width) * 100));
            return next;
        });
        pinchAnchor.current = { x: mid.x, y: mid.y, dist };
    };

    const handleTouchUpCapture = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (e.pointerType !== "touch") return;
        activeTouches.current.delete(e.pointerId);
        if (activeTouches.current.size < 2) pinchAnchor.current = null;
    };

    const handleCellDown = (cell: CellId) => (e: ReactPointerEvent) => {
        if (e.button === 1 || e.button === 2) return; // middle or right click pans (see the container handlers below)
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

    // Diagonal sweep: a drag from A to the cell C diagonal to it passes a side cell B near the shared corner.
    // Entering B close to a corner is held back ("pending"). If the pointer then enters C, B is dropped and only A and C
    // are selected (German whispers and other diagonal lines). In any other case B is painted, as before.
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

    const viewBox = view ? `${view.left} ${view.top} ${view.width} ${view.height}` : scene.viewBox;

    const svg = (
        <svg
            className="board"
            viewBox={viewBox}
            width="100%"
            height="100%"
            role="group"
            aria-label={label}
            aria-describedby={describedBy}
            tabIndex={0}
            onPointerUp={stopPainting}
            onPointerLeave={stopPainting}
        >
            <rect
                x={0}
                y={0}
                width={scene.width}
                height={scene.height}
                fill="var(--surface)"
                onPointerDown={onClearSelection}
            />

            <defs>
                {/* A hatch on top of the tint marks violated or invalid cells. So "wrong" does not
                    depend on telling two colours apart. */}
                <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <line x1="0" y1="0" x2="0" y2="6" stroke="var(--violated-line)" strokeWidth="1.5" opacity="0.4" />
                </pattern>
            </defs>

            {/* cell tones */}
            {visibleScene.cells.map((c) => (
                <rect
                    key={`bg-${c.cell}`}
                    className={`cell-bg cell-${c.tone}`}
                    x={c.x}
                    y={c.y}
                    width={c.size}
                    height={c.size}
                    onPointerDown={handleCellDown(c.cell)}
                    onDoubleClick={() => onCellDoubleClick?.(c.cell)}
                    onPointerEnter={handleCellEnter(c.cell)}
                    onPointerMove={handleCellMove(c.cell)}
                />
            ))}

            <g pointerEvents="none">
                {visibleScene.cells
                    .filter((c) => c.tone !== "normal")
                    .map((c) => (
                        <rect
                            key={`hatch-${c.cell}`}
                            x={c.x}
                            y={c.y}
                            width={c.size}
                            height={c.size}
                            fill={`url(#${hatchId})`}
                        />
                    ))}
            </g>

            {/* colour marks (#35): the own colouring of cells by the player, under the grid and
                digits. One mark fills the cell. Several marks split it into even vertical
                stripes. SudokuPad splits it into wedges. Stripes keep it simple. */}
            <g pointerEvents="none">
                {visibleScene.cells.flatMap((c) =>
                    c.marks.map((mark, i) => (
                        <rect
                            key={`mark-${c.cell}-${mark.position}`}
                            x={c.x + (c.size * i) / c.marks.length}
                            y={c.y}
                            width={c.size / c.marks.length}
                            height={c.size}
                            fill={mark.color}
                            className="cell-mark"
                        />
                    )),
                )}
            </g>

            {/* same-value highlight (#73): a soft wash over matching cells, under the grid and
                digits. It is separate from the tone fill and the selection ring */}
            <g pointerEvents="none">
                {visibleScene.cells
                    .filter((c) => c.sameValue)
                    .map((c) => (
                        <rect
                            key={`same-${c.cell}`}
                            className="cell-same"
                            x={c.x}
                            y={c.y}
                            width={c.size}
                            height={c.size}
                        />
                    ))}
            </g>

            {/* grid + box lines, drawn before constraint graphics. So a dot or marker
                on a cell boundary (kropki, XV, ...) is not painted over by
                the line under it */}
            <g className="grid" pointerEvents="none">
                {visibleScene.gridLines.map((l, i) => (
                    <line
                        key={i}
                        x1={l.points[0].x}
                        y1={l.points[0].y}
                        x2={l.points[1].x}
                        y2={l.points[1].y}
                        stroke={l.weight >= 3 ? "var(--line-strong)" : "var(--line)"}
                        strokeWidth={l.weight}
                    />
                ))}
            </g>

            {/* constraint graphics below digits */}
            <g className="shapes" pointerEvents="none">
                {visibleScene.shapes.map((s, i) => (
                    <ShapeNode key={i} shape={s} />
                ))}
            </g>

            {/* fog: an opaque cover for each cell that is still hidden. It is painted after the grid
                lines and constraint graphics, so neither shows through. This is simpler
                than to make every shape kind aware of cells. It is layered
                before the ring and digit groups below. So the selection and typing
                of the player (see scene.ts) still show on top of the fog. */}
            <g className="fog" pointerEvents="none">
                {visibleScene.cells
                    .filter((c) => c.hidden)
                    .map((c) => (
                        <rect
                            key={`fog-${c.cell}`}
                            className="cell-fog"
                            x={c.x}
                            y={c.y}
                            width={c.size}
                            height={c.size}
                        />
                    ))}
            </g>

            {/* selection/cursor ring, layered above the tone fill. So a click still
                shows feedback on a violated or invalid cell */}
            <g className="rings" pointerEvents="none">
                {visibleScene.cells
                    .filter((c) => c.ring === "cursor")
                    .map((c) => {
                        const inset = c.size * 0.05;
                        return (
                            <rect
                                key={`ring-${c.cell}`}
                                className={`cell-ring cell-ring-${c.ring}`}
                                x={c.x + inset}
                                y={c.y + inset}
                                width={c.size - inset * 2}
                                height={c.size - inset * 2}
                            />
                        );
                    })}
                {visibleScene.selectionOutline.map(([a, b], i) => (
                    <line key={`sel-${i}`} className="selection-outline" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                ))}
            </g>

            {/* digits + notes */}
            <g className="values" pointerEvents="none">
                {visibleScene.cells.map((c) => {
                    const cx = c.x + c.size / 2;
                    const cy = c.y + c.size / 2;
                    if (c.value !== null) {
                        const slash = c.size * 0.22;
                        return (
                            <g key={`v-${c.cell}`}>
                                <text
                                    className={`digit ${c.given ? "given" : "entered"} ${c.incorrect ? "incorrect" : ""}`}
                                    x={cx}
                                    y={cy}
                                    fontSize={c.size * 0.62}
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                >
                                    {c.value}
                                </text>
                                {c.incorrect && (
                                    <line
                                        className="incorrect-slash"
                                        x1={cx - slash}
                                        y1={cy + slash}
                                        x2={cx + slash}
                                        y2={cy - slash}
                                    />
                                )}
                            </g>
                        );
                    }
                    const centerText = c.centerNotes.join("");
                    return (
                        <g key={`notes-${c.cell}`}>
                            {c.notes.map((n, i) => {
                                const { col, row } = cornerSlot(i);
                                return (
                                    <text
                                        key={`n-${c.cell}-${n}`}
                                        className={`note ${c.flagged || c.ruledOutNotes.includes(n) ? "note-flagged" : ""}`}
                                        x={c.x + c.size * (0.22 + col * 0.28)}
                                        y={c.y + c.size * (0.24 + row * 0.28)}
                                        fontSize={c.size * 0.2}
                                        textAnchor="middle"
                                        dominantBaseline="central"
                                    >
                                        {n}
                                    </text>
                                );
                            })}
                            {centerText.length > 0 && (
                                <text
                                    className={`note-center ${c.flagged ? "note-flagged" : ""}`}
                                    x={cx}
                                    y={cy}
                                    fontSize={c.size * centerNoteFontFactor(centerText.length)}
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                >
                                    {c.centerNotes.map((n) => (
                                        <tspan
                                            key={n}
                                            className={c.ruledOutNotes.includes(n) ? "note-flagged" : undefined}
                                        >
                                            {n}
                                        </tspan>
                                    ))}
                                </text>
                            )}
                        </g>
                    );
                })}
            </g>

            {/* pen layer (#45): the lines and X/O marks of the player over everything, and also
                the stroke that is being drawn now */}
            <g className="pen" pointerEvents="none">
                {visibleScene.pen.map((s, i) => (
                    <ShapeNode key={i} shape={s} />
                ))}
                {penDraft.length > 1 &&
                    (erasingPieces ? (
                        // The stroke lies wholly on existing lines, so release removes them.
                        // Mark exactly those pieces in red, thicker than the line.
                        erasingPieces.map((key) => {
                            const [a, b] = parseSegmentKey(key);
                            return (
                                <line
                                    key={key}
                                    className="pen-erasing"
                                    x1={scene.origin.x + (a.x * scene.cellSize) / 2}
                                    y1={scene.origin.y + (a.y * scene.cellSize) / 2}
                                    x2={scene.origin.x + (b.x * scene.cellSize) / 2}
                                    y2={scene.origin.y + (b.y * scene.cellSize) / 2}
                                />
                            );
                        })
                    ) : (
                        <polyline
                            className="pen-draft"
                            points={penDraft
                                .map(
                                    (p) =>
                                        `${scene.origin.x + (p.x * scene.cellSize) / 2},${scene.origin.y + (p.y * scene.cellSize) / 2}`,
                                )
                                .join(" ")}
                        />
                    ))}
            </g>
            {pen && (
                <rect
                    className="pen-surface"
                    x={0}
                    y={0}
                    width={scene.width}
                    height={scene.height}
                    fill="transparent"
                    onPointerDown={penDown}
                    onPointerMove={penMove}
                    onPointerUp={penUp}
                    onPointerCancel={() => setPenDraft([])}
                />
            )}
        </svg>
    );

    return (
        // .board-measure is the region that fills the flex space and is never capped.
        // .board-wrap has exactly the size boxSize (#77 follow-up) and is centered horizontally
        // (aligned to the top, not centered vertically; see board.css) within it.
        // It grows to fill available space up to the natural size of the puzzle * MAX_ZOOM.
        // It shrinks to fit small puzzles and does not force a box that is mostly empty.
        // It tracks the size of .board-measure through a ResizeObserver.
        // So it does not freeze at the size available on first mount.
        <div className="board-measure" ref={measureRef}>
            <div className="board-wrap" style={boxSize ? { width: boxSize.width } : undefined}>
                {header && (
                    <div className="board-header" ref={headerRef}>
                        {header}
                    </div>
                )}
                <div
                    className="board-viewport"
                    ref={containerRef}
                    style={boxSize ? { height: boxSize.height } : undefined}
                    onPointerDown={handleContainerPointerDown}
                    onPointerMove={handleContainerPointerMove}
                    onPointerUp={stopPanning}
                    onPointerLeave={stopPanning}
                    onPointerDownCapture={handleTouchDownCapture}
                    onPointerMoveCapture={handleTouchMoveCapture}
                    onPointerUpCapture={handleTouchUpCapture}
                    onPointerCancelCapture={handleTouchUpCapture}
                    onContextMenu={(e) => e.preventDefault()}
                >
                    {svg}
                </div>
                {!hideFooter && (
                    <div className="board-footer" ref={footerRef}>
                        <div className="board-footer-content">{footer}</div>
                        <button
                            type="button"
                            className="btn btn-flat board-zoom-toggle"
                            aria-expanded={zoomOpen}
                            aria-controls={zoomPanelId}
                            aria-label={`Zoom controls (${zoomPct}%)`}
                            onClick={() => setZoomOpen((o) => !o)}
                        >
                            {zoomLocked ? <Lock size={16} /> : <ZoomIn size={16} />}
                            <span className="board-zoom-toggle-level">{zoomPct}%</span>
                        </button>
                        <div
                            className="board-zoom-toolbar"
                            id={zoomPanelId}
                            hidden={!zoomOpen}
                            onKeyDown={(e) => {
                                if (e.key === "Escape" && zoomOpen) {
                                    e.stopPropagation();
                                    setZoomOpen(false);
                                }
                            }}
                        >
                            <button
                                type="button"
                                className={`btn btn-sm ${zoomLocked ? "active" : ""}`}
                                onClick={() => setSetting("zoomLocked", !zoomLocked)}
                                aria-pressed={zoomLocked}
                                aria-label={
                                    zoomLocked ? "Unlock zoom (currently locked)" : "Lock zoom at its current level"
                                }
                            >
                                {zoomLocked ? <Lock size={16} /> : <Unlock size={16} />}
                            </button>
                            <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => applyZoom(0.5, 0.5, 1 / ZOOM_STEP)}
                                aria-label="Zoom out"
                                disabled={zoomLocked}
                            >
                                <ZoomOut size={16} />
                            </button>
                            <input
                                type="range"
                                className="board-zoom-slider"
                                min={Math.round(MIN_ZOOM * 100)}
                                max={Math.round(MAX_ZOOM * 100)}
                                step={1}
                                value={zoomPct}
                                onChange={(e) => handleZoomSlider(Number(e.target.value))}
                                aria-label="Zoom level"
                                disabled={zoomLocked}
                            />
                            <span className="board-zoom-level">{zoomPct}%</span>
                            <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => applyZoom(0.5, 0.5, ZOOM_STEP)}
                                aria-label="Zoom in"
                                disabled={zoomLocked}
                            >
                                <ZoomIn size={16} />
                            </button>
                            <button
                                type="button"
                                className="btn btn-sm"
                                onClick={handleFitToScreen}
                                aria-label="Fit whole board to screen"
                                disabled={zoomLocked}
                            >
                                <Maximize size={16} /> <span className="board-zoom-btn-label">Fit</span>
                            </button>
                            <button
                                type="button"
                                className="btn btn-sm"
                                onClick={handleResetZoom}
                                aria-label="Reset to actual size (1 board unit per pixel)"
                                disabled={zoomLocked}
                            >
                                <Scan size={16} /> <span className="board-zoom-btn-label">Actual size</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
