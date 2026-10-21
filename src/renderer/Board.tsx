import { useRef, type PointerEvent as ReactPointerEvent } from "react";

import type { CellId } from "@/runtime/geometry.ts";
import type { Scene, Shape } from "@/renderer/scene.ts";

import "./board.css";

interface Props {
    scene: Scene;
    onPaintStart: (cell: CellId, additive: boolean) => void;
    onPaintMove: (cell: CellId) => void;
    onPaintEnd: () => void;
    onClearSelection: () => void;
}

export default function Board({ scene, onPaintStart, onPaintMove, onPaintEnd, onClearSelection }: Props) {
    const painting = useRef(false);

    const handleCellDown = (cell: CellId) => (e: ReactPointerEvent) => {
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

    return (
        <svg
            className="board"
            viewBox={scene.viewBox}
            width={scene.width}
            height={scene.height}
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
            {scene.cells.map((c) => (
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
                {scene.shapes.map((s, i) => (
                    <ShapeNode key={i} shape={s} />
                ))}
            </g>

            {/* grid + box lines */}
            <g className="grid" pointerEvents="none">
                {scene.gridLines.map((l, i) => (
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
                {scene.cells
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
                {scene.cells.map((c) => {
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
                                        className="note"
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
                                    className="note-center"
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
