// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import Author from "@/features/author/index.tsx";
import { demoMixed } from "@/puzzles/index.ts";
import { ToastViewport } from "@/app/toast_viewport.tsx";
import { clearToasts } from "@/app/toast.ts";

afterEach(() => {
    cleanup();
    clearToasts();
    localStorage.clear(); // settings (editor mode, toolbox) are stored there
});

/** Opens an import dialog, fills its textarea, and submits.
 *  This is the in-app replacement for a paste into `window.prompt`. */
const openInteropItem = (name: RegExp) => {
    fireEvent.click(screen.getByRole("button", { name: /import \/ export/i }));
    fireEvent.click(screen.getByRole("menuitem", { name }));
};

const loadExample = (title: RegExp) => {
    fireEvent.click(screen.getByRole("button", { name: /load an example/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: title }));
};

const importViaDialog = (openButtonName: RegExp, dialogPlaceholder: RegExp, text: string) => {
    openInteropItem(openButtonName);
    fireEvent.change(screen.getByPlaceholderText(dialogPlaceholder), { target: { value: text } });
    fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
};

describe("Author", () => {
    it("surfaces parse errors live, with no click needed, and clears them once valid again", () => {
        const { container } = render(
            <MemoryRouter>
                <Author />
                <ToastViewport />
            </MemoryRouter>,
        );
        expect(container.querySelector(".author-error")).toBeNull();

        const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
        fireEvent.change(textarea, { target: { value: "{ not json" } });
        expect(container.querySelector(".author-error")).not.toBeNull();
        expect(textarea.className).toContain("invalid");

        fireEvent.change(textarea, { target: { value: JSON.stringify(demoMixed, null, 2) } });
        expect(container.querySelector(".author-error")).toBeNull();
        expect(textarea.className).not.toContain("invalid");
    });

    it("keeps showing the preview (with the offending constraint in red) when the declared solution conflicts with a constraint", () => {
        const { container } = render(
            <MemoryRouter>
                <Author />
                <ToastViewport />
            </MemoryRouter>,
        );
        const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
        const bad = {
            version: 1,
            metadata: { id: "bad-solution", title: "Bad solution" },
            geometry: { type: "grid", width: 4, height: 4 },
            domain: { values: [1, 2, 3, 4] },
            constraints: [{ use: "thermometer", cells: ["r1c1", "r1c2"] }],
            solution: { r1c1: 3, r1c2: 1 },
        };
        fireEvent.change(textarea, { target: { value: JSON.stringify(bad) } });

        // There is no blocking JSON error, and the board still renders.
        // A bad declared solution does not blank the whole preview.
        expect(container.querySelector(".author-error")).toBeNull();
        expect(screen.queryByText(/fix the errors on the left/i)).toBeNull();
        expect(container.querySelector("svg.board")).not.toBeNull();
        expect(container.querySelector(".author-conflict-tip")?.textContent).toMatch(
            /conflict with the declared solution/i,
        );
        expect(container.querySelector(".author-conflict-text")?.textContent).toMatch(/thermometer#1/);
    });

    it("offers a 'Show solution' toggle for a puzzle with a declared solution, filling it in without touching the real board", () => {
        const { container } = render(
            <MemoryRouter>
                <Author />
                <ToastViewport />
            </MemoryRouter>,
        );
        const toggle = screen.getByRole("button", { name: "Show solution" }) as HTMLButtonElement;
        const before = container.querySelectorAll(".digit").length;

        fireEvent.click(toggle);
        // The solution of demo_mixed is a full board. Every cell shows a digit.
        expect(container.querySelectorAll(".digit").length).toBe(81);

        fireEvent.click(toggle);
        expect(container.querySelectorAll(".digit").length).toBe(before);
    });

    it("'Test as solver' drops the author-only extras, and starts a fresh board each time", () => {
        const { container } = render(
            <MemoryRouter>
                <Author />
                <ToastViewport />
            </MemoryRouter>,
        );
        // Author view first: show the solution, so there is something to remove.
        fireEvent.click(screen.getByRole("button", { name: "Show solution" }));
        expect(container.querySelectorAll(".digit").length).toBe(81);

        // The bar is inside the player, so it shares the left edge of the grid.
        // The player remounts when the mode changes. So find the button again each time.
        const test = () => screen.getByRole("button", { name: "Test as solver" });
        expect(test().getAttribute("aria-pressed")).toBe("false");
        fireEvent.click(test());

        expect(test().getAttribute("aria-pressed")).toBe("true");
        expect(screen.queryByRole("button", { name: "Show solution" })).toBeNull();
        // The solution overlay is gone. Only the givens of the puzzle show.
        const givens = Object.keys(demoMixed.givens ?? {}).length;
        expect(container.querySelectorAll(".digit").length).toBe(givens);

        fireEvent.click(test());
        expect(test().getAttribute("aria-pressed")).toBe("false");
        expect(screen.getByRole("button", { name: "Show solution" })).toBeTruthy();
    });

    it("hides the 'Show solution' toggle for a puzzle with no declared solution", () => {
        const { container } = render(
            <MemoryRouter>
                <Author />
                <ToastViewport />
            </MemoryRouter>,
        );
        const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
        const noSolution = {
            version: 1,
            metadata: { id: "no-solution", title: "No solution" },
            geometry: { type: "grid", width: 4, height: 4 },
            domain: { values: [1, 2, 3, 4] },
            constraints: [],
        };
        fireEvent.change(textarea, { target: { value: JSON.stringify(noSolution) } });

        expect(screen.queryByRole("button", { name: "Show solution" })).toBeNull();
    });

    it("shows the actual resolved box size, not just what's in the JSON", () => {
        // demo_mixed is a 9x9 grid with no explicit boxWidth/boxHeight.
        // The UI must show the real sqrt-based default (3x3) and not leave the field blank.
        render(
            <MemoryRouter>
                <Author />
                <ToastViewport />
            </MemoryRouter>,
        );
        expect((screen.getByLabelText("Box width") as HTMLInputElement).value).toBe("3");
        expect((screen.getByLabelText("Box height") as HTMLInputElement).value).toBe("3");
    });

    it("editing a dimension input updates the JSON and the live preview", () => {
        const { container } = render(
            <MemoryRouter>
                <Author />
                <ToastViewport />
            </MemoryRouter>,
        );
        fireEvent.change(screen.getByLabelText("Width"), { target: { value: "6" } });

        const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
        const geometry = JSON.parse(textarea.value).geometry;
        expect(geometry.width).toBe(6);
        // The box size is now written explicitly (pinned at its previous resolved value).
        // It is not left to re-resolve without a sign on the next compile.
        expect(geometry.boxWidth).toBe(3);
        expect((screen.getByLabelText("Box width") as HTMLInputElement).value).toBe("3");
    });

    it("lets a dimension input be emptied mid-edit, then snaps back to the applied value on blur", () => {
        const { container } = render(
            <MemoryRouter>
                <Author />
                <ToastViewport />
            </MemoryRouter>,
        );
        const width = screen.getByLabelText("Width") as HTMLInputElement;
        fireEvent.change(width, { target: { value: "" } });
        // The field shows what you typed (nothing). Nothing was applied.
        expect(width.value).toBe("");
        const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
        expect(JSON.parse(textarea.value).geometry.width).toBe(9);

        fireEvent.blur(width);
        expect(width.value).toBe("9");
    });

    it("undoes and redoes changes to the puzzle made outside the JSON box", () => {
        const { container } = render(
            <MemoryRouter>
                <Author />
            </MemoryRouter>,
        );
        const textarea = () => container.querySelector("textarea") as HTMLTextAreaElement;
        const undo = () => screen.getByRole("button", { name: /^undo$/i }) as HTMLButtonElement;
        const redo = () => screen.getByRole("button", { name: /^redo$/i }) as HTMLButtonElement;
        const original = textarea().value;

        expect(undo().disabled).toBe(true);
        expect(redo().disabled).toBe(true);

        loadExample(/^classic sudoku$/i);
        const changed = textarea().value;
        expect(changed).not.toBe(original);
        expect(undo().disabled).toBe(false);

        fireEvent.click(undo());
        expect(textarea().value).toBe(original);
        expect(redo().disabled).toBe(false);

        fireEvent.click(redo());
        expect(textarea().value).toBe(changed);
        expect(redo().disabled).toBe(true);
    });

    it("undo/redo also covers the visual builder's toolbox, and x on a tool is one step with its cleanup", () => {
        render(
            <MemoryRouter>
                <Author />
            </MemoryRouter>,
        );
        fireEvent.click(screen.getByRole("tab", { name: "Visual" }));
        const undo = () => screen.getByRole("button", { name: /^undo$/i });
        const redo = () => screen.getByRole("button", { name: /^redo$/i });
        const tile = (name: string) => screen.queryByRole("button", { name });

        // pin a tool that the example does not use
        fireEvent.click(screen.getByRole("button", { name: "Add tool" }));
        fireEvent.click(screen.getByRole("menuitem", { name: "XV" }));
        expect(tile("XV")).not.toBeNull();
        fireEvent.click(undo());
        expect(tile("XV")).toBeNull();
        fireEvent.click(redo());
        expect(tile("XV")).not.toBeNull();

        // x on a used tool removes it and its placed constraints, as one step...
        const before = screen.getAllByLabelText("Remove constraint").length;
        fireEvent.click(screen.getByLabelText(/Remove Thermometer from quick access/));
        expect(tile("Thermometer")).toBeNull();
        expect(screen.getAllByLabelText("Remove constraint").length).toBe(before - 1);

        // ...and one undo restores both the tile and the constraint
        fireEvent.click(undo());
        expect(tile("Thermometer")).not.toBeNull();
        expect(screen.getAllByLabelText("Remove constraint").length).toBe(before);
    });

    it("has a JSON tab and a Visual tab, and no tab that runs code", () => {
        render(
            <MemoryRouter>
                <Author />
            </MemoryRouter>,
        );
        expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["JSON", "Visual"]);
    });

    it("opens the JSON tab when an older release saved the removed Code tab", () => {
        localStorage.setItem("cpr:settings", JSON.stringify({ authorEditorMode: "code" }));
        const { container } = render(
            <MemoryRouter>
                <Author />
            </MemoryRouter>,
        );
        expect(screen.getByRole("tab", { name: "JSON" }).getAttribute("aria-selected")).toBe("true");
        expect(container.querySelector("textarea")).not.toBeNull();
    });

    it("still undoes via Ctrl+Z when the edit left the puzzle uncompilable, so there's no board to hold a button", () => {
        const { container } = render(
            <MemoryRouter>
                <Author />
            </MemoryRouter>,
        );
        const textarea = () => container.querySelector("textarea") as HTMLTextAreaElement;
        const original = textarea().value;

        // 6x6 with the 1-9 domain and the constraints of the demo does not compile.
        fireEvent.change(screen.getByLabelText("Width"), { target: { value: "6" } });
        expect(screen.queryByRole("button", { name: /^undo$/i })).toBeNull();

        fireEvent.keyDown(window, { key: "z", ctrlKey: true });
        expect(textarea().value).toBe(original);
    });

    it("a new change after an undo discards the redo branch", () => {
        render(
            <MemoryRouter>
                <Author />
            </MemoryRouter>,
        );
        loadExample(/^classic sudoku$/i);
        fireEvent.click(screen.getByRole("button", { name: /^undo$/i }));
        loadExample(/^mini sudoku/i);

        expect((screen.getByRole("button", { name: /^redo$/i }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("changing box width drops the stale solution instead of erroring against it", () => {
        const { container } = render(
            <MemoryRouter>
                <Author />
                <ToastViewport />
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
                <ToastViewport />
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
                <ToastViewport />
            </MemoryRouter>,
        );
        fireEvent.click(screen.getByRole("button", { name: /copy share link/i }));
        await vi.waitFor(() => expect(promptSpy).toHaveBeenCalled());
    });

    it("imports f-puzzles JSON entered via the import dialog", () => {
        const fpuzzles = JSON.stringify({
            size: 4,
            grid: Array.from({ length: 4 }, (_, r) =>
                Array.from({ length: 4 }, (_, c) => ({ region: Math.floor(r / 2) * 2 + Math.floor(c / 2) })),
            ),
            title: "Imported Test Puzzle",
        });
        const { container } = render(
            <MemoryRouter>
                <Author />
                <ToastViewport />
            </MemoryRouter>,
        );
        importViaDialog(/import from f-puzzles/i, /paste f-puzzles json/i, fpuzzles);
        const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
        expect(JSON.parse(textarea.value).metadata.title).toBe("Imported Test Puzzle");
    });

    it("imports a real f-puzzles.com share link entered via the import dialog", () => {
        const shareLink =
            "https://f-puzzles.com/?load=N4IgzglgXgpiBcA2ANCALhNAbO8QBUYw0ACABwFcoocRUBDCtACwHsAnBEAZQiwgDG9LHRABzdhAAmCANqzQAN2EVcAJlRiIimADsEadqoC+yJStwBGTdr0GjMU+ayqEAZhs798QybMhlF1wAFk87HwcnAIsEFHFbb19Hf0DXeABWMMTIgF1kBWighFD4r3s/ZzS4rTKIisK0zNLwpKjU9Szy5MqrTrruhtwPZuyTPIL2hCaalsiUmPgNEa62hZKZ0YHJ+Gtl/tWi+GGNlfnD6oSV8Z6EXZP9s7Tjy4ebpD7Wx9xpl8+3pfuf0GxQ+uXybwutSB23WvzmbzucPq22eUPhwIyoORCwBSMc1wxqNm2MOPzRJLSuPJWwWkOJNMOsOpBzSiOZOTyIHo7HYrAA7nJQPxdEQ5LIQAAlSwAYWCoglaml6XlbiVIA5qAEMCwWDAcklMrlOSiwtF8HkBulbnlirlqAlqqNnK1Or15st1uN/lNbotEuCsvl6UD9sQVvVzu1uv1/sDXqFEBFvvFset9uDaclYbUEc1Ud9koDnpNibNfsVmYd0pz9oDOY1IBd0fdCvD8ZAPrFksVNclqss8oDA4bTYLrfrxmNQA=";
        const { container } = render(
            <MemoryRouter>
                <Author />
                <ToastViewport />
            </MemoryRouter>,
        );
        importViaDialog(/import from f-puzzles/i, /paste f-puzzles json/i, shareLink);
        const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
        const imported = JSON.parse(textarea.value);
        expect(imported.metadata.title).toBe("Test puzzle");
        expect(imported.metadata.author).toBe("Silical");
        expect(container.querySelector(".author-error")).toBeNull();
    });

    it("shows an import error as a toast instead of throwing on malformed input", () => {
        const { container } = render(
            <MemoryRouter>
                <Author />
                <ToastViewport />
            </MemoryRouter>,
        );
        importViaDialog(/import from f-puzzles/i, /paste f-puzzles json/i, "not json");
        expect(container.querySelector(".toast-message")?.textContent).toMatch(/import failed/i);
    });

    it("exports to f-puzzles by opening a share link in a new tab", () => {
        const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
        const { container } = render(
            <MemoryRouter>
                <Author />
                <ToastViewport />
            </MemoryRouter>,
        );
        openInteropItem(/open in f-puzzles/i);
        expect(openSpy).toHaveBeenCalledWith(
            expect.stringMatching(/^https:\/\/f-puzzles\.com\/\?load=/),
            "_blank",
            "noopener,noreferrer",
        );
        expect(container.querySelector(".toast-message")?.textContent).toMatch(/opened/i);
    });

    it("imports SudokuMaker JSON entered via the import dialog", () => {
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
                        regions: Array.from(
                            { length: 16 },
                            (_, i) => Math.floor(Math.floor(i / 4) / 2) * 2 + Math.floor((i % 4) / 2),
                        ),
                    },
                ],
            },
        });
        const { container } = render(
            <MemoryRouter>
                <Author />
                <ToastViewport />
            </MemoryRouter>,
        );
        importViaDialog(/import from sudokumaker/i, /paste sudokumaker json/i, sudokumaker);
        const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
        expect(JSON.parse(textarea.value).metadata.title).toBe("Imported SM Puzzle");
    });

    it("imports a real dev.sudokumaker.app share link entered via the import dialog", () => {
        const shareLink =
            "https://dev.sudokumaker.app/?puzzle=DpZHNCoMwEITfZc5B_LfkQXopHoJsraCJxChUybsX13Nt2vLtYZlhZ2F3w93YQbkr2akzGhJJVEYxBMZ5XXuC3KDVQJCAgJrdw9ijb6jvJ8jb5sVfhbZbSEM6O5PAovqZIJN3RvlVTHVuF4Ex6bmdB8Zkv93i85g_r1qgMXpyVnXa8cvgniNBxvvKo00ELLWd0bsfi52ESZkQJWNypmBClJKpmAsToNS-9v4F";
        const { container } = render(
            <MemoryRouter>
                <Author />
                <ToastViewport />
            </MemoryRouter>,
        );
        importViaDialog(/import from sudokumaker/i, /paste sudokumaker json/i, shareLink);
        const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
        const imported = JSON.parse(textarea.value);
        expect(Object.keys(imported.givens ?? {})).toHaveLength(8);
        expect(container.querySelector(".author-error")).toBeNull();
    });

    it("shows a SudokuMaker import error as a toast instead of throwing on malformed input", () => {
        const { container } = render(
            <MemoryRouter>
                <Author />
                <ToastViewport />
            </MemoryRouter>,
        );
        importViaDialog(/import from sudokumaker/i, /paste sudokumaker json/i, "not json");
        expect(container.querySelector(".toast-message")?.textContent).toMatch(/import failed/i);
    });

    it("exports to SudokuMaker by opening a share link in a new tab", () => {
        const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
        const { container } = render(
            <MemoryRouter>
                <Author />
                <ToastViewport />
            </MemoryRouter>,
        );
        openInteropItem(/open in sudokumaker/i);
        expect(openSpy).toHaveBeenCalledWith(
            expect.stringMatching(/^https:\/\/sudokumaker\.app\/\?puzzle=D/),
            "_blank",
            "noopener,noreferrer",
        );
        expect(container.querySelector(".toast-message")?.textContent).toMatch(/opened/i);
    });

    it("exports to SudokuPad by opening a share link in a new tab", () => {
        const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
        const { container } = render(
            <MemoryRouter>
                <Author />
                <ToastViewport />
            </MemoryRouter>,
        );
        openInteropItem(/open in sudokupad/i);
        expect(openSpy).toHaveBeenCalledWith(
            expect.stringMatching(/^https:\/\/sudokupad\.app\//),
            "_blank",
            "noopener,noreferrer",
        );
        expect(container.querySelector(".toast-message")?.textContent).toMatch(/sudokupad/i);
    });

    it("cancelling the import dialog leaves the puzzle untouched", () => {
        const { container } = render(
            <MemoryRouter>
                <Author />
                <ToastViewport />
            </MemoryRouter>,
        );
        const before = (container.querySelector("textarea") as HTMLTextAreaElement).value;
        openInteropItem(/import from f-puzzles/i);
        fireEvent.change(screen.getByPlaceholderText(/paste f-puzzles json/i), {
            target: { value: "{ not json" },
        });
        fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
        expect(screen.queryByRole("dialog")).toBeNull();
        const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
        expect(textarea.value).toBe(before);
    });
});
