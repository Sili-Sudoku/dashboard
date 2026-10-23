// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useTheme } from "@/app/use_theme.ts";

const mockMatchMedia = (matches: boolean) => {
    const listeners = new Set<() => void>();
    const mql = {
        matches,
        addEventListener: (_: string, cb: () => void) => listeners.add(cb),
        removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    };
    vi.stubGlobal("matchMedia", () => mql);
    return {
        fireChange: (next: boolean) => {
            mql.matches = next;
            for (const cb of listeners) cb();
        },
    };
};

describe("useTheme", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("defaults to the OS preference when the player hasn't chosen explicitly", () => {
        mockMatchMedia(true);
        const { result } = renderHook(() => useTheme());
        expect(result.current.theme).toBe("dark");
    });

    it("toggling sets the attribute, persists to localStorage, and stops following the OS", () => {
        const { fireChange } = mockMatchMedia(false);
        const { result } = renderHook(() => useTheme());
        expect(result.current.theme).toBe("light");

        act(() => result.current.toggleTheme());
        expect(result.current.theme).toBe("dark");
        expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
        expect(localStorage.getItem("cpr:theme")).toBe("dark");

        act(() => fireChange(true));
        expect(result.current.theme).toBe("dark");
    });

    it("follows a live OS preference change until the player makes an explicit choice", () => {
        const { fireChange } = mockMatchMedia(false);
        const { result } = renderHook(() => useTheme());
        expect(result.current.theme).toBe("light");

        act(() => fireChange(true));
        expect(result.current.theme).toBe("dark");
    });
});
