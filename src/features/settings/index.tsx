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
            <p className="settings-intro">The app saves settings on this device. They apply to every puzzle.</p>

            <section className="settings-list">
                <label className="settings-row">
                    <div>
                        <div className="settings-row-title">Check notes on leave</div>
                        <div className="settings-row-desc">
                            When you leave a cell, the app flags it in red if its center notes do not include the
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
                            Double-click a cell that has a digit to tint every cell with the same digit. The tint goes
                            away when you move to another cell.
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
                        <div className="settings-row-title">Dock the control panel at the bottom</div>
                        <div className="settings-row-desc">
                            Put the number pad and controls at the bottom of the window, not the top. This is
                            closer to your thumb on a tablet. On a narrow window, the panel is always below the board.
                        </div>
                    </div>
                    <input
                        type="checkbox"
                        checked={settings.dockControlsBottom}
                        onChange={(e) => setSetting("dockControlsBottom", e.target.checked)}
                    />
                </label>

                <div className="settings-row settings-row-static">
                    <div>
                        <div className="settings-row-title">Mark colors</div>
                        <div className="settings-row-desc">
                            The palette for Color mode on the number pad. Press 1-9 in Color mode to paint with the
                            matching color. Press 0 to paint the board background. The background is always the paper
                            color, so you cannot change it. A cell can have more than one color, for example color 1 and
                            the background. If you change a color, the cells that have it change too.
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
                            Start each board with the zoom toolbar locked. A locked toolbar ignores the wheel, pinch,
                            and fit-to-screen button until you unlock it.
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
                                Add this app to your device. It opens without the browser bar. It works offline.
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
