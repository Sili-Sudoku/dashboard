import { useSettings } from "@/app/use_settings.ts";
import { Keyboard } from "lucide-react";

import { SHORTCUTS } from "./shortcuts.ts";

import "./style.css";

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
