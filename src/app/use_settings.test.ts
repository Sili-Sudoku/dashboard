// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { getSettings, useSettings } from "@/app/use_settings.ts";
import { DEFAULT_MARK_COLORS, sanitizePalette } from "@/runtime/mark_colors.ts";
import { SETTINGS_FORMAT, decodeSaved } from "@/runtime/saved.ts";

afterEach(() => {
    localStorage.clear();
});

describe("useSettings", () => {
    it("defaults preferences to off (except same-value highlighting, which is on), and remembered view state to the original layout", () => {
        expect(getSettings()).toEqual({
            checkNotesOnLeave: false,
            highlightSameValue: true,
            markColors: DEFAULT_MARK_COLORS,
            zoomLocked: false,
            dockControlsBottom: false,
            constraintPanelOpen: true,
            hotkeyLegendOpen: false,
            authorEditorMode: "json",
            builderTools: [],
        });
    });

    it("persists a change to localStorage and reflects it back", () => {
        const { result } = renderHook(() => useSettings());
        act(() => result.current[1]("zoomLocked", true));

        expect(result.current[0].zoomLocked).toBe(true);
        expect(getSettings().zoomLocked).toBe(true);
        expect(decodeSaved(localStorage.getItem("cpr:settings") ?? "{}", SETTINGS_FORMAT)).toMatchObject({
            zoomLocked: true,
        });
    });

    it("remembers panel and editor-mode state across a remount", () => {
        const first = renderHook(() => useSettings());
        act(() => {
            first.result.current[1]("constraintPanelOpen", false);
            first.result.current[1]("authorEditorMode", "visual");
        });
        first.unmount();

        const second = renderHook(() => useSettings());
        expect(second.result.current[0].constraintPanelOpen).toBe(false);
        expect(second.result.current[0].authorEditorMode).toBe("visual");
        expect(second.result.current[0].hotkeyLegendOpen).toBe(false);
    });

    it("reads settings that an older release saved without a version", () => {
        localStorage.setItem("cpr:settings", JSON.stringify({ zoomLocked: true, checkNotesOnLeave: true }));
        expect(getSettings()).toMatchObject({ zoomLocked: true, checkNotesOnLeave: true });
    });

    it("uses the defaults for settings that a newer release saved", () => {
        localStorage.setItem("cpr:settings", JSON.stringify({ v: 99, data: { zoomLocked: true } }));
        expect(getSettings().zoomLocked).toBe(false);
    });

    it("syncs independent hook instances through the same store", () => {
        const a = renderHook(() => useSettings());
        const b = renderHook(() => useSettings());

        act(() => a.result.current[1]("checkNotesOnLeave", true));

        expect(a.result.current[0].checkNotesOnLeave).toBe(true);
        expect(b.result.current[0].checkNotesOnLeave).toBe(true);
    });

    it("persists a customised mark palette", () => {
        const custom = [...DEFAULT_MARK_COLORS];
        custom[0] = "#123456";
        const { result } = renderHook(() => useSettings());
        act(() => result.current[1]("markColors", custom));
        expect(getSettings().markColors[0]).toBe("#123456");
    });

    it("falls back to the default palette when the stored one is malformed", () => {
        localStorage.setItem("cpr:settings", JSON.stringify({ markColors: ["red", "blue"] }));
        expect(getSettings().markColors).toEqual(DEFAULT_MARK_COLORS);
        expect(sanitizePalette([...DEFAULT_MARK_COLORS.slice(1), "nope"])).toEqual(DEFAULT_MARK_COLORS);
    });
});
