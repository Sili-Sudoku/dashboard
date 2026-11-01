import { useSettings } from "@/app/use_settings.ts";

import "./style.css";

export default function Settings() {
    const [settings, setSetting] = useSettings();

    return (
        <div className="settings-page">
            <h1>Settings</h1>
            <p className="settings-intro">Preferences persist on this device and apply to every puzzle.</p>

            <section className="settings-list">
                <label className="settings-row">
                    <div>
                        <div className="settings-row-title">Check notes on leave</div>
                        <div className="settings-row-desc">
                            When you move off a cell, flag it in red if its remaining centre notes no longer
                            include the correct digit.
                        </div>
                    </div>
                    <input
                        type="checkbox"
                        checked={settings.checkNotesOnLeave}
                        onChange={(e) => setSetting("checkNotesOnLeave", e.target.checked)}
                    />
                </label>

                <label className="settings-row">
                    <div>
                        <div className="settings-row-title">Highlight matching numbers</div>
                        <div className="settings-row-desc">
                            Tint every other cell holding the same digit as the cell you're on.
                        </div>
                    </div>
                    <input
                        type="checkbox"
                        checked={settings.highlightSameValue}
                        onChange={(e) => setSetting("highlightSameValue", e.target.checked)}
                    />
                </label>

                <label className="settings-row">
                    <div>
                        <div className="settings-row-title">Lock zoom by default</div>
                        <div className="settings-row-desc">
                            Start every board with the zoom/pan toolbar locked, ignoring wheel, pinch, and the
                            fit-to-screen button until unlocked.
                        </div>
                    </div>
                    <input
                        type="checkbox"
                        checked={settings.zoomLocked}
                        onChange={(e) => setSetting("zoomLocked", e.target.checked)}
                    />
                </label>
            </section>
        </div>
    );
}
