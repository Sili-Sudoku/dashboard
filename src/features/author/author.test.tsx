// @vitest-environment jsdom
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
});
