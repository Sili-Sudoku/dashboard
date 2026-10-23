import { useCallback, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Maximize, ZoomIn, ZoomOut } from "lucide-react";

import type { CellId } from "@/runtime/geometry.ts";
import type { Scene, Shape } from "@/renderer/scene.ts";
import {
    cellInViewport,
    clampView,
    expandViewport,
    fitView,
    lineInViewport,
    MAX_ZOOM,
    MIN_ZOOM,
    panView,
    shapeInViewport,
    VIRTUALIZE_CELL_THRESHOLD,
    ZOOM_STEP,
    zoomViewAt,
    type ViewportRect,
} from "@/renderer/virtualize.ts";

import "./board.css";

interface Props {
    scene: Scene;
    onPaintStart: (cell: CellId, additive: boolean) => void;
    onPaintMove: (cell: CellId) => void;
    onPaintEnd: () => void;
    onClearSelection: () => void;
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

export default function Board({ scene, onPaintStart, onPaintMove, onPaintEnd, onClearSelection }: Props) {
    const painting = useRef(false);
    const panningFrom = useRef<{ x: number; y: number } | null>(null);
    const isLarge = scene.cells.length > VIRTUALIZE_CELL_THRESHOLD;

    const containerRef = useRef<HTMLDivElement>(null);
    // The visible rect, in board units — this *is* the SVG's viewBox. No scrolling:
    // panning/zooming just change this rect, like SudokuPad's canvas.
    const [view, setView] = useState<ViewportRect | null>(null);
    const [zoomPct, setZoomPct] = useState(100);

    useLayoutEffect(() => {
        if (!isLarge || view) return;
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const initial = fitView(scene.width, scene.height, rect.width, rect.height);
        setView(initial);
        setZoomPct(Math.round((rect.width / initial.width) * 100));
        // Only runs once, to establish the starting "whole board" view — re-fitting
        // on every scene/container change would fight the user's own pan/zoom.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLarge, view]);

    const visibleScene = useMemo(() => cullToViewport(scene, isLarge ? view : null), [scene, isLarge, view]);

    const applyZoom = useCallback(
        (fracX: number, fracY: number, factor: number) => {
            const el = containerRef.current;
            if (!el || !view) return;
            const rect = el.getBoundingClientRect();
            const next = zoomViewAt(view, scene.width, scene.height, rect.width, fracX, fracY, factor);
            setView(next);
            setZoomPct(Math.round((rect.width / next.width) * 100));
        },
        [view, scene.width, scene.height],
    );

    const handleZoomSlider = (pct: number) => {
        const el = containerRef.current;
        if (!el || !view) return;
        const rect = el.getBoundingClientRect();
        const currentScale = rect.width / view.width;
        applyZoom(0.5, 0.5, pct / 100 / currentScale);
    };

    const handleFitToScreen = () => {
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const next = fitView(scene.width, scene.height, rect.width, rect.height);
        setView(next);
        setZoomPct(Math.round((rect.width / next.width) * 100));
    };

    const handleResetZoom = () => {
        const el = containerRef.current;
        if (!el || !view) return;
        const rect = el.getBoundingClientRect();
        const cx = view.left + view.width / 2;
        const cy = view.top + view.height / 2;
        // "100%" = 1 board unit per screen pixel, recentered on wherever you currently are.
        const next = clampView(
            { left: cx - rect.width / 2, top: cy - rect.height / 2, width: rect.width, height: rect.height },
            scene.width,
            scene.height,
        );
        setView(next);
        setZoomPct(100);
    };

    // React's onWheel prop is attached passively at the root (for scroll-perf reasons
    // shared with every other wheel listener on the page), so preventDefault() inside
    // it can't actually stop the page from scrolling underneath — only a real native
    // listener, explicitly registered non-passive, can zoom without the page scrolling
    // along with it at the same time.
    useLayoutEffect(() => {
        if (!isLarge) return;
        const el = containerRef.current;
        if (!el) return;

        const onNativeWheel = (e: WheelEvent) => {
            e.preventDefault();
            const rect = el.getBoundingClientRect();
            const fracX = (e.clientX - rect.left) / rect.width;
            const fracY = (e.clientY - rect.top) / rect.height;
            const factor = Math.pow(ZOOM_STEP, -e.deltaY / 100);
            applyZoom(fracX, fracY, factor);
        };

        el.addEventListener("wheel", onNativeWheel, { passive: false });
        return () => el.removeEventListener("wheel", onNativeWheel);
    }, [isLarge, applyZoom]);

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

    const handleCellDown = (cell: CellId) => (e: ReactPointerEvent) => {
        if (e.button === 1 || e.button === 2) return; // middle/right-click pans instead (see the container handlers below)
        e.preventDefault();
        painting.current = true;
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

    const viewBox =
        isLarge && view ? `${view.left} ${view.top} ${view.width} ${view.height}` : scene.viewBox;

    const svg = (
        <svg
            className="board"
            viewBox={viewBox}
            width={isLarge ? "100%" : scene.width}
            height={isLarge ? "100%" : scene.height}
            role="grid"
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

            {/* constraint graphics below digits */}
            <g className="shapes" pointerEvents="none">
                {visibleScene.shapes.map((s, i) => (
                    <ShapeNode key={i} shape={s} />
                ))}
            </g>

            {/* grid + box lines */}
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
                        return (
                            <text
                                key={`v-${c.cell}`}
                                className={c.given ? "digit given" : "digit entered"}
                                x={cx}
                                y={cy}
                                fontSize={c.size * 0.62}
                                textAnchor="middle"
                                dominantBaseline="central"
                            >
                                {c.value}
                            </text>
                        );
                    }
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
                                        fontSize={c.size * 0.18}
                                        textAnchor="middle"
                                        dominantBaseline="central"
                                    >
                                        {n}
                                    </text>
                                );
                            })}
                            {c.centerNotes.length > 0 && (
                                <text
                                    className={`note-center ${c.flagged ? "note-flagged" : ""}`}
                                    x={cx}
                                    y={cy}
                                    fontSize={c.size * (c.centerNotes.length > 5 ? 0.14 : 0.19)}
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                >
                                    {c.centerNotes.join("")}
                                </text>
                            )}
                        </g>
                    );
                })}
            </g>
        </svg>
    );

    if (!isLarge) return svg;

    return (
        <div className="board-large-wrap">
            <div className="board-zoom-toolbar">
                <button type="button" onClick={() => applyZoom(0.5, 0.5, 1 / ZOOM_STEP)} aria-label="Zoom out">
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
                />
                <span className="board-zoom-level">{zoomPct}%</span>
                <button type="button" onClick={() => applyZoom(0.5, 0.5, ZOOM_STEP)} aria-label="Zoom in">
                    <ZoomIn size={16} />
                </button>
                <button type="button" onClick={handleFitToScreen} aria-label="Fit whole board to screen">
                    <Maximize size={16} /> Fit
                </button>
                <button type="button" onClick={handleResetZoom} aria-label="Reset zoom to 100%">
                    100%
                </button>
            </div>
            <div
                className="board-viewport"
                ref={containerRef}
                onPointerDown={handleContainerPointerDown}
                onPointerMove={handleContainerPointerMove}
                onPointerUp={stopPanning}
                onPointerLeave={stopPanning}
                onContextMenu={(e) => e.preventDefault()}
            >
                {svg}
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
