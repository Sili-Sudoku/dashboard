import { useEffect, useState } from "react";

import { DEFAULT_MARK_COLORS, sanitizePalette } from "@/runtime/mark_colors.ts";

/**
 * The shared home for player preferences (#69) — one localStorage blob
 * instead of each toggle (check-notes-on-leave, zoom-lock, ...) inventing its
 * own bolted-on, non-persistent state. New preferences add a key here and a
 * control on the Settings page; they don't need their own storage story.
 */
export interface Settings {
    /** PuzzlePlayer: flag a cell red on cursor-leave if its remaining centre notes no longer include the solution digit. */
    checkNotesOnLeave: boolean;
    /** Colour-marking palette (#35): one #rrggbb per slot, shared by every puzzle. */
    markColors: readonly string[];
    /** Board: wash every cell matching the cursor cell's value (#73). */
    highlightSameValue: boolean;
    /** Board: keep the zoom/pan toolbar's lock engaged (ignore wheel/pinch/fit) across puzzles and reloads. */
    zoomLocked: boolean;
    /* Remembered view state (#125): where the user left these open/closed. Not
     * preferences to configure, so — unlike the two above — no Settings-page
     * control. Deliberately NOT remembered: input mode (a note mode carried
     * over from last puzzle would surprise), zoom/pan position, show-solution,
     * JSON view — those are per-session by nature. */
    constraintPanelOpen: boolean;
    hotkeyLegendOpen: boolean;
    authorEditorMode: "json" | "visual";
}

const DEFAULT_SETTINGS: Settings = {
    checkNotesOnLeave: false,
    highlightSameValue: true,
    markColors: DEFAULT_MARK_COLORS,
    zoomLocked: false,
    constraintPanelOpen: false,
    hotkeyLegendOpen: false,
    authorEditorMode: "json",
};

const SETTINGS_KEY = "cpr:settings";

const listeners = new Set<() => void>();

/** No module-level cache (unlike a tempting memoized version of this) — reads
 *  straight from localStorage every call, same as `use_theme.ts`'s
 *  `readStoredTheme`. The blob is tiny and this is only called on session
 *  construction and on settings change, so there's no real cost, and it
 *  avoids a second source of truth that tests would need to reset between
 *  runs. */
export const getSettings = (): Settings => {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (!raw) return DEFAULT_SETTINGS;
        const stored = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
        // A hand-edited or older blob must never hand the board a malformed palette.
        return { ...stored, markColors: sanitizePalette(stored.markColors) };
    } catch {
        return DEFAULT_SETTINGS;
    }
};

const writeSettings = (next: Settings): void => {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
        // storage unavailable (private mode etc.) — choice just isn't persisted
    }
    for (const listener of listeners) listener();
};

/**
 * Reactive settings for components — subscribes to a module-level store
 * (not React context) so independent consumers (the Settings page, Board's
 * zoom toolbar, PuzzlePlayer) all see the same value without a provider.
 */
export const useSettings = (): readonly [Settings, <K extends keyof Settings>(key: K, value: Settings[K]) => void] => {
    const [settings, setSettings] = useState(getSettings);

    useEffect(() => {
        const listener = () => setSettings(getSettings());
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    }, []);

    const setSetting = <K extends keyof Settings>(key: K, value: Settings[K]): void => {
        writeSettings({ ...getSettings(), [key]: value });
    };

    return [settings, setSetting] as const;
};
