import { useEffect, useState } from "react";

/**
 * The shared home for player preferences (#69) — one localStorage blob
 * instead of each toggle (check-notes-on-leave, zoom-lock, ...) inventing its
 * own bolted-on, non-persistent state. New preferences add a key here and a
 * control on the Settings page; they don't need their own storage story.
 */
export interface Settings {
    /** PuzzlePlayer: flag a cell red on cursor-leave if its remaining centre notes no longer include the solution digit. */
    checkNotesOnLeave: boolean;
    /** Board: keep the zoom/pan toolbar's lock engaged (ignore wheel/pinch/fit) across puzzles and reloads. */
    zoomLocked: boolean;
}

const DEFAULT_SETTINGS: Settings = {
    checkNotesOnLeave: false,
    zoomLocked: false,
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
        return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
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
