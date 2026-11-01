import { useState } from "react";

interface Props {
    label: string;
    value: number;
    onCommit: (n: number) => void;
}

/** One grid/box dimension field. The applied value lives in the puzzle JSON, but
 *  while you're typing the field shows your own text, so you can clear it or delete a
 *  digit mid-edit; only a whole number >= 1 is committed, and on blur the field snaps
 *  back to whatever is actually applied. */
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
            // Selecting the existing value on focus means typing a new number replaces
            // it outright, instead of inserting at the cursor beside the old digits.
            onFocus={(e) => e.currentTarget.select()}
            // Number inputs change value on scroll-wheel while focused — and these sit
            // right above the page's scrollable content, so scrolling past them would
            // silently rewrite the grid size. Blurring lets the scroll pass through.
            onWheel={(e) => e.currentTarget.blur()}
        />
    );
}
