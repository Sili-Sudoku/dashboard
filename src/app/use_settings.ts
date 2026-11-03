import { useEffect, useState } from "react";

import { DEFAULT_MARK_COLORS, sanitizePalette } from "@/runtime/mark_colors.ts";
import { SETTINGS_FORMAT, decodeSaved, encodeSaved } from "@/runtime/saved.ts";

/**
 * The shared place for player preferences. It is one localStorage blob.
 * Each toggle (check-notes-on-leave, zoom-lock, ...) does not need its own non-persistent state.
 * A new preference adds a key here and a control on the Settings page.
 * It does not need its own storage.
 */
/** The left-pane tabs of the Author page.
 *  They are raw JSON, the drag-and-drop builder, or the read-only PuzzleBuilder code sample. */
export type EditorMode = "json" | "visual" | "code";

export interface Settings {
    /** PuzzlePlayer: flag a cell red when the cursor leaves it,
     *  if its remaining centre notes do not include the solution digit. */
    checkNotesOnLeave: boolean;
    /** Colour-marking palette: one #rrggbb for each slot, shared by all puzzles. */
    markColors: readonly string[];
    /** Board: highlight all cells that match the value of the cursor cell. */
    highlightSameValue: boolean;
    /** Board: keep the lock of the zoom/pan toolbar engaged (ignore wheel/pinch/fit) across puzzles and reloads. */
    zoomLocked: boolean;
    /** Player: put the side panel (number pad and controls) at the bottom of the window, not the top. */
    dockControlsBottom: boolean;
    /* Remembered view state: the open or closed state that the user left.
     * These are not preferences to configure. Unlike the two above, they have no Settings-page control.
     * These are NOT remembered on purpose: input mode, zoom/pan position, show-solution, and JSON view.
     * They are per-session by nature.
     * A note mode that carries over from the last puzzle would surprise the user. */
    constraintPanelOpen: boolean;
    hotkeyLegendOpen: boolean;
    authorEditorMode: EditorMode;
    /** Visual builder: names of the tools that the author pinned to quick access.
     *  The other tools are behind "Add tool". */
    builderTools: readonly string[];
}

const DEFAULT_SETTINGS: Settings = {
    checkNotesOnLeave: false,
    highlightSameValue: true,
    markColors: DEFAULT_MARK_COLORS,
    zoomLocked: false,
    dockControlsBottom: false,
    constraintPanelOpen: true,
    hotkeyLegendOpen: false,
    authorEditorMode: "json",
    builderTools: [],
};

const SETTINGS_KEY = "cpr:settings";

const listeners = new Set<() => void>();

/** There is no module-level cache. Each call reads from localStorage, like `readStoredTheme` in `use_theme.ts`.
 *  The blob is small. The function runs only on session construction and on a settings change, so the cost is low.
 *  No cache means no second source of truth that tests must reset between runs. */
export const getSettings = (): Settings => {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (!raw) return DEFAULT_SETTINGS;
        const saved = decodeSaved(raw, SETTINGS_FORMAT);
        if (typeof saved !== "object" || saved === null) return DEFAULT_SETTINGS;
        const stored = { ...DEFAULT_SETTINGS, ...(saved as Partial<Settings>) };
        // A hand-edited or older blob must never give the board a malformed palette.
        const tools: unknown = stored.builderTools;
        return {
            ...stored,
            markColors: sanitizePalette(stored.markColors),
            builderTools: Array.isArray(tools) ? tools.filter((t): t is string => typeof t === "string") : [],
        };
    } catch {
        return DEFAULT_SETTINGS;
    }
};

const writeSettings = (next: Settings): void => {
    try {
        localStorage.setItem(SETTINGS_KEY, encodeSaved(next, SETTINGS_FORMAT));
    } catch {
        // Storage is unavailable (private mode and others). The choice is not persisted.
    }
    for (const listener of listeners) listener();
};

/**
 * Reactive settings for components. The hook subscribes to a module-level store, not React context.
 * Independent consumers (the Settings page, the zoom toolbar of Board, PuzzlePlayer) see the same value.
 * They do not need a provider.
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
