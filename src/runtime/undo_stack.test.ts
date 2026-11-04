import { describe, expect, it } from "vitest";

import { UndoStack } from "@/runtime/undo_stack.ts";

/** A toy state: entries are "set the value to n", and the inverse is "set it back". */
const make = (limit?: number) => {
    const stack = new UndoStack<number>(limit);
    let value = 0;
    const apply = (entry: number): number => {
        const inverse = value;
        value = entry;
        return inverse;
    };
    const edit = (to: number) => {
        stack.push(value);
        value = to;
    };
    return { stack, apply, edit, get: () => value };
};

describe("UndoStack", () => {
    it("starts empty, and undo and redo do nothing", () => {
        const { stack, apply } = make();
        expect(stack.canUndo).toBe(false);
        expect(stack.canRedo).toBe(false);
        expect(stack.undo(apply)).toBe(false);
        expect(stack.redo(apply)).toBe(false);
    });

    it("undoes and redoes through the inverse that apply returns", () => {
        const t = make();
        t.edit(1);
        t.edit(2);
        expect(t.stack.undo(t.apply)).toBe(true);
        expect(t.get()).toBe(1);
        expect(t.stack.undo(t.apply)).toBe(true);
        expect(t.get()).toBe(0);
        expect(t.stack.canUndo).toBe(false);
        expect(t.stack.redo(t.apply)).toBe(true);
        expect(t.get()).toBe(1);
        expect(t.stack.redo(t.apply)).toBe(true);
        expect(t.get()).toBe(2);
        expect(t.stack.canRedo).toBe(false);
    });

    it("reports what can be undone and redone", () => {
        const t = make();
        t.edit(1);
        expect(t.stack.canUndo).toBe(true);
        expect(t.stack.canRedo).toBe(false);
        t.stack.undo(t.apply);
        expect(t.stack.canUndo).toBe(false);
        expect(t.stack.canRedo).toBe(true);
    });

    it("ends the redo branch when a new step is recorded", () => {
        const t = make();
        t.edit(1);
        t.stack.undo(t.apply);
        expect(t.stack.canRedo).toBe(true);
        t.edit(5);
        expect(t.stack.canRedo).toBe(false);
        expect(t.stack.redo(t.apply)).toBe(false);
    });

    it("keeps only the newest steps up to the limit", () => {
        const t = make(3);
        for (const n of [1, 2, 3, 4, 5]) t.edit(n);
        let undone = 0;
        while (t.stack.undo(t.apply)) undone++;
        expect(undone).toBe(3);
        expect(t.get()).toBe(2); // the first two steps fell off the end
    });

    it("treats a falsy entry as a real step", () => {
        const stack = new UndoStack<number>();
        stack.push(0);
        let seen: number | undefined;
        expect(
            stack.undo((e) => {
                seen = e;
                return e;
            }),
        ).toBe(true);
        expect(seen).toBe(0);
    });
});
