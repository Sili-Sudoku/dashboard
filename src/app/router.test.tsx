// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import AppRouter from "@/app/router.tsx";

beforeEach(() => {
    // AppRouter renders useTheme(), which reads matchMedia.
    // jsdom does not implement matchMedia. This is the same stub as in use_theme.test.ts.
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
 * The board needs a *definite* height from .app/.app-main down, to size its SVG correctly (#77 follow-up).
 * An explicit class that depends on the route gives this height.
 * A CSS :has(.board-wrap) structural match is not used.
 * Where :has() is not supported, it does nothing and gives no error.
 * The layout then falls back to the plain centered layout.
 * That failure already broke the board sizing once.
 * Author also embeds a live preview board (next to the JSON editor), so it has the same treatment as Play.
 * Only Home is a plain centered page.
 */
describe("AppRouter — board-route layout class", () => {
    it("adds app--board/app-main--board on a puzzle route", () => {
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

    it("renders a not-found page for an unknown path", () => {
        const { container } = render(
            <MemoryRouter initialEntries={["/nope"]}>
                <AppRouter />
            </MemoryRouter>,
        );
        expect(container.querySelector(".error-page h1")?.textContent).toBe("Page not found");
    });

    it("also adds the classes on the author route, which embeds a live preview board", () => {
        const { container } = render(
            <MemoryRouter initialEntries={["/new"]}>
                <AppRouter />
            </MemoryRouter>,
        );
        expect(container.querySelector(".app.app--board")).not.toBeNull();
        expect(container.querySelector(".app-main.app-main--board")).not.toBeNull();
    });
});

describe("AppRouter — document title", () => {
    const at = (path: string) =>
        render(
            <MemoryRouter initialEntries={[path]}>
                <AppRouter />
            </MemoryRouter>,
        );

    it("uses the bare app title on the home route", () => {
        at("/");
        expect(document.title).toBe("Constraint Puzzle Runtime");
    });

    it("prefixes the route's name on pages without their own header", () => {
        at("/settings");
        expect(document.title).toBe("Settings · Constraint Puzzle Runtime");
    });

    it("names the not-found page", () => {
        at("/nope");
        expect(document.title).toBe("Page not found · Constraint Puzzle Runtime");
    });

    it("uses the title a page registers via usePageHeader (the author page's)", () => {
        at("/new");
        expect(document.title).toBe("Author a puzzle · Constraint Puzzle Runtime");
    });
});
