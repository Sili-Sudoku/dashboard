import { parseSegmentKey, type PenPoint } from "@/runtime/pen.ts";
import type { Scene } from "@/renderer/scene.ts";
import ShapeNode from "@/renderer/ShapeNode.tsx";

interface Props {
    scene: Scene;
    /** The pen shapes to draw (already culled to the view). */
    shapes: Scene["pen"];
    /** The stroke being drawn now, as lattice points. */
    draft: readonly PenPoint[];
    /** When the stroke lies wholly on existing lines, the pieces that release would remove. */
    erasing: readonly string[] | undefined;
}

/** The lines and X/O marks of the player over everything, and also the stroke that is being drawn now. */
export default function PenLayer({ scene, shapes, draft, erasing }: Props) {
    const toX = (p: PenPoint) => scene.origin.x + (p.x * scene.cellSize) / 2;
    const toY = (p: PenPoint) => scene.origin.y + (p.y * scene.cellSize) / 2;
    return (
        <g className="pen" pointerEvents="none">
            {shapes.map((s, i) => (
                <ShapeNode key={i} shape={s} />
            ))}
            {draft.length > 1 &&
                (erasing ? (
                    // The stroke lies wholly on existing lines, so release removes them.
                    // Mark exactly those pieces in red, thicker than the line.
                    erasing.map((key) => {
                        const [a, b] = parseSegmentKey(key);
                        return (
                            <line key={key} className="pen-erasing" x1={toX(a)} y1={toY(a)} x2={toX(b)} y2={toY(b)} />
                        );
                    })
                ) : (
                    <polyline className="pen-draft" points={draft.map((p) => `${toX(p)},${toY(p)}`).join(" ")} />
                ))}
        </g>
    );
}
