import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Lock, Maximize, Scan, Unlock, ZoomIn, ZoomOut } from "lucide-react";

import { useSettings } from "@/app/use_settings.ts";
import type { CellId } from "@/runtime/geometry.ts";
import type { Scene, Shape } from "@/renderer/scene.ts";
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

// Breathing room against window.innerWidth/innerHeight when clamping the fit (#77
// follow-up) — keeps the box from touching the very edge of the browser viewport.
const EDGE_MARGIN = 16;

// Matches board.css's `.board-wrap { gap: 0.5rem }` — the toolbar sits *above* the
// viewport inside the same wrap, so that gap (plus the toolbar's own height, measured
// below) has to come out of the height budget too, or the wrap renders taller than
// what was actually available and pushes whatever's below the board off-screen (#77
// follow-up: this is what was still showing up as "a little overflow").
const TOOLBAR_GAP = 8;

interface Props {
    scene: Scene;
    onPaintStart: (cell: CellId, additive: boolean) => void;
    onPaintMove: (cell: CellId) => void;
    onPaintEnd: () => void;
    onClearSelection: () => void;
    /** Accessible name for the board (the SVG has no per-cell DOM; see PuzzlePlayer's live region). */
    label?: string;
    /** Id of an element describing how to operate the board. */
    describedBy?: string;
}

/** Culls scene.cells/gridLines/shapes to a margin around `viewport` — or returns `scene` as-is when `viewport` is null. */
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

/** Center notes share one text run, so more candidates means less room each. A flat
 * per-character shrink rate doesn't actually track how wide the rendered text gets
 * (short runs looked tiny/wasted the space, longer runs still crept toward the cell's
 * edge) — this instead targets a roughly constant *rendered width* (~82% of the cell,
 * leaving a clean margin on each side) for as long as that's achievable, using a
 * typical digit's width-to-font-size ratio. MAX caps a 1-2 candidate run from blowing
 * up to fill most of the cell (it'd otherwise read as a huge, oddly-centered digit);
 * MIN floors out a long run (a large-domain puzzle's candidate list) before it'd
 * shrink past legible, letting it modestly overflow the target width instead. */
const CENTER_NOTE_TARGET_WIDTH = 0.82;
const CENTER_NOTE_GLYPH_WIDTH_EM = 0.6;
const centerNoteFontFactor = (charCount: number): number =>
    clamp(CENTER_NOTE_TARGET_WIDTH / (charCount * CENTER_NOTE_GLYPH_WIDTH_EM), 0.11, 0.3);

