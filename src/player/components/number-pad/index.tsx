import { CircleDot, CornerUpLeft, Eraser, Hash, Palette, PenLine } from "lucide-react";

import { cornerSlot } from "@/renderer/corner_slot.ts";
import { BACKGROUND_MARK_INDEX, resolveMarkColor } from "@/runtime/mark_colors.ts";
import type { InputMode } from "@/runtime/session.ts";

import "./style.css";

interface Props {
    values: readonly number[];
    /** Colour-marking palette (#35), shown as swatches in "color" mode. */
    palette: readonly string[];
    mode: InputMode;
    onInput: (value: number) => void;
    onErase: () => void;
    onModeChange: (mode: InputMode) => void;
}

const MODES: { mode: InputMode; label: string; icon: typeof Hash }[] = [
    { mode: "digit", label: "Digit", icon: Hash },
    { mode: "corner", label: "Corner", icon: CornerUpLeft },
    { mode: "center", label: "Center", icon: CircleDot },
    { mode: "color", label: "Color", icon: Palette },
    { mode: "pen", label: "Pen", icon: PenLine },
];

/** Where the corner-mode preview sits: in the first corner. The real place of a note depends on the other notes of the cell. */
const cornerPosition = (): { left: string; top: string } => {
    const { col, row } = cornerSlot(0);
    return { left: `${24 + col * 26}%`, top: `${26 + row * 26}%` };
};

export default function NumberPad({ values, palette, mode, onInput, onErase, onModeChange }: Props) {
    const swatches = mode === "color";
    // The shape of the pad never changes with the mode (as in SudokuPad).
    // It has the digits and a 0 key beside Erase.
    // In colour mode, the digits are swatches 1-9 and 0 is the background colour (see mark_colors.ts).
    // In other modes, 0 is live only when the domain of the puzzle includes it.
    // The swatches are as many as the digits (a 6x6 shows colours 1-6), so the pad has the same size in every mode.
    const digits = values.filter((v) => v !== 0);
    const base = swatches ? palette.slice(0, digits.length).map((_, i) => i + 1) : digits;
    const columns = padColumns(base.length);
    // A puzzle with more digits than colours (a 25x25) keeps the height of its digit pad in colour mode.
    const digitRows = Math.ceil(digits.length / padColumns(digits.length));
    const key = (v: number, extra = "") => (
        <button
            key={v}
            disabled={v === 0 && !swatches && !values.includes(0)}
            className={`btn btn-flat pad-key pad-key-${mode}${extra}`}
            aria-label={
                mode === "digit"
                    ? String(v)
                    : mode === "color"
                      ? v === 0
                          ? "Background color"
                          : `Color ${v}`
                      : `${mode === "corner" ? "Corner" : "Center"} note ${v}`
            }
            style={
                swatches
                    ? { backgroundColor: resolveMarkColor(palette, v === 0 ? BACKGROUND_MARK_INDEX : v - 1) }
                    : undefined
            }
            onClick={() => onInput(v)}
        >
            {mode === "corner" ? (
                <span className="pad-key-preview" style={cornerPosition()}>
                    {v}
                </span>
            ) : (
                v
            )}
        </button>
    );
    return (
        <div className="number-pad">
            {mode === "pen" ? (
                <PenGuide rows={Math.ceil(base.length / columns)} />
            ) : (
                <div
                    className="pad-grid"
                    style={{
                        gridTemplateColumns: `repeat(${columns}, 1fr)`,
                        minHeight: `calc(${digitRows} * 44px + ${digitRows - 1} * 0.4rem)`,
                        alignContent: "start",
                    }}
                >
                    {base.map((v) => key(v))}
                </div>
            )}
            <div className="pad-modes" role="group" aria-label="Input mode">
                {MODES.map(({ mode: m, label, icon: Icon }) => (
                    <button
                        key={m}
                        className={`btn btn-flat pad-key wide ${mode === m ? "active" : ""}`}
                        aria-pressed={mode === m}
                        onClick={() => onModeChange(m)}
                    >
                        <Icon size={15} /> {label}
                    </button>
                ))}
            </div>
            <div className="pad-actions">
                {mode !== "pen" && key(0, " pad-key-zero")}
                <button className="btn btn-flat pad-key wide pad-erase" onClick={onErase}>
                    <Eraser size={16} /> {mode === "pen" ? "Clear pen" : "Erase"}
                </button>
            </div>
        </div>
    );
}

/** How the pen works, as four small tiles in the space that the digit keys leave empty.
 *  The pad then keeps its size in Pen mode. The tiles are not buttons: the pen works on the board. */
function PenGuide({ rows }: { rows: number }) {
    const stroke = { stroke: "currentColor", strokeWidth: 3, strokeLinecap: "round", fill: "none" } as const;
    const steps = [
        { how: "Drag", what: "draw a line", icon: <path d="M5 21 L14 8 L23 14" {...stroke} /> },
        {
            how: "Click",
            what: "add an X",
            icon: <path d="M7 7 L21 21 M21 7 L7 21" {...stroke} />,
        },
        { how: "Click again", what: "make it an O", icon: <circle cx="14" cy="14" r="9" {...stroke} /> },
        {
            how: "Once more",
            what: "remove it",
            icon: <circle cx="14" cy="14" r="9" {...stroke} strokeDasharray="2 5" opacity="0.5" />,
        },
    ];
    return (
        <ol
            className="pad-pen-guide"
            aria-label="How the pen works"
            style={{ height: `calc(${rows} * 44px + ${rows - 1} * 0.4rem)` }}
        >
            {steps.map(({ how, what, icon }) => (
                <li key={how}>
                    <svg viewBox="0 0 28 28" width="26" height="26" aria-hidden="true">
                        {icon}
                    </svg>
                    <span>
                        <b>{how}</b> {what}
                    </span>
                </li>
            ))}
        </ol>
    );
}

const padColumns = (count: number): number => (count <= 4 ? count : count <= 9 ? 3 : 5);
