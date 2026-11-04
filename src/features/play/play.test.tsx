// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import Play from "@/features/play/index.tsx";
import { clearToasts, getToasts } from "@/app/toast.ts";

const openMenuItem = (name: RegExp) => {
    fireEvent.click(screen.getByRole("button", { name: "Puzzle actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name }));
};

const renderAt = (path: string) =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="/p/:ref" element={<Play />} />
            </Routes>
        </MemoryRouter>,
    );

afterEach(() => {
    cleanup();
    localStorage.clear();
});

describe("Play — JSON viewer", () => {
    it("toggles a JSON panel showing the authored artifact", () => {
        const { container } = renderAt("/p/whisper-line");
        expect(container.querySelector(".play-json")).toBeNull();

        openMenuItem(/view json/i);

        const panel = container.querySelector(".play-json") as HTMLElement;
        const pre = within(panel).getByText(/"metadata"/, { selector: "pre" });
        expect(pre.textContent).toContain('"id": "whisper-line"');
        // the whisper rule shows as primitive expressions, not as a definition ref
        expect(pre.textContent).toContain('"or"');
        expect(pre.textContent).not.toContain('"use": "whispers"');
    });

    it("switches to the compiled view where constraints carry a source", () => {
        const { container } = renderAt("/p/whisper-line");
        openMenuItem(/view json/i);
        fireEvent.click(screen.getByRole("button", { name: /compiled/i }));

        const pre = container.querySelector(".play-json pre") as HTMLElement;
        expect(pre.textContent).toContain('"source": "German whispers"');
        expect(pre.textContent).toContain('"source": "sudoku"');
    });

    it("closes the panel again", () => {
        const { container } = renderAt("/p/mini-sudoku");
        openMenuItem(/view json/i);
        expect(container.querySelector(".play-json")).not.toBeNull();
        openMenuItem(/hide json/i);
        expect(container.querySelector(".play-json")).toBeNull();
    });
});

describe("Play — a puzzle that cannot be opened", () => {
    it("shows a plain message, keeps the raw error behind Details, and links back", () => {
        renderAt("/p/not-a-real-puzzle");
        expect(screen.getByRole("heading", { name: /could not be opened/i })).toBeTruthy();
        const details = screen.getByText("Details").closest("details") as HTMLDetailsElement;
        expect(details.open).toBe(false);
        expect(details.textContent).toMatch(/codec/i);
        expect(screen.getByRole("link", { name: /browse puzzles/i }).getAttribute("href")).toBe("/puzzles");
    });
});

describe("Play — keyboard access", () => {
    it("focuses the board on load, so digits work without a click", () => {
        const { container } = renderAt("/p/whisper-line");
        expect(document.activeElement).toBe(container.querySelector(".board"));
    });
});

describe("Play — first-visit hint", () => {
    afterEach(() => clearToasts());

    it("shows the hint once, then never again on this device", () => {
        renderAt("/p/whisper-line");
        expect(getToasts().map((t) => t.key)).toContain("play-hint");

        clearToasts();
        cleanup();
        renderAt("/p/whisper-line");
        expect(getToasts().map((t) => t.key)).not.toContain("play-hint");
    });
});
