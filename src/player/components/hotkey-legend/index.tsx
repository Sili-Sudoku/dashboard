import { useSettings } from "@/app/use_settings.ts";
import { Keyboard } from "lucide-react";

import "./style.css";

const SHORTCUTS: { keys: string; action: string }[] = [
    { keys: "Click / drag", action: "select cells" },
    { keys: "Arrows", action: "move cursor (Shift+Arrow extends selection)" },
    { keys: "1–9", action: "enter value / toggle note / pick colour (0 = background), per the active pad mode" },
    { keys: "(type consecutive digits)", action: "for domains past 1-9, e.g. 1 then 0 enters 10" },
    { keys: "Shift+digit", action: "toggle a corner note directly" },
    { keys: "Ctrl/Cmd+digit", action: "toggle a centre note directly" },
    { keys: "Space", action: "switch between Digit and Corner mode" },
    { keys: "Backspace / Delete", action: "erase the active layer (value / corner / centre / colour)" },
    { keys: "Tab / Shift+Tab", action: "next / previous empty cell (Tab again past the last one leaves the board)" },
    { keys: "Enter", action: "select every cell sharing the cursor cell's value" },
    { keys: "Ctrl+Z", action: "undo" },
    { keys: "Ctrl+Shift+Z / Ctrl+Y", action: "redo" },
    { keys: "V", action: "check entered values/centre notes against the solution (if the puzzle has one)" },
    { keys: "R / C / B / G", action: "read aloud the cursor's row / column / box, or every given (screen readers)" },
    { keys: "Escape", action: "deselect everything — click a cell to start again" },
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
