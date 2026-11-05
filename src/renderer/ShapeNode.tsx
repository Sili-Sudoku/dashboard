import { useId, type ReactNode } from "react";
import type { ResolvedStyle, Shape } from "@/renderer/scene.ts";

/** The tile for a named pattern. It uses `color` and the size `unit` (pixels per cell). */
const patternTile = (name: NonNullable<ResolvedStyle["pattern"]>, color: string, unit: number): ReactNode => {
    const t = unit * 0.25;
    switch (name) {
        case "stripes":
            return (
                <path
                    d={`M ${-t / 4},${t / 4} l ${t / 2},${-t / 2} M 0,${t} l ${t},${-t} M ${t * 0.75},${t * 1.25} l ${t / 2},${-t / 2}`}
                    stroke={color}
                    strokeWidth={t / 4}
                />
            );
        case "dots":
            return <circle cx={t / 2} cy={t / 2} r={t / 5} fill={color} />;
        case "checks":
            return (
                <>
                    <rect width={t / 2} height={t / 2} fill={color} />
                    <rect x={t / 2} y={t / 2} width={t / 2} height={t / 2} fill={color} />
                </>
            );
        case "crosshatch":
            return <path d={`M 0,0 L ${t},${t} M ${t},0 L 0,${t}`} stroke={color} strokeWidth={t / 8} />;
    }
};

/** The value for `fill`, and the `<defs>` that it uses, when the style has a pattern or picture. */
function useFill(s: ResolvedStyle): { fill: string; defs: ReactNode } {
    const id = `cpr-xj8n-fill-${useId().replace(/:/g, "")}`;
    const unit = s.unit ?? 40;
    if (s.image && s.bounds) {
        const { x, y, w, h } = s.bounds;
        return {
            fill: `url(#${id})`,
            defs: (
                <defs>
                    <pattern id={id} patternUnits="userSpaceOnUse" x={x} y={y} width={w} height={h}>
                        <image href={s.image} x={0} y={0} width={w} height={h} preserveAspectRatio="xMidYMid slice" />
                    </pattern>
                </defs>
            ),
        };
    }
    if (s.pattern) {
        const color = s.fill === "none" ? s.stroke : s.fill;
        const t = unit * 0.25;
        return {
            fill: `url(#${id})`,
            defs: (
                <defs>
                    <pattern id={id} patternUnits="userSpaceOnUse" width={t} height={t}>
                        {patternTile(s.pattern, color, unit)}
                    </pattern>
                </defs>
            ),
        };
    }
    return { fill: s.fill, defs: null };
}

/** One constraint graphic as SVG. The live Board and the static thumbnail renderer both use it. */
export default function ShapeNode({ shape }: { shape: Shape }) {
    const s = shape.style;
    const { fill, defs } = useFill(s);
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
                <>
                    {defs}
                    <polygon
                        points={shape.points.map((p) => `${p.x},${p.y}`).join(" ")}
                        fill={fill}
                        fillOpacity={s.opacity}
                        stroke={s.stroke}
                        strokeWidth={s.strokeWidth}
                    />
                </>
            );
        case "circle":
            return (
                <>
                    {defs}
                    <circle
                        cx={shape.cx}
                        cy={shape.cy}
                        r={shape.r}
                        fill={fill}
                        fillOpacity={s.opacity}
                        stroke={s.stroke}
                        strokeWidth={s.strokeWidth}
                    />
                </>
            );
        case "rect":
            return (
                <>
                    {defs}
                    <rect
                        x={shape.x}
                        y={shape.y}
                        width={shape.w}
                        height={shape.h}
                        fill={fill}
                        fillOpacity={s.opacity}
                        stroke={s.stroke}
                        strokeWidth={s.strokeWidth}
                    />
                </>
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
