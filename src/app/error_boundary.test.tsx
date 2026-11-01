// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { ErrorBoundary } from "@/app/error_boundary.tsx";

afterEach(cleanup);

let shouldThrow = true;
function Bomb() {
    if (shouldThrow) throw new Error("bad artifact");
    return <p>recovered</p>;
}

function renderBoundary() {
    return render(
        <MemoryRouter>
            <ErrorBoundary>
                <Bomb />
            </ErrorBoundary>
        </MemoryRouter>,
    );
}

describe("ErrorBoundary", () => {
    it("shows a recoverable message instead of crashing when a child throws", () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        shouldThrow = true;
        renderBoundary();
        expect(screen.getByRole("alert").textContent).toContain("bad artifact");
        expect(screen.getByRole("link", { name: "Browse puzzles" })).not.toBeNull();
    });

    it("re-renders the children when 'Try again' is pressed", () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        shouldThrow = true;
        renderBoundary();
        shouldThrow = false;
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(screen.getByText("recovered")).not.toBeNull();
    });
});
