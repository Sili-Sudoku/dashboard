import { useId, type ReactNode } from "react";

import type { CellId } from "@/runtime/geometry.ts";
import type { Scene } from "@/renderer/scene.ts";
import ShapeNode from "@/renderer/ShapeNode.tsx";
import ValuesLayer from "@/renderer/ValuesLayer.tsx";
import PenLayer from "@/renderer/PenLayer.tsx";
import ZoomFooter from "@/renderer/ZoomFooter.tsx";
import { useBoardView, type ZoomControls } from "@/renderer/use_board_view.ts";
import { useCellPainting } from "@/renderer/use_cell_painting.ts";
import { usePenInput, type PenInput } from "@/renderer/use_pen_input.ts";

import "./board.css";

export type { PenInput, ZoomControls };

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
    const hatchId = `cpr-k7vq-hatch-${useId().replace(/:/g, "")}`;
    const painting = useCellPainting({ onPaintStart, onPaintMove, onPaintEnd });
    const {
        view,
        visibleScene,
        boxSize,
        zoomPct,
        zoomLocked,
        zoom,
        viewportHandlers,
        containerRef,
        measureRef,
        footerRef,
        headerRef,
    } = useBoardView({
        scene,
        hasHeader: !!header,
        hideFooter,
        onZoomControls,
        onSecondTouch: painting.stopPainting,
    });
    const penInput = usePenInput(pen, scene, view);
    const { handleCellDown, handleCellEnter, handleCellMove, stopPainting } = painting;

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

            {/* colour marks: the own colouring of cells by the player, under the grid and
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

            {/* same-value highlight: a soft wash over matching cells, under the grid and
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

            <ValuesLayer cells={visibleScene.cells} />

            {/* pen layer: the lines and X/O marks of the player over everything, and also
                the stroke that is being drawn now */}
            <PenLayer
                scene={scene}
                shapes={visibleScene.pen}
                draft={penInput.penDraft}
                erasing={penInput.erasingPieces}
            />
            {pen && (
                <rect
                    className="pen-surface"
                    x={0}
                    y={0}
                    width={scene.width}
                    height={scene.height}
                    fill="transparent"
                    onPointerDown={penInput.penDown}
                    onPointerMove={penInput.penMove}
                    onPointerUp={penInput.penUp}
                    onPointerCancel={penInput.penCancel}
                />
            )}
        </svg>
    );

    return (
        // .board-measure is the region that fills the flex space and is never capped.
        // .board-wrap has exactly the size boxSize and is centered horizontally
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
                    onContextMenu={(e) => e.preventDefault()}
                    {...viewportHandlers}
                >
                    {svg}
                </div>
                {!hideFooter && (
                    <ZoomFooter
                        footerRef={footerRef}
                        percent={zoomPct}
                        locked={zoomLocked}
                        onZoomIn={zoom.zoomIn}
                        onZoomOut={zoom.zoomOut}
                        onZoomToPercent={zoom.zoomToPercent}
                        onFit={zoom.fit}
                        onActualSize={zoom.actualSize}
                        onToggleLock={zoom.toggleLock}
                    >
                        {footer}
                    </ZoomFooter>
                )}
            </div>
        </div>
    );
}
