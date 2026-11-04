// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import PuzzleList from "@/features/puzzles/index.tsx";
import { listFixtures, listPuzzles } from "@/puzzles/index.ts";

afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
});

const renderList = () =>
    render(
        <MemoryRouter>
            <PuzzleList />
        </MemoryRouter>,
    );

const cardTitles = (container: HTMLElement) => [...container.querySelectorAll(".pc-title")].map((el) => el.textContent);

describe("Puzzle list", () => {
    it("shows the puzzles to play, and none of the test puzzles, in the built app", () => {
        vi.stubEnv("DEV", false);
        const { container } = renderList();
        expect(cardTitles(container)).toEqual(listPuzzles().map((p) => p.metadata.title));
        for (const fixture of listFixtures()) expect(cardTitles(container)).not.toContain(fixture.metadata.title);
        expect(screen.queryByRole("region", { name: "Development fixtures" })).toBeNull();
    });

    it("links each card to its puzzle", () => {
        vi.stubEnv("DEV", false);
        const { container } = renderList();
        const hrefs = [...container.querySelectorAll("a.puzzle-card")].map((a) => a.getAttribute("href"));
        expect(hrefs).toEqual(listPuzzles().map((p) => `/p/${p.metadata.id}`));
    });

    it("shows the test puzzles apart, in development only", () => {
        vi.stubEnv("DEV", true);
        const { container } = renderList();
        const region = screen.getByRole("region", { name: "Development fixtures" });
        const inRegion = cardTitles(region);
        expect(inRegion).toEqual(listFixtures().map((p) => p.metadata.title));
        // the main list above is unchanged
        const main = container.querySelector(".puzzles-intro + .puzzles-list") as HTMLElement;
        expect(cardTitles(main)).toEqual(listPuzzles().map((p) => p.metadata.title));
    });
});
