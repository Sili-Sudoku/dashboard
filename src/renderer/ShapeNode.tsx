import type { Shape } from "@/renderer/scene.ts";

/** One constraint graphic as SVG. Shared by the live Board and the static thumbnail renderer. */
export default function ShapeNode({ shape }: { shape: Shape }) {
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
                        <text x={shape.label.x} y={shape.label.y} fontSize={12} fontWeight={700} fill={s.stroke}>
                            {shape.label.text}
                        </text>
                    )}
                </g>
            );
    }
}