export default function Board({ scene, onPaintStart, onPaintMove, onPaintEnd, onClearSelection, label, describedBy }: Props) {
    const hatchId = `hatch-${useId().replace(/:/g, "")}`;
    const painting = useRef(false);
    const panningFrom = useRef<{ x: number; y: number } | null>(null);
    // Two-finger touch pan/zoom (#70 follow-up): a touchscreen has no middle/right
    // button for the desktop pan below, and a single finger is already claimed by
    // cell-selection drag (handleCellDown) — so this follows the same convention as
    // maps/photo viewers, where a second finger is what pans/pinch-zooms instead.
    const activeTouches = useRef(new Map<number, { x: number; y: number }>());
    const pinchAnchor = useRef<{ x: number; y: number; dist: number } | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const measureRef = useRef<HTMLDivElement>(null);
    const toolbarRef = useRef<HTMLDivElement>(null);
    // The visible rect, in board units — this *is* the SVG's viewBox. No scrolling:
    // panning/zooming just change this rect, like SudokuPad's canvas.
    const [view, setView] = useState<ViewportRect | null>(null);
    const [zoomPct, setZoomPct] = useState(100);
    // Freezes the view's scale (wheel, +/-, slider, Fit, Actual size) while panning
    // still works — e.g. for a player who keeps nudging the zoom by accident while
    // just trying to scroll/pan around a puzzle they've already sized how they want.
    // Defaults from (and persists to) Settings (#69) instead of always starting
    // unlocked and forgetting the choice on reload.
    const [settings, setSetting] = useSettings();
    const zoomLocked = settings.zoomLocked;
    // The wrap/viewport box's own on-screen size (#77 follow-up) — a stable canvas
    // the view pans/zooms *within*, not something that visibly resizes every time
    // the player zooms, but it does track .board-measure's available space via a
    // ResizeObserver (below) so it doesn't freeze at whatever happened to be
    // available on first mount and then overflow once the window/devtools panel
    // changes size. Left unset until the first measurement runs.
    const [boxSize, setBoxSize] = useState<{ width: number; height: number } | null>(null);

    useLayoutEffect(() => {
        const el = measureRef.current;
        if (!el) return;
        let firstFit = true;

        // Not fitView() here — that letterboxes the viewBox to match the *measured*
        // container's aspect ratio, which is right when the box is a fixed external
        // shape (e.g. a later manual "Fit to screen"). But here the box's own shape
        // is *derived* from the scene (below), so the starting view should just be
        // the scene's own bounding box — no letterboxing to a container aspect
        // ratio that the box won't actually keep.
        const fit = () => {
            const rect = el.getBoundingClientRect();
            // .board-measure's *measured* size turned out not to be as independent of
            // its own children as intended — confirmed with a logging run: every
            // resize tick reported a size bigger than the last, by roughly the same
            // amount, each time Board.tsx set boxSize onto the elements nested
            // inside it (a feedback loop, not a one-off misread). Whatever the exact
            // mechanism, the window's own bounds are a ceiling nothing can
            // legitimately exceed, so clamp against those rather than trusting the
            // flex-reported size outright — that caps the loop regardless of cause.
            const width = Math.min(rect.width, window.innerWidth - rect.left - EDGE_MARGIN);
            const height = Math.min(rect.height, window.innerHeight - rect.top - EDGE_MARGIN);
            if (width <= 0 || height <= 0) return;
            // The toolbar renders *above* the viewport inside the same wrap (see
            // TOOLBAR_GAP above) — its height isn't board-size-dependent, so measuring
            // it directly and subtracting it from the budget is safe (not circular).
            const toolbarHeight = toolbarRef.current?.getBoundingClientRect().height ?? 0;
            const viewportHeight = height - toolbarHeight - TOOLBAR_GAP;
            if (width <= 0 || viewportHeight <= 0) return;
            const scale = clamp(Math.min(width / scene.width, viewportHeight / scene.height), MIN_ZOOM, MAX_ZOOM);
            setBoxSize({ width: scene.width * scale, height: scene.height * scale });
            // Only the very first fit also sets the starting view/zoom — later
            // resizes just let the existing canvas grow/shrink; they shouldn't
            // fight the player's own pan/zoom by resetting it.
            if (!firstFit) return;
            firstFit = false;
            setView({ left: 0, top: 0, width: scene.width, height: scene.height });
            // 100% = the whole board fits in view, always — not the achieved physical
            // scale, which swings with screen size/DPI/cell size and had no stable
            // meaning to the player (#77 follow-up: this showed up as a baseline fit
            // reading "169%" on one window and something else on another). Every other
            // zoom% below is defined the same way: scene.width / view.width * 100.
            setZoomPct(100);
        };

        fit();
        window.addEventListener("resize", fit);

        if (typeof ResizeObserver === "undefined") {
            // not available in every test/legacy env — initial fit above still runs
            return () => window.removeEventListener("resize", fit);
        }
        const observer = new ResizeObserver(fit);
        observer.observe(el);
        return () => {
            window.removeEventListener("resize", fit);
            observer.disconnect();
        };
        // Only re-runs if the scene itself changes (a different puzzle) — PuzzlePlayer
        // remounts Board per-puzzle anyway, so in practice this is mount-only.
    }, [scene.width, scene.height]);

    const visibleScene = useMemo(() => cullToViewport(scene, view), [scene, view]);

    const applyZoom = useCallback(
        (fracX: number, fracY: number, factor: number) => {
            if (zoomLocked) return;
            const el = containerRef.current;
            if (!el || !view) return;
            const rect = el.getBoundingClientRect();
            const next = zoomViewAt(view, scene.width, scene.height, rect.width, fracX, fracY, factor);
            setView(next);
            // scene.width / view.width, not rect.width / view.width — see the mount-fit
            // comment above; this keeps every zoom action's % relative to "whole board
            // visible", regardless of the container's actual pixel size.
            setZoomPct(Math.round((scene.width / next.width) * 100));
        },
        [view, scene.width, scene.height, zoomLocked],
    );

    const handleZoomSlider = (pct: number) => {
        if (!view) return;
        // Inverse of the display formula above: the view width (in board units) that
        // would make scene.width / viewWidth * 100 equal the slider's chosen pct.
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
        setZoomPct(Math.round((scene.width / next.width) * 100)); // always 100 — see above
    };

    const handleResetZoom = () => {
        if (zoomLocked) return;
        const el = containerRef.current;
        if (!el || !view) return;
        const rect = el.getBoundingClientRect();
        const cx = view.left + view.width / 2;
        const cy = view.top + view.height / 2;
        // "Actual size" = 1 board unit per screen pixel, recentered on wherever you
        // currently are — a different, independently useful zoom level from "fit", so
        // it isn't literally "100%" anymore now that 100% always means "fit" (#77
        // follow-up); the displayed % below reflects whatever that native scale works
        // out to relative to fit, same formula as every other zoom action.
        const next = clampView(
            { left: cx - rect.width / 2, top: cy - rect.height / 2, width: rect.width, height: rect.height },
            scene.width,
            scene.height,
        );
        setView(next);
        setZoomPct(Math.round((scene.width / next.width) * 100));
    };

    // React's onWheel prop is attached passively at the root (for scroll-perf reasons
    // shared with every other wheel listener on the page), so preventDefault() inside
    // it can't actually stop the page from scrolling underneath — only a real native
    // listener, explicitly registered non-passive, can zoom without the page scrolling
    // along with it at the same time.
    useLayoutEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const onNativeWheel = (e: WheelEvent) => {
            // Locked: let the wheel event do whatever it'd normally do (scroll the
            // page) instead of hijacking it for a zoom that's just going to no-op.
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

    // Panning (#49): middle- or right-button drag, so it never competes with the
    // existing left-button cell-selection drag below.
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

    // Tracked at the container level (not per-cell) since the second finger usually
    // lands on a cell — these *Capture handlers run during the capture phase, before
    // that cell's own onPointerDown (bubble phase) below, so stopPropagation() here
    // keeps a 2nd finger from also starting/extending a cell-selection drag.
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
        // Reads the *pending* view via the updater form, not the `view` closed over
        // at render time — two fingers' pointermove events routinely land in the same
        // synchronous burst (no render in between), and a second setView in that burst
        // computing from the same stale `view` would silently clobber the first.
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
        if (e.button === 1 || e.button === 2) return; // middle/right-click pans instead (see the container handlers below)
        e.preventDefault();
        painting.current = true;
        // preventDefault() above also suppresses the browser's own click-to-focus, so focus
        // the board by hand — that's what makes Tab step between cells (see use_puzzle_session).
        (e.currentTarget as SVGElement).ownerSVGElement?.focus({ preventScroll: true });
        (e.target as Element).releasePointerCapture?.(e.pointerId);
        onPaintStart(cell, e.shiftKey || e.metaKey || e.ctrlKey);
    };

    const handleCellEnter = (cell: CellId) => () => {
        if (painting.current) onPaintMove(cell);
    };

    const stopPainting = () => {
        if (!painting.current) return;
        painting.current = false;
        onPaintEnd();
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
                {/* Violated/invalid cells get a hatch on top of the tint, so "wrong" doesn't
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
                    onPointerEnter={handleCellEnter(c.cell)}
                />
            ))}

            <g pointerEvents="none">
                {visibleScene.cells
                    .filter((c) => c.tone !== "normal")
                    .map((c) => (
                        <rect key={`hatch-${c.cell}`} x={c.x} y={c.y} width={c.size} height={c.size} fill={`url(#${hatchId})`} />
                    ))}
            </g>

            {/* grid + box lines, drawn before constraint graphics so a dot/marker
                sitting on a cell boundary (kropki, XV, ...) isn't painted over by
                the line it sits on */}
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

            {/* fog: an opaque cover per still-hidden cell, painted after the grid
                lines and constraint graphics so neither leaks through — simpler
                than making every shape kind individually cell-aware. Layered
                before the ring/digit groups below so the player's own selection
                and typing (see scene.ts) still show up on top of the fog. */}
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

            {/* selection/cursor ring — layered above the tone fill so a click still
                shows feedback even on a violated/invalid cell */}
            <g className="rings" pointerEvents="none">
                {visibleScene.cells
                    .filter((c) => c.ring)
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
                            {c.notes.map((n) => {
                                const col = (n - 1) % 3;
                                const row = Math.floor((n - 1) / 3);
                                return (
                                    <text
                                        key={`n-${c.cell}-${n}`}
                                        className={`note ${c.flagged ? "note-flagged" : ""}`}
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
                                    {centerText}
                                </text>
                            )}
                        </g>
                    );
                })}
            </g>
        </svg>
    );

    return (
        // .board-measure is the always-uncapped flex-filling region; .board-wrap is
        // sized to exactly boxSize (#77 follow-up) and horizontally centered (top-
        // aligned, not vertically centered — see board.css) within it — grows to
        // fill available space up to the puzzle's own natural*MAX_ZOOM size, shrinks
        // to hug small puzzles instead of forcing a mostly-empty box, and tracks
        // .board-measure's size via ResizeObserver so it doesn't freeze at whatever
        // happened to be available on first mount.
        <div className="board-measure" ref={measureRef}>
            <div className="board-wrap" style={boxSize ? { width: boxSize.width } : undefined}>
                <div className="board-zoom-toolbar" ref={toolbarRef}>
                    <button
                        type="button"
                        className={`btn btn-sm ${zoomLocked ? "active" : ""}`}
                        onClick={() => setSetting("zoomLocked", !zoomLocked)}
                        aria-pressed={zoomLocked}
                        aria-label={zoomLocked ? "Unlock zoom (currently locked)" : "Lock zoom at its current level"}
                    >
                        {zoomLocked ? <Lock size={16} /> : <Unlock size={16} />}
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => applyZoom(0.5, 0.5, 1 / ZOOM_STEP)} aria-label="Zoom out" disabled={zoomLocked}>
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
                    <button type="button" className="btn btn-sm" onClick={() => applyZoom(0.5, 0.5, ZOOM_STEP)} aria-label="Zoom in" disabled={zoomLocked}>
                        <ZoomIn size={16} />
                    </button>
                    <button type="button" className="btn btn-sm" onClick={handleFitToScreen} aria-label="Fit whole board to screen" disabled={zoomLocked}>
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
            </div>
        </div>
    );
}

