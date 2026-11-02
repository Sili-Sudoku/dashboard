import { useInstall } from "@/app/pwa.ts";
import { useSettings } from "@/app/use_settings.ts";
import { DEFAULT_MARK_COLORS } from "@/runtime/mark_colors.ts";

import "./style.css";

export default function Settings() {
    const [settings, setSetting] = useSettings();
    const install = useInstall();

    return (
        <div className="settings-page">
            <h1>Settings</h1>
            <p className="settings-intro">Preferences persist on this device and apply to every puzzle.</p>

            <section className="settings-list">
                <label className="settings-row">
                    <div>
                        <div className="settings-row-title">Check notes on leave</div>
                        <div className="settings-row-desc">
                            When you move off a cell, flag it in red if its remaining centre notes no longer include the
                            correct digit.
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

                <div className="settings-row settings-row-static">
                    <div>
                        <div className="settings-row-title">Mark colors</div>
                        <div className="settings-row-desc">
                            The palette for Color mode on the number pad. Press 1-9 in Color mode to paint with the
                            matching color, or 0 for the board background (always the paper color, so it isn't
                            editable); a cell can hold several, e.g. color 1 plus background. Changing a color recolors
                            cells already marked with it.
                        </div>
                        <div className="settings-palette">
                            {settings.markColors.map((color, i) => (
                                <input
                                    key={i}
                                    type="color"
                                    value={color}
                                    aria-label={`Color ${i + 1}`}
                                    onChange={(e) =>
                                        setSetting(
                                            "markColors",
                                            settings.markColors.map((c, j) => (j === i ? e.target.value : c)),
                                        )
                                    }
                                />
                            ))}
                        </div>
                        <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => setSetting("markColors", DEFAULT_MARK_COLORS)}
                        >
                            Reset colors
                        </button>
                    </div>
                </div>

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

                {install && (
                    <div className="settings-row settings-row-static">
                        <div>
                            <div className="settings-row-title">Install app</div>
                            <div className="settings-row-desc">
                                Add this to your device as its own app. It opens without the browser bar and works
                                offline.
                            </div>
                        </div>
                        <button type="button" className="btn btn-sm" onClick={install}>
                            Install
                        </button>
                    </div>
                )}
            </section>
        </div>
    );
}
