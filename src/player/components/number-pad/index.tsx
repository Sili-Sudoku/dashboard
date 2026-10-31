import { CircleDot, CornerUpLeft, Eraser, Hash } from "lucide-react";

import type { InputMode } from "@/runtime/session.ts";

import "./style.css";

interface Props {
    values: readonly number[];
    mode: InputMode;
    onInput: (value: number) => void;
    onErase: () => void;
    onModeChange: (mode: InputMode) => void;
}

const MODES: { mode: InputMode; label: string; icon: typeof Hash }[] = [
    { mode: "digit", label: "Digit", icon: Hash },
    { mode: "corner", label: "Corner", icon: CornerUpLeft },
    { mode: "center", label: "Center", icon: CircleDot },
];

/** Position of digit `n` in the fixed 3x3 corner-note grid, as a 0..1 fraction. */
const cornerPosition = (n: number): { left: string; top: string } => {
    const col = (n - 1) % 3;
    const row = Math.floor((n - 1) / 3);
    return { left: `${24 + col * 26}%`, top: `${26 + row * 26}%` };
};

export default function NumberPad({ values, mode, onInput, onErase, onModeChange }: Props) {
    return (
        <div className="number-pad">
            <div className="pad-grid" style={{ gridTemplateColumns: `repeat(${padColumns(values.length)}, 1fr)` }}>
                {values.map((v) => (
                    <button
                        key={v}
                        className={`pad-key pad-key-${mode}`}
                        aria-label={mode === "digit" ? String(v) : `${mode === "corner" ? "Corner" : "Center"} note ${v}`}
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
                ))}
            </div>
            <div className="pad-modes" role="group" aria-label="Input mode">
                {MODES.map(({ mode: m, label, icon: Icon }) => (
                    <button
                        key={m}
                        className={`pad-key wide ${mode === m ? "active" : ""}`}
                        aria-pressed={mode === m}
                        onClick={() => onModeChange(m)}
                    >
                        <Icon size={15} /> {label}
                    </button>
                ))}
            </div>
            <div className="pad-actions">
                <button className="pad-key wide" onClick={onErase}>
                    <Eraser size={16} /> Erase
                </button>
            </div>
        </div>
    );
}

const padColumns = (count: number): number => (count <= 4 ? count : count <= 9 ? 3 : 5);
