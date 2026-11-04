// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axe from "axe-core";

import AppRouter from "@/app/router.tsx";
import { miniSudoku } from "@/puzzles/mini_sudoku.ts";

beforeEach(() => {
    // axe measures icon ligatures on a canvas, which jsdom does not implement.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.stubGlobal("matchMedia", () => ({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
    }));
});

afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

/**
 * axe's rules about structure: names, roles, labels, landmarks, ids, ARIA use.
 * Its contrast rule is off, because jsdom has no layout and no cascade, so it cannot measure.
 * Contrast is covered by contrast.test.ts.
 */
const violations = async (container: HTMLElement) => {
    const result = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
};

const ROUTES: [string, string][] = [
    ["/", "Solve this puzzle"],
    ["/puzzles", "Puzzles"],
    ["/p/mini-sudoku", "Mini Sudoku (primitive-only)"],
    ["/new", "Author"],
    ["/settings", "Settings"],
    ["/ai", "AI disclaimer"],
    ["/nowhere", "Page not found"],
];

describe("axe on every page", () => {
    for (const [path, waitFor] of ROUTES) {
        it(path, async () => {
            const { container } = render(
                <MemoryRouter initialEntries={[path]}>
                    <AppRouter />
                </MemoryRouter>,
            );
            // Routes are lazy, so wait for the page to appear.
            await screen.findAllByText(waitFor, { exact: false }, { timeout: 5000 });
            expect(await violations(container)).toEqual([]);
        });
    }
});

describe("keyboard-only solve", () => {
    it("solves the mini sudoku with the arrow keys and digits alone", async () => {
        const { container } = render(
            <MemoryRouter initialEntries={["/p/mini-sudoku"]}>
                <AppRouter />
            </MemoryRouter>,
        );
        await screen.findByRole("button", { name: "Puzzle actions" });
        // The board has focus on load, so no pointer is needed from here.
        const board = container.querySelector<SVGElement>(".play .board")!;
        expect(document.activeElement).toBe(board);

        const solution = miniSudoku.solution as Record<string, number>;
        const given = miniSudoku.givens ?? {};
        const press = (key: string, code = key) => fireEvent.keyDown(board, { key, code });
        for (let row = 1; row <= 4; row++) {
            for (let col = 1; col <= 4; col++) {
                const cell = `r${row}c${col}`;
                if (!(cell in given)) press(String(solution[cell]), `Digit${solution[cell]}`);
                if (col < 4) press("ArrowRight");
            }
            if (row < 4) for (let i = 0; i < 3; i++) press("ArrowLeft");
            if (row < 4) press("ArrowDown");
        }
        expect(await screen.findByRole("dialog", { name: "Solved!" })).toBeTruthy();
    });
});
