// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import AppRouter from "@/app/router.tsx";

beforeEach(() => {
    // AppRouter renders useTheme(), which reads matchMedia — jsdom doesn't
    // implement it, same stub as use_theme.test.ts.
    vi.stubGlobal("matchMedia", () => ({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
    }));
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

/**
 * The board needs a *definite* height from .app/.app-main down to size its
 * SVG correctly (#77 follow-up) — this is driven by an explicit route-based
 * class rather than a CSS :has(.board-wrap) structural match, since :has()
 * silently no-ops (no error, just falls back to the plain centered layout)
 * wherever it isn't supported, and that failure mode is exactly what broke
 * the board's sizing once already.
 */
describe("AppRouter — board-route layout class", () => {
    it("adds app--board/app-main--board only on a puzzle route", () => {
        const { container } = render(
            <MemoryRouter initialEntries={["/p/demo-mixed"]}>
                <AppRouter />
            </MemoryRouter>,
        );
        expect(container.querySelector(".app.app--board")).not.toBeNull();
        expect(container.querySelector(".app-main.app-main--board")).not.toBeNull();
    });

    it("leaves the classes off the home route", () => {
        const { container } = render(
            <MemoryRouter initialEntries={["/"]}>
                <AppRouter />
            </MemoryRouter>,
        );
        expect(container.querySelector(".app.app--board")).toBeNull();
        expect(container.querySelector(".app-main.app-main--board")).toBeNull();
    });

    it("leaves the classes off the author route", () => {
        const { container } = render(
            <MemoryRouter initialEntries={["/new"]}>
                <AppRouter />
            </MemoryRouter>,
        );
        expect(container.querySelector(".app.app--board")).toBeNull();
        expect(container.querySelector(".app-main.app-main--board")).toBeNull();
    });
});
