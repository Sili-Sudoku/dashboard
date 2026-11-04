/**
 * The two stacks of undo and redo.
 * Undo and redo are the same operation on opposite stacks: pop an entry, apply it, and keep the entry that
 * undoes what was just applied on the other stack. What an entry means is up to the caller (`apply`).
 */
export class UndoStack<T> {
    private past: T[] = [];
    private future: T[] = [];

    private readonly limit: number;

    constructor(limit = 200) {
        this.limit = limit;
    }

    get canUndo(): boolean {
        return this.past.length > 0;
    }

    get canRedo(): boolean {
        return this.future.length > 0;
    }

    /** Records a new step. It drops the oldest step past the limit, and it ends the redo branch. */
    push(entry: T): void {
        this.past.push(entry);
        if (this.past.length > this.limit) this.past.shift();
        this.future = [];
    }

    /** Applies the latest step. `apply` returns the inverse step. Returns false when there is nothing to undo. */
    undo(apply: (entry: T) => T): boolean {
        const entry = this.past.pop();
        if (entry === undefined) return false;
        this.future.push(apply(entry));
        return true;
    }

    /** Applies the latest undone step. Returns false when there is nothing to redo. */
    redo(apply: (entry: T) => T): boolean {
        const entry = this.future.pop();
        if (entry === undefined) return false;
        this.past.push(apply(entry));
        return true;
    }
}
