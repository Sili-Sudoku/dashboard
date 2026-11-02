import { useSettings } from "@/app/use_settings.ts";
import { Keyboard } from "lucide-react";

import "./style.css";

const SHORTCUTS: { keys: string; action: string }[] = [
    { keys: "Click / drag", action: "select cells" },
    { keys: "Arrows", action: "move the cursor (Shift+Arrow extends the selection)" },
    { keys: "1–9", action: "enter a value, toggle a note, or pick a color (0 = background), as the pad mode sets" },
    { keys: "(type consecutive digits)", action: "for domains past 1-9: press 1 then 0 to enter 10" },
    { keys: "Shift+digit", action: "toggle a corner note directly" },
    { keys: "Ctrl/Cmd+digit", action: "toggle a center note directly" },
    { keys: "Space", action: "switch between Digit and Corner mode" },
    { keys: "Backspace / Delete", action: "erase the active layer (value, corner, center, or color)" },
    { keys: "Tab / Shift+Tab", action: "go to the next or previous empty cell (Tab past the last empty cell leaves the board)" },
    { keys: "Enter", action: "select each cell with the same value as the cursor cell" },
    { keys: "Ctrl+Z", action: "undo" },
    { keys: "Ctrl+Shift+Z / Ctrl+Y", action: "redo" },
    { keys: "V", action: "check entered values and center notes against the solution (if the puzzle has one)" },
    { keys: "R / C / B / G", action: "read aloud the row, column, or box of the cursor, or each given (screen readers)" },
    { keys: "Escape", action: "deselect all cells. Click a cell to start again" },
];

export default function HotkeyLegend() {
    // Collapsed by default: only the toggle button shows.
    // This button is the "Show/Hide shortcuts" control.
    // It is not a separate button above a second collapsible section (same pattern as ConstraintPanel).
    const [settings, setSetting] = useSettings();
    const open = settings.hotkeyLegendOpen;

    return (
        <section className={`hotkey-legend ${open ? "hk-open" : ""}`}>
            <button
                type="button"
                className="btn btn-flat pp-toggle hk-toggle"
                aria-expanded={open}
                onClick={() => setSetting("hotkeyLegendOpen", !open)}
            >
                <Keyboard size={15} /> {open ? "Hide shortcuts" : "Keyboard shortcuts"}
            </button>

            {open && (
                <dl>
                    {SHORTCUTS.map((s) => (
                        <div className="hk-row" key={s.keys}>
                            <dt>{s.keys}</dt>
                            <dd>{s.action}</dd>
                        </div>
                    ))}
                </dl>
            )}
        </section>
    );
}
