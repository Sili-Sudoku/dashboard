# Where does a new control go?

Check this **before** writing a `<button>`. Pick the bucket, put the control in
that bucket's container, build it with `.btn` (`src/style.css`). If no bucket
fits, that's a design question — raise it, don't append the control to the
nearest container.

## Buckets

| Bucket | Test: "this control…" | Variant |
| --- | --- | --- |
| **Primary action** | is the one thing a visitor came to this page to do (Share, Check, Import) | `.btn-primary` — at most one per container |
| **Solve action** | changes the puzzle state (digit/mode keys, Undo/Redo, Reset, Check) | `.btn` |
| **View control** | changes how the board is seen, not the puzzle (zoom, fit, lock) | `.btn .btn-sm` |
| **Setting / preference** | is set once and stays set (check-notes-on-leave, default zoom lock) | not a button — a field on `/settings` |
| **Disclosure / info** | shows or hides reference content (constraints, shortcuts, JSON) | existing toggle pattern, collapsed by default |
| **Authoring action** | operates on the draft being authored (validate, import/export, add constraint) | `.btn`, `.btn-primary` only for the single main commit |

A control that's "set once" is a setting even if it's convenient to have nearby.
Debug/developer affordances (View JSON) are disclosure, never primary.

## Containers, per page

| Bucket | Play (`/p/:ref`) | Author (`/new`) |
| --- | --- | --- |
| Primary action | header actions slot (`.play-actions`) | `.author-actions` row |
| Solve action | player sidebar: number pad, `Controls` | — |
| View control | board toolbar (`.board-zoom-toolbar`) | same toolbar |
| Setting | `/settings`; header gear links there (theme toggle also lives in the header) | same |
| Disclosure / info | sidebar toggles (`ConstraintPanel`, `HotkeyLegend`); JSON view | SDK example, solution toggle |
| Authoring action | — | `.author-actions`, `.author-interop`, visual-builder actions |

### At phone width (≤600px)

| Bucket | What it does |
| --- | --- |
| Primary action | Board pages: icon-only in the header (label hidden, `aria-label` set). Other pages: keeps its label. |
| Solve action | Stays; the sidebar stacks under the board below 820px. |
| View control | Icon-only (labels hidden); the zoom slider shrinks to fill the row. |
| Setting | Unchanged — it's a page, not a toolbar. |
| Disclosure / info | Stays collapsed by default; opens inline, never as a floating panel over the board. |
| Authoring action | Editor stacks above the preview below 900px; rows wrap. |

The player sidebar is grouped to match: status strip, `.pp-solve` (solving
controls), `.pp-reference` (disclosures). Add a control to the group for its
bucket — don't start a new top-level item.

## Every control, regardless of bucket

- Built from `.btn`; no new `button { … }` rules, no new hex colors.
- Icon-only → `aria-label` — including a button whose text label is hidden by
  CSS at phone width (`display: none` removes the accessible name too).
  Toggle → `aria-pressed` (`.btn` styles it as active by itself). Don't remove the global
  `:focus-visible` ring.
- Reachable by keyboard; if it has a hotkey, add it to the hotkey legend.
- Has a stated phone-width behavior (≤600px): stays, collapses to icon-only
  (hide the text label, keep the `aria-label`), or moves into its container's
  overflow/disclosure. "Overflows or wraps unpredictably" is not an answer.
- Tap target ≥ 32px (`.btn` enforces a 2rem minimum; don't override it down).
- Text on a `--brand` fill uses `--on-brand`, not `#fff` (white fails contrast in
  the dark theme).
- Feedback to an action the user just took (check result, import/export outcome)
  is a `toast()` from `src/app/toast.ts` — it floats and never shifts layout.
  Feedback about *current state* (a JSON parse error, "Solved!", a missing
  puzzle) stays inline until its cause is fixed.

## Checklist

1. Which bucket? (If two, it's two controls or the wrong control.)
2. Is there already a control in that container that could absorb it?
3. Does it need to be a button at all, or is it a setting?
4. What does it do at phone width?
