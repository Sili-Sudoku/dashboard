import type { CellShape } from "@/renderer/scene.ts";
import { cornerSlot } from "@/renderer/corner_slot.ts";
import { centerNoteFontFactor } from "@/renderer/board_math.ts";

/** The digits the player and the puzzle put in cells, or else the corner and centre notes. */
export default function ValuesLayer({ cells }: { cells: readonly CellShape[] }) {
    return (
        <g className="values" pointerEvents="none">
            {cells.map((c) => {
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
                                    <tspan key={n} className={c.ruledOutNotes.includes(n) ? "note-flagged" : undefined}>
                                        {n}
                                    </tspan>
                                ))}
                            </text>
                        )}
                    </g>
                );
            })}
        </g>
    );
}
