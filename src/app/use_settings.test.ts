// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { getSettings, useSettings } from "@/app/use_settings.ts";

afterEach(() => {
    localStorage.clear();
});

describe("useSettings", () => {
    it("defaults every preference to off, and remembered view state to the original layout", () => {
        expect(getSettings()).toEqual({
            checkNotesOnLeave: false,
            zoomLocked: false,
            constraintPanelOpen: false,
            hotkeyLegendOpen: false,
            authorEditorMode: "json",
        });
    });

    it("persists a change to localStorage and reflects it back", () => {
        const { result } = renderHook(() => useSettings());
        act(() => result.current[1]("zoomLocked", true));

        expect(result.current[0].zoomLocked).toBe(true);
        expect(getSettings().zoomLocked).toBe(true);
        expect(JSON.parse(localStorage.getItem("cpr:settings") ?? "{}")).toMatchObject({ zoomLocked: true });
    });

    it("remembers panel and editor-mode state across a remount (#125)", () => {
        const first = renderHook(() => useSettings());
        act(() => {
            first.result.current[1]("constraintPanelOpen", true);
            first.result.current[1]("authorEditorMode", "visual");
        });
        first.unmount();

        const second = renderHook(() => useSettings());
        expect(second.result.current[0].constraintPanelOpen).toBe(true);
        expect(second.result.current[0].authorEditorMode).toBe("visual");
        expect(second.result.current[0].hotkeyLegendOpen).toBe(false);
    });

    it("syncs independent hook instances through the same store", () => {
        const a = renderHook(() => useSettings());
        const b = renderHook(() => useSettings());

        act(() => a.result.current[1]("checkNotesOnLeave", true));

        expect(a.result.current[0].checkNotesOnLeave).toBe(true);
        expect(b.result.current[0].checkNotesOnLeave).toBe(true);
    });
});
