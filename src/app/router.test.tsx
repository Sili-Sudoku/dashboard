// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import AppRouter from "@/app/router.tsx";
import { encodePuzzle } from "@/runtime/serialization.ts";
import { miniSudoku } from "@/puzzles/mini_sudoku.ts";

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
 * The board needs a *definite* height from .app/.app-main down, to size its SVG correctly.
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

    it("lets the gear close the settings page", () => {
        at("/settings");
        fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
        expect(document.title).toBe("Constraint Puzzle Runtime");
        expect(screen.getByRole("link", { name: "Settings" })).toBeTruthy();
    });

    it("shows a loader while a lazy page loads", () => {
        at("/settings");
        expect(screen.getByRole("status").textContent).toContain("Loading");
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

describe("AppRouter — skip link", () => {
    it("is the first focusable element, and moves focus to the main region without changing the route", () => {
        const { container } = render(
            <MemoryRouter initialEntries={["/puzzles"]}>
                <AppRouter />
            </MemoryRouter>,
        );
        const link = container.querySelector<HTMLAnchorElement>("a.skip-link");
        expect(link?.textContent).toBe("Skip to content");
        expect(container.querySelector("a, button, [tabindex='0']")).toBe(link);
        fireEvent.click(link as HTMLElement);
        expect(document.activeElement).toBe(container.querySelector("main#main"));
    });
});

describe("AppRouter — the byline of a puzzle with a source", () => {
    const route = (source?: string) =>
        `/p/${encodePuzzle({ ...miniSudoku, metadata: { ...miniSudoku.metadata, author: "Ada", ...(source ? { source } : {}) } })}`;

    const open = (path: string) =>
        render(
            <MemoryRouter initialEntries={[path]}>
                <AppRouter />
            </MemoryRouter>,
        );

    it("is a link-like button that asks before leaving", async () => {
        const win = vi.spyOn(window, "open").mockImplementation(() => null);
        open(route("https://example.com/p/1"));
        const byline = await screen.findByRole("button", { name: "by Ada" });
        expect(byline.classList.contains("app-header-byline-link")).toBe(true);
        fireEvent.click(byline);
        expect(screen.getByRole("dialog", { name: /be careful with this link/i }).textContent).toContain(
            "https://example.com/p/1",
        );
        expect(win).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Open link" }));
        expect(win).toHaveBeenCalledWith("https://example.com/p/1", "_blank", "noopener,noreferrer");
        win.mockRestore();
    });

    it("is plain text when the puzzle has no source", async () => {
        open(route());
        const byline = await screen.findByText("by Ada");
        expect(byline.tagName).toBe("SPAN");
        expect(screen.queryByRole("button", { name: "by Ada" })).toBeNull();
    });
});

describe("AppRouter — AI disclaimer", () => {
    it("links to the disclaimer page from the landing footer", async () => {
        render(
            <MemoryRouter initialEntries={["/"]}>
                <AppRouter />
            </MemoryRouter>,
        );
        fireEvent.click(await screen.findByRole("link", { name: "AI disclaimer" }));
        expect(await screen.findByRole("heading", { name: "AI disclaimer" })).toBeTruthy();
        expect(screen.getByText(/never generate puzzles or art/)).toBeTruthy();
    });
});
