// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { useFocusTrap } from "@/app/use_focus_trap.ts";

afterEach(cleanup);

const Modal = () => {
    const { ref, onKeyDown } = useFocusTrap<HTMLDivElement>();
    return (
        <div ref={ref} onKeyDown={onKeyDown}>
            <button>first</button>
            <button>last</button>
        </div>
    );
};

const Host = () => {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button onClick={() => setOpen(!open)}>toggle</button>
            <button>behind</button>
            {open && <Modal />}
        </>
    );
};

const openModal = () => {
    render(<Host />);
    const toggle = screen.getByRole("button", { name: "toggle" });
    toggle.focus();
    fireEvent.click(toggle);
    return toggle;
};

describe("useFocusTrap", () => {
    it("focuses the first control on open", () => {
        openModal();
        expect(document.activeElement).toBe(screen.getByRole("button", { name: "first" }));
    });

    it("wraps Tab from the last control and Shift+Tab from the first", () => {
        openModal();
        const first = screen.getByRole("button", { name: "first" });
        const last = screen.getByRole("button", { name: "last" });
        last.focus();
        fireEvent.keyDown(last, { key: "Tab" });
        expect(document.activeElement).toBe(first);
        fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
        expect(document.activeElement).toBe(last);
    });

    it("returns focus to the opener on close", () => {
        const toggle = openModal();
        fireEvent.click(toggle);
        expect(document.activeElement).toBe(toggle);
    });
});
