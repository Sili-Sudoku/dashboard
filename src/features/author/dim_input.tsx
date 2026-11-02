import { useState } from "react";

interface Props {
    label: string;
    value: number;
    onCommit: (n: number) => void;
}

/** One grid/box dimension field. The applied value is in the puzzle JSON.
 *  While you type, the field shows your own text. So you can clear it or delete a digit during an edit.
 *  Only a whole number >= 1 is committed. On blur, the field goes back to the applied value. */
export default function DimInput({ label, value, onCommit }: Props) {
    const [draft, setDraft] = useState<string | null>(null);
    return (
        <input
            type="number"
            min={1}
            aria-label={label}
            value={draft ?? value}
            onChange={(e) => {
                setDraft(e.target.value);
                const n = e.target.valueAsNumber;
                if (Number.isInteger(n) && n >= 1) onCommit(n);
            }}
            onBlur={() => setDraft(null)}
            // Selecting the value on focus means that a new number replaces it.
            // Without this, the new digits go in at the cursor, next to the old digits.
            onFocus={(e) => e.currentTarget.select()}
            // A number input changes its value on scroll-wheel while it has focus.
            // These fields are directly above the scrollable content of the page.
            // So a scroll past them would change the grid size without a sign.
            // A blur lets the scroll pass through.
            onWheel={(e) => e.currentTarget.blur()}
        />
    );
}
