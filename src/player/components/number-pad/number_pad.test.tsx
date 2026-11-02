// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import NumberPad from "@/player/components/number-pad";
import { DEFAULT_MARK_COLORS } from "@/runtime/mark_colors.ts";
import type { InputMode } from "@/runtime/session.ts";

afterEach(cleanup);

const pad = (mode: InputMode, values: readonly number[], onInput = vi.fn()) =>
    render(
        <NumberPad
            values={values}
            palette={DEFAULT_MARK_COLORS}
            mode={mode}
            onInput={onInput}
            onErase={() => undefined}
            onModeChange={() => undefined}
        />,
    );

const zero = (c: HTMLElement) => c.querySelector<HTMLButtonElement>(".pad-actions .pad-key-zero")!;
const gridKeys = (container: HTMLElement) => [...container.querySelectorAll<HTMLButtonElement>(".pad-grid button")];

describe("NumberPad 0 key", () => {
    it("always has a 0 key beside Erase, disabled unless the domain includes 0", () => {
        const { container } = pad("digit", [1, 2, 3, 4]);
        const keys = gridKeys(container);
        expect(keys.map((k) => k.textContent)).toEqual(["1", "2", "3", "4"]);
        expect(zero(container).disabled).toBe(true);
    });

    it("keeps a 0 in the domain live, ", () => {
        const { container } = pad("digit", [0, 1, 2, 3]);
        const keys = gridKeys(container);
        expect(keys.map((k) => k.textContent)).toEqual(["1", "2", "3"]);
        expect(zero(container).disabled).toBe(false);
    });

    it("is the background colour in colour mode, with the same number of keys as the other modes", () => {
        const onInput = vi.fn();
        const { container } = pad("color", [1, 2, 3, 4, 5, 6, 7, 8, 9], onInput);
        const keys = gridKeys(container);
        expect(keys).toHaveLength(9);
        const background = screen.getByRole("button", { name: "Background color" }) as HTMLButtonElement;
        expect(background.disabled).toBe(false);
        fireEvent.click(background);
        expect(onInput).toHaveBeenCalledWith(0);
    });
});

describe("NumberPad pen mode (#45)", () => {
    it("shows how the pen works in the digit keys' place, and Erase becomes Clear pen", () => {
        const { container } = render(
            <NumberPad
                values={[1, 2, 3, 4]}
                palette={DEFAULT_MARK_COLORS}
                mode="pen"
                onInput={vi.fn()}
                onErase={() => undefined}
                onModeChange={() => undefined}
            />,
        );
        expect(gridKeys(container)).toHaveLength(0);
        const guide = container.querySelector(".pad-pen-guide")?.textContent ?? "";
        expect(guide).toMatch(/drag.*line.*click.*X.*click again.*O.*remove/i);
        expect(screen.getByRole("button", { name: "Clear pen" })).not.toBeNull();
        expect(container.querySelector(".pad-key-zero")).toBeNull(); // no digits, so no 0 key either
    });
});
