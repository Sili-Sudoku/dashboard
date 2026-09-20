// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import Play from "@/features/play/index.tsx";

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

        fireEvent.click(screen.getByRole("button", { name: /view json/i }));

        const panel = container.querySelector(".play-json") as HTMLElement;
        const pre = within(panel).getByText(/"metadata"/, { selector: "pre" });
        expect(pre.textContent).toContain('"id": "whisper-line"');
        // the whisper rule is visible as primitive expressions, not a definition ref
        expect(pre.textContent).toContain('"or"');
        expect(pre.textContent).not.toContain('"use": "whispers"');
    });

    it("switches to the compiled view where constraints carry a source", () => {
        const { container } = renderAt("/p/whisper-line");
        fireEvent.click(screen.getByRole("button", { name: /view json/i }));
        fireEvent.click(screen.getByRole("button", { name: /compiled/i }));

        const pre = container.querySelector(".play-json pre") as HTMLElement;
        expect(pre.textContent).toContain('"source": "primitive"');
        expect(pre.textContent).toContain('"source": "sudoku"');
    });

    it("closes the panel again", () => {
        const { container } = renderAt("/p/mini-sudoku");
        fireEvent.click(screen.getByRole("button", { name: /view json/i }));
        expect(container.querySelector(".play-json")).not.toBeNull();
        fireEvent.click(screen.getByRole("button", { name: /hide json/i }));
        expect(container.querySelector(".play-json")).toBeNull();
    });
});