function ShapeNode({ shape }: { shape: Shape }) {
    const s = shape.style;
    const dash = s.dashed ? `${s.strokeWidth * 2} ${s.strokeWidth * 1.5}` : undefined;

    switch (shape.kind) {
        case "polyline":
            return (
                <polyline
                    points={shape.points.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke={s.stroke}
                    strokeWidth={s.strokeWidth}
                    strokeOpacity={s.opacity}
                    strokeLinecap={shape.rounded ? "round" : "butt"}
                    strokeLinejoin="round"
                />
            );
        case "polygon":
            return (
                <polygon
                    points={shape.points.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill={s.fill}
                    fillOpacity={s.opacity}
                    stroke={s.stroke}
                    strokeWidth={s.strokeWidth}
                />
            );
        case "circle":
            return (
                <circle
                    cx={shape.cx}
                    cy={shape.cy}
                    r={shape.r}
                    fill={s.fill}
                    fillOpacity={s.opacity}
                    stroke={s.stroke}
                    strokeWidth={s.strokeWidth}
                />
            );
        case "rect":
            return (
                <rect
                    x={shape.x}
                    y={shape.y}
                    width={shape.w}
                    height={shape.h}
                    fill={s.fill}
                    fillOpacity={s.opacity}
                    stroke={s.stroke}
                    strokeWidth={s.strokeWidth}
                />
            );
        case "text":
            return (
                <text
                    x={shape.x}
                    y={shape.y}
                    fontSize={shape.fontSize}
                    fontWeight={shape.bold ? "bold" : undefined}
                    fill={s.stroke}
                    textAnchor="middle"
                    dominantBaseline="central"
                >
                    {shape.text}
                </text>
            );
        case "arrowhead": {
            const { at, angle, size } = shape;
            const a1 = angle + Math.PI * 0.82;
            const a2 = angle - Math.PI * 0.82;
            const p1 = `${at.x + Math.cos(a1) * size},${at.y + Math.sin(a1) * size}`;
            const p2 = `${at.x + Math.cos(a2) * size},${at.y + Math.sin(a2) * size}`;
            return (
                <polyline
                    points={`${p1} ${at.x},${at.y} ${p2}`}
                    fill="none"
                    stroke={s.stroke}
                    strokeWidth={s.strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            );
        }
        case "cage":
            return (
                <g>
                    {shape.segments.map((seg, i) => (
                        <line
                            key={i}
                            x1={seg[0].x}
                            y1={seg[0].y}
                            x2={seg[1].x}
                            y2={seg[1].y}
                            stroke={s.stroke}
                            strokeWidth={Math.max(1, s.strokeWidth)}
                            strokeDasharray={dash ?? "4 3"}
                        />
                    ))}
                    {shape.label && (
                        <text
                            x={shape.label.x}
                            y={shape.label.y}
                            fontSize={12}
                            fontWeight={700}
                            fill={s.stroke}
                        >
                            {shape.label.text}
                        </text>
                    )}
                </g>
            );
    }
}
