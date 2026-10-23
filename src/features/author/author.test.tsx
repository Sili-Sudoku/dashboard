// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import Author from "@/features/author/index.tsx";

afterEach(() => {
    cleanup();
});

describe("Author", () => {
    it("re-validates on click and surfaces parse errors", () => {
        const { container } = render(
            <MemoryRouter>
                <Author />
            </MemoryRouter>,
        );
        expect(container.querySelector(".author-error")).toBeNull();

        const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
        fireEvent.change(textarea, { target: { value: "{ not json" } });
        expect(container.querySelector(".author-error")).toBeNull(); // not submitted yet

        fireEvent.click(screen.getByRole("button", { name: /validate.*preview/i }));
        expect(container.querySelector(".author-error")).not.toBeNull();
    });

    it("shows the actual resolved box size, not just what's in the JSON", () => {
        // demo_mixed is a 9x9 grid with no explicit boxWidth/boxHeight — the UI
        // should show the real sqrt-based default (3x3), not leave it blank.
        render(
            <MemoryRouter>
                <Author />
            </MemoryRouter>,
        );
        expect((screen.getByLabelText("Box width") as HTMLInputElement).value).toBe("3");
        expect((screen.getByLabelText("Box height") as HTMLInputElement).value).toBe("3");
    });

    it("editing a dimension input updates the JSON and the live preview", () => {
        const { container } = render(
            <MemoryRouter>
                <Author />
            </MemoryRouter>,
        );
        fireEvent.change(screen.getByLabelText("Width"), { target: { value: "6" } });

        const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
        const geometry = JSON.parse(textarea.value).geometry;
        expect(geometry.width).toBe(6);
        // box size is now written explicitly (pinned at its prior resolved value)
        // rather than left to silently re-resolve on the next compile.
        expect(geometry.boxWidth).toBe(3);
        expect((screen.getByLabelText("Box width") as HTMLInputElement).value).toBe("3");
    });

    it("changing box width drops the stale solution instead of erroring against it", () => {
        const { container } = render(
            <MemoryRouter>
                <Author />
            </MemoryRouter>,
        );
        fireEvent.change(screen.getByLabelText("Box width"), { target: { value: "4" } });

        const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
        const def = JSON.parse(textarea.value);
        expect(def.geometry.boxWidth).toBe(4);
        expect(def.solution).toBeUndefined();
        expect(container.querySelector(".author-error")).toBeNull();
    });

    it("changing width/height alone (box unchanged) keeps the solution", () => {
        const { container } = render(
            <MemoryRouter>
                <Author />
            </MemoryRouter>,
        );
        fireEvent.change(screen.getByLabelText("Height"), { target: { value: "12" } });

        const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
        const def = JSON.parse(textarea.value);
        expect(def.geometry.height).toBe(12);
        expect(def.solution).toBeDefined();
    });

    it("copy share link falls back to window.prompt when the Clipboard API is unavailable", async () => {
        const promptSpy = vi.spyOn(window, "prompt").mockImplementation(() => null);
        render(
            <MemoryRouter>
                <Author />
            </MemoryRouter>,
        );
        fireEvent.click(screen.getByRole("button", { name: /copy share link/i }));
        await vi.waitFor(() => expect(promptSpy).toHaveBeenCalled());
    });

    it("imports f-puzzles JSON pasted via the prompt fallback", async () => {
        const fpuzzles = JSON.stringify({
            size: 4,
            grid: Array.from({ length: 4 }, (_, r) =>
                Array.from({ length: 4 }, (_, c) => ({ region: Math.floor(r / 2) * 2 + Math.floor(c / 2) })),
            ),
            title: "Imported Test Puzzle",
        });
        vi.spyOn(window, "prompt").mockImplementation(() => fpuzzles);
        const { container } = render(
            <MemoryRouter>
                <Author />
            </MemoryRouter>,
        );
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /import from f-puzzles/i }));
        });
        const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
        expect(JSON.parse(textarea.value).metadata.title).toBe("Imported Test Puzzle");
    });

    it("imports a real f-puzzles.com share link pasted via the prompt fallback", async () => {
        const shareLink =
            "https://f-puzzles.com/?load=N4IgzglgXgpiBcA2ANCALhNAbO8QBUYw0ACABwFcoocRUBDCtACwHsAnBEAZQiwgDG9LHRABzdhAAmCANqzQAN2EVcAJlRiIimADsEadqoC+yJStwBGTdr0GjMU+ayqEAZhs798QybMhlF1wAFk87HwcnAIsEFHFbb19Hf0DXeABWMMTIgF1kBWighFD4r3s/ZzS4rTKIisK0zNLwpKjU9Szy5MqrTrruhtwPZuyTPIL2hCaalsiUmPgNEa62hZKZ0YHJ+Gtl/tWi+GGNlfnD6oSV8Z6EXZP9s7Tjy4ebpD7Wx9xpl8+3pfuf0GxQ+uXybwutSB23WvzmbzucPq22eUPhwIyoORCwBSMc1wxqNm2MOPzRJLSuPJWwWkOJNMOsOpBzSiOZOTyIHo7HYrAA7nJQPxdEQ5LIQAAlSwAYWCoglaml6XlbiVIA5qAEMCwWDAcklMrlOSiwtF8HkBulbnlirlqAlqqNnK1Or15st1uN/lNbotEuCsvl6UD9sQVvVzu1uv1/sDXqFEBFvvFset9uDaclYbUEc1Ud9koDnpNibNfsVmYd0pz9oDOY1IBd0fdCvD8ZAPrFksVNclqss8oDA4bTYLrfrxmNQA=";
        vi.spyOn(window, "prompt").mockImplementation(() => shareLink);
        const { container } = render(
            <MemoryRouter>
                <Author />
            </MemoryRouter>,
        );
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /import from f-puzzles/i }));
        });
        const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
        const imported = JSON.parse(textarea.value);
        expect(imported.metadata.title).toBe("Test puzzle");
        expect(imported.metadata.author).toBe("Silical");
        expect(container.querySelector(".author-error")).toBeNull();
    });

    it("shows an import error inline instead of throwing on malformed input", async () => {
        vi.spyOn(window, "prompt").mockImplementation(() => "not json");
        const { container } = render(
            <MemoryRouter>
                <Author />
            </MemoryRouter>,
        );
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /import from f-puzzles/i }));
        });
        expect(container.querySelector(".author-notice")?.textContent).toMatch(/import failed/i);
    });

    it("exports to f-puzzles, copying a share link (or falling back to prompt)", async () => {
        const promptSpy = vi.spyOn(window, "prompt").mockImplementation(() => null);
        const { container } = render(
            <MemoryRouter>
                <Author />
            </MemoryRouter>,
        );
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /export to f-puzzles/i }));
        });
        expect(promptSpy).toHaveBeenCalledWith(
            "f-puzzles share link:",
            expect.stringMatching(/^https:\/\/f-puzzles\.com\/\?load=/),
        );
        expect(container.querySelector(".author-notice")?.textContent).toMatch(/copied/i);
    });

    it("imports SudokuMaker JSON pasted via the prompt fallback", async () => {
        const sudokumaker = JSON.stringify({
            formatVersion: "1.6.0",
            puzzle: {
                name: "Imported SM Puzzle",
                type: "custom",
                width: 4,
                height: 4,
                minDigit: 1,
                maxDigit: 4,
                cells: Array.from({ length: 16 }, () => ({})),
                constraints: [
                    { type: 0 },
                    {
                        type: 1,
                        regions: Array.from({ length: 16 }, (_, i) =>
                            Math.floor(Math.floor(i / 4) / 2) * 2 + Math.floor((i % 4) / 2),
                        ),
                    },
                ],
            },
        });
        vi.spyOn(window, "prompt").mockImplementation(() => sudokumaker);
        const { container } = render(
            <MemoryRouter>
                <Author />
            </MemoryRouter>,
        );
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /import from sudokumaker/i }));
        });
        const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
        expect(JSON.parse(textarea.value).metadata.title).toBe("Imported SM Puzzle");
    });

    it("imports a real dev.sudokumaker.app share link pasted via the prompt fallback", async () => {
        const shareLink =
            "https://dev.sudokumaker.app/?puzzle=DpZHNCoMwEITfZc5B_LfkQXopHoJsraCJxChUybsX13Nt2vLtYZlhZ2F3w93YQbkr2akzGhJJVEYxBMZ5XXuC3KDVQJCAgJrdw9ijb6jvJ8jb5sVfhbZbSEM6O5PAovqZIJN3RvlVTHVuF4Ex6bmdB8Zkv93i85g_r1qgMXpyVnXa8cvgniNBxvvKo00ELLWd0bsfi52ESZkQJWNypmBClJKpmAsToNS-9v4F";
        vi.spyOn(window, "prompt").mockImplementation(() => shareLink);
        const { container } = render(
            <MemoryRouter>
                <Author />
            </MemoryRouter>,
        );
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /import from sudokumaker/i }));
        });
        const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
        const imported = JSON.parse(textarea.value);
        expect(Object.keys(imported.givens ?? {})).toHaveLength(8);
        expect(container.querySelector(".author-error")).toBeNull();
    });

    it("shows a SudokuMaker import error inline instead of throwing on malformed input", async () => {
        vi.spyOn(window, "prompt").mockImplementation(() => "not json");
        const { container } = render(
            <MemoryRouter>
                <Author />
            </MemoryRouter>,
        );
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /import from sudokumaker/i }));
        });
        expect(container.querySelector(".author-notice")?.textContent).toMatch(/import failed/i);
    });

    it("exports to SudokuMaker, copying a share link (or falling back to prompt)", async () => {
        const promptSpy = vi.spyOn(window, "prompt").mockImplementation(() => null);
        const { container } = render(
            <MemoryRouter>
                <Author />
            </MemoryRouter>,
        );
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /export to sudokumaker/i }));
        });
        expect(promptSpy).toHaveBeenCalledWith(
            "SudokuMaker share link:",
            expect.stringMatching(/^https:\/\/sudokumaker\.app\/\?puzzle=D/),
        );
        expect(container.querySelector(".author-notice")?.textContent).toMatch(/copied/i);
    });
});
