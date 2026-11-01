import { CircleDot, CornerUpLeft, Eraser, Hash, Palette } from "lucide-react";

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
];

/** Position of digit `n` in the fixed 3x3 corner-note grid, as a 0..1 fraction. */
const cornerPosition = (n: number): { left: string; top: string } => {
    const { col, row } = cornerSlot(n);
    return { left: `${24 + col * 26}%`, top: `${26 + row * 26}%` };
};

export default function NumberPad({ values, palette, mode, onInput, onErase, onModeChange }: Props) {
    const swatches = mode === "color";
    // The pad's shape never changes with the mode (as in SudokuPad): the digits, with
    // a 0 key beside Erase. In colour mode the digits become swatches 1-9 and 0 is
    // the background colour (see mark_colors.ts); otherwise 0 is only live when the
    // puzzle's own domain includes it.
    const base = swatches ? palette.map((_, i) => i + 1) : values.filter((v) => v !== 0);
    const columns = padColumns(base.length);
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
                <span className="pad-key-preview" style={cornerPosition(v)}>
                    {v}
                </span>
            ) : (
                v
            )}
        </button>
    );
    return (
        <div className="number-pad">
            <div className="pad-grid" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
                {base.map((v) => key(v))}
            </div>
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
                {key(0, " pad-key-zero")}
                <button className="btn btn-flat pad-key wide pad-erase" onClick={onErase}>
                    <Eraser size={16} /> Erase
                </button>
            </div>
        </div>
    );
}

const padColumns = (count: number): number => (count <= 4 ? count : count <= 9 ? 3 : 5);
