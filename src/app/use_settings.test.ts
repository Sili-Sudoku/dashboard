// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { getSettings, useSettings } from "@/app/use_settings.ts";

afterEach(() => {
    localStorage.clear();
});

describe("useSettings", () => {
    it("defaults every preference to off", () => {
        expect(getSettings()).toEqual({ checkNotesOnLeave: false, zoomLocked: false });
    });

    it("persists a change to localStorage and reflects it back", () => {
        const { result } = renderHook(() => useSettings());
        act(() => result.current[1]("zoomLocked", true));

        expect(result.current[0].zoomLocked).toBe(true);
        expect(getSettings().zoomLocked).toBe(true);
        expect(JSON.parse(localStorage.getItem("cpr:settings") ?? "{}")).toEqual({
            checkNotesOnLeave: false,
            zoomLocked: true,
        });
    });

    it("syncs independent hook instances through the same store", () => {
        const a = renderHook(() => useSettings());
        const b = renderHook(() => useSettings());

        act(() => a.result.current[1]("checkNotesOnLeave", true));

        expect(a.result.current[0].checkNotesOnLeave).toBe(true);
        expect(b.result.current[0].checkNotesOnLeave).toBe(true);
    });
});
