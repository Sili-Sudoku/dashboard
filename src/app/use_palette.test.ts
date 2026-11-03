// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";

import indexHtml from "../../index.html?raw";
import { PALETTES, usePalette } from "@/app/use_palette.ts";

describe("usePalette", () => {
    beforeEach(() => {
        localStorage.clear();
        document.documentElement.removeAttribute("data-palette");
    });

    it("starts as coffee & cream, with no attribute", () => {
        const { result } = renderHook(() => usePalette());
        expect(result.current[0]).toBe("coffee");
        expect(document.documentElement.hasAttribute("data-palette")).toBe(false);
    });

    it("sets the attribute and saves the choice, and removes the attribute for the default", () => {
        const { result } = renderHook(() => usePalette());
        act(() => result.current[1]("classic"));
        expect(document.documentElement.getAttribute("data-palette")).toBe("classic");
        expect(localStorage.getItem("cpr:palette")).toBe("classic");

        act(() => result.current[1]("coffee"));
        expect(document.documentElement.hasAttribute("data-palette")).toBe(false);
    });

    it("reads a saved choice, and ignores an unknown value", () => {
        localStorage.setItem("cpr:palette", "classic");
        expect(renderHook(() => usePalette()).result.current[0]).toBe("classic");
        localStorage.setItem("cpr:palette", "neon");
        expect(renderHook(() => usePalette()).result.current[0]).toBe("coffee");
    });

    it("has the same palettes in the pre-paint script of index.html", () => {
        const listed = /\/\^\(([a-z|]+)\)\$\/\.test\(palette\)/.exec(indexHtml)?.[1].split("|");
        expect(listed?.sort()).toEqual(
            PALETTES.map((p) => p.id)
                .filter((id) => id !== "coffee")
                .sort(),
        );
    });
});
