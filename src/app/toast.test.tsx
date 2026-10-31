// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { clearToasts, toast } from "@/app/toast.ts";
import { ToastViewport } from "@/app/toast_viewport.tsx";

afterEach(() => {
    cleanup();
    clearToasts();
    vi.useRealTimers();
});

describe("toast", () => {
    it("shows a message, dismisses itself after its duration, and can be dismissed by hand", () => {
        vi.useFakeTimers();
        render(<ToastViewport />);

        act(() => toast("Saved", { duration: 1000 }));
        expect(screen.getByText("Saved")).toBeTruthy();
        act(() => vi.advanceTimersByTime(1000));
        expect(screen.queryByText("Saved")).toBeNull();

        act(() => toast("Again"));
        fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
        expect(screen.queryByText("Again")).toBeNull();
    });

    it("holds a toast while hovered and resumes with the time that was left", () => {
        vi.useFakeTimers();
        render(<ToastViewport />);
        act(() => toast("Hold me", { duration: 1000 }));
        const el = screen.getByText("Hold me").closest(".toast") as HTMLElement;

        act(() => vi.advanceTimersByTime(600));
        fireEvent.pointerEnter(el);
        act(() => vi.advanceTimersByTime(5000));
        expect(screen.queryByText("Hold me")).not.toBeNull();

        fireEvent.pointerLeave(el);
        act(() => vi.advanceTimersByTime(399));
        expect(screen.queryByText("Hold me")).not.toBeNull();
        act(() => vi.advanceTimersByTime(1));
        expect(screen.queryByText("Hold me")).toBeNull();
    });

    it("shows a countdown bar sized to the toast's lifetime", () => {
        render(<ToastViewport />);
        act(() => toast("Timed", { duration: 2500 }));
        const bar = document.querySelector(".toast-timer") as HTMLElement;
        expect(bar.style.animationDuration).toBe("2500ms");
    });

    it("replaces a toast that has the same key instead of stacking", () => {
        render(<ToastViewport />);
        act(() => {
            toast("first", { key: "k" });
            toast("second", { key: "k" });
        });
        expect(screen.queryByText("first")).toBeNull();
        expect(screen.getByText("second")).toBeTruthy();
    });

    it("announces errors assertively and everything else politely", () => {
        render(<ToastViewport />);
        act(() => {
            toast("bad", { kind: "error" });
            toast("fine", { kind: "success" });
        });
        expect(screen.getByRole("alert").textContent).toContain("bad");
        expect(screen.getByRole("status").textContent).toContain("fine");
    });
});
