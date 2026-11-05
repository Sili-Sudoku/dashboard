// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import Play from "@/features/play/index.tsx";
import { clearToasts, getToasts } from "@/app/toast.ts";
import { encodePuzzle } from "@/runtime/serialization.ts";
import type { PuzzleDefinition } from "@/runtime/puzzle.ts";
import { miniSudoku } from "@/puzzles/mini_sudoku.ts";

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

describe("Play — source credit", () => {
    const withSource = (source?: string) =>
        `/p/${encodePuzzle({ ...miniSudoku, metadata: { ...miniSudoku.metadata, ...(source ? { source } : {}) } })}`;

    it("asks before leaving, shows the whole address, and opens it only after a yes", () => {
        const open = vi.spyOn(window, "open").mockImplementation(() => null);
        renderAt(withSource("https://www.example.com/puzzle/7?x=1"));
        openMenuItem(/original puzzle \(example\.com\)/i);

        const dialog = screen.getByRole("dialog", { name: /be careful with this link/i });
        expect(dialog.textContent).toContain("https://www.example.com/puzzle/7?x=1");
        expect(open).not.toHaveBeenCalled();

        fireEvent.click(within(dialog).getByRole("button", { name: "Open link" }));
        expect(open).toHaveBeenCalledWith("https://www.example.com/puzzle/7?x=1", "_blank", "noopener,noreferrer");
        expect(screen.queryByRole("dialog")).toBeNull();
        open.mockRestore();
    });

    it("opens nothing when the question is cancelled, by button or by Escape", () => {
        const open = vi.spyOn(window, "open").mockImplementation(() => null);
        renderAt(withSource("https://example.com/p"));
        openMenuItem(/original puzzle/i);
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(screen.queryByRole("dialog")).toBeNull();

        openMenuItem(/original puzzle/i);
        fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(open).not.toHaveBeenCalled();
        open.mockRestore();
    });

    it("puts the focus on Cancel, so Enter does not leave by accident", () => {
        renderAt(withSource("https://example.com/p"));
        openMenuItem(/original puzzle/i);
        expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
    });

    it("shows a long site name cut short in the menu, and in full in the question", () => {
        const host = "a-very-long-subdomain-name.another-long-label.example.com";
        renderAt(withSource(`https://${host}/x`));
        fireEvent.click(screen.getByRole("button", { name: "Puzzle actions" }));
        const item = screen.getByRole("menuitem", { name: /original puzzle/i });
        expect(item.textContent).not.toContain(host);
        expect(item.textContent).toContain("…");
        fireEvent.click(item);
        expect(screen.getByRole("dialog").textContent).toContain(host);
    });

    it("has no such menu item when the puzzle names no source", () => {
        renderAt(withSource());
        fireEvent.click(screen.getByRole("button", { name: "Puzzle actions" }));
        expect(screen.queryByRole("menuitem", { name: /original puzzle/i })).toBeNull();
    });

    it("ignores a source that is not https, even if it got past the loader", () => {
        renderAt(withSource("http://example.com/p"));
        // such a puzzle does not load at all: the error page shows instead of a board
        expect(screen.queryByRole("button", { name: "Puzzle actions" })).toBeNull();
    });
});

describe("Play — Check on a puzzle without a stored solution", () => {
    const withoutSolution = (givens: PuzzleDefinition["givens"]) => {
        const bare: PuzzleDefinition = { ...miniSudoku, givens };
        delete bare.solution;
        return bare;
    };

    it("finds the unique solution, so a shared link gets a working Check button", async () => {
        const all = { ...miniSudoku.solution };
        delete all[Object.keys(all)[0]];
        renderAt(`/p/${encodePuzzle(withoutSolution(all))}`);
        await waitFor(() =>
            expect((screen.getByRole("button", { name: /check/i }) as HTMLButtonElement).disabled).toBe(false),
        );
    });

    it("shows Check disabled when there is no single solution", async () => {
        renderAt(`/p/${encodePuzzle(withoutSolution({}))}`);
        const check = screen.getByRole("button", { name: /check/i }) as HTMLButtonElement;
        await new Promise((r) => setTimeout(r, 50));
        expect(check.disabled).toBe(true);
    });
});
