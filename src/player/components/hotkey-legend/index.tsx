import "./style.css";

const SHORTCUTS: { keys: string; action: string }[] = [
    { keys: "Click / drag", action: "select cells" },
    { keys: "Arrows", action: "move cursor (Shift+Arrow extends selection)" },
    { keys: "1–9", action: "enter value / toggle note, per the active pad mode" },
    { keys: "Shift+digit", action: "toggle a corner note directly" },
    { keys: "Ctrl/Cmd+digit", action: "toggle a centre note directly" },
    { keys: "Space", action: "switch between Digit and Corner mode" },
    { keys: "Backspace / Delete", action: "erase the active layer (value / corner / centre)" },
    { keys: "Tab / Shift+Tab", action: "jump to the next / previous empty cell" },
    { keys: "Enter", action: "select every cell sharing the cursor cell's value" },
    { keys: "Ctrl+Z", action: "undo" },
    { keys: "Ctrl+Shift+Z / Ctrl+Y", action: "redo" },
    { keys: "Escape", action: "deselect everything — click a cell to start again" },
];

export default function HotkeyLegend() {
    return (
        <section className="hotkey-legend">
            <dl>
                {SHORTCUTS.map((s) => (
                    <div className="hk-row" key={s.keys}>
                        <dt>{s.keys}</dt>
                        <dd>{s.action}</dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}
