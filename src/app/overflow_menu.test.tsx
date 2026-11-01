// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { OverflowMenu } from "@/app/overflow_menu.tsx";

afterEach(cleanup);

describe("OverflowMenu", () => {
    it("opens on click, runs an item, and closes", () => {
        const onSelect = vi.fn();
        render(<OverflowMenu label="More" items={[{ label: "Share", onSelect }]} />);
        expect(screen.queryByRole("menu")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "More" }));
        fireEvent.click(screen.getByRole("menuitem", { name: "Share" }));
        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole("menu")).toBeNull();
    });

    it("closes on Escape and returns focus to the trigger", () => {
        render(<OverflowMenu label="More" items={[{ label: "Share", onSelect: () => undefined }]} />);
        const trigger = screen.getByRole("button", { name: "More" });
        fireEvent.click(trigger);
        expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Share" }));
        fireEvent.keyDown(document.activeElement!, { key: "Escape" });
        expect(screen.queryByRole("menu")).toBeNull();
        expect(document.activeElement).toBe(trigger);
    });

    it("closes on an outside press", () => {
        render(<OverflowMenu label="More" items={[{ label: "Share", onSelect: () => undefined }]} />);
        fireEvent.click(screen.getByRole("button", { name: "More" }));
        fireEvent.pointerDown(document.body);
        expect(screen.queryByRole("menu")).toBeNull();
    });

    it("moves focus with the arrow keys, wrapping around", () => {
        const items = [
            { label: "A", onSelect: () => undefined },
            { label: "B", onSelect: () => undefined },
        ];
        render(<OverflowMenu label="More" items={items} />);
        fireEvent.click(screen.getByRole("button", { name: "More" }));
        fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
        expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "B" }));
        fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
        expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "A" }));
        fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
        expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "B" }));
    });

    it("needs a second press for a destructive item", () => {
        const onSelect = vi.fn();
        render(<OverflowMenu label="More" items={[{ label: "Reset", confirm: "Really reset?", onSelect }]} />);
        fireEvent.click(screen.getByRole("button", { name: "More" }));
        fireEvent.click(screen.getByRole("menuitem", { name: "Reset" }));
        expect(onSelect).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("menuitem", { name: "Really reset?" }));
        expect(onSelect).toHaveBeenCalledTimes(1);
    });

    it("lists a read-only info line that can't be chosen or focused", () => {
        const onSelect = vi.fn();
        render(
            <OverflowMenu
                label="More"
                items={[
                    { label: "0:42", info: true, onSelect },
                    { label: "Share", onSelect: () => undefined },
                ]}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "More" }));
        expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Share" }));
        fireEvent.click(screen.getByRole("menuitem", { name: "0:42" }));
        expect(onSelect).not.toHaveBeenCalled();
        expect(screen.getByRole("menu")).toBeTruthy();
    });
});
