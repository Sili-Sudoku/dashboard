# Where does a new control go?

Read this **before** you write a `<button>`. Pick the bucket. Put the control in
the container for that bucket. Build it with `.btn` (`src/style.css`). If no
bucket fits, this is a design question. Raise it. Do not add the control to the
nearest container.

## Buckets

| Bucket | Test: "this control…" | Variant |
| --- | --- | --- |
| **Primary action** | is the one thing a visitor comes to this page to do (Share, Check, Import) | `.btn-primary`, at most one per container |
| **Solve action** | changes the puzzle state (digit and mode keys, Undo/Redo, Reset, Check) | `.btn` |
| **View control** | changes how the board looks, not the puzzle (zoom, fit, lock) | `.btn .btn-sm` |
| **Setting / preference** | is set once and stays set (check-notes-on-leave, default zoom lock) | not a button; a field on `/settings` |
| **Disclosure / info** | shows or hides reference content (constraints, shortcuts, JSON) | the existing toggle pattern, collapsed by default |
| **Authoring action** | acts on the draft in the editor (validate, import/export, add constraint) | `.btn`; `.btn-primary` only for the single main commit |

A control that the user sets once is a setting, even if it is convenient to
have it nearby. Debug and developer controls (View JSON) are disclosure. They
are never primary.

## Containers, per page

| Bucket | Play (`/p/:ref`) | Author (`/new`) |
| --- | --- | --- |
| Primary action | header actions slot (`.play-actions`) | `.author-actions` row |
| Solve action | player sidebar: number pad, `Controls` | none |
| View control | board toolbar (`.board-zoom-toolbar`) | same toolbar |
| Setting | `/settings`; the header gear links there (the theme toggle is also in the header) | same |
| Disclosure / info | sidebar toggles (`ConstraintPanel`, `HotkeyLegend`); JSON view | solution toggle |
| Authoring action | none | `.author-actions`, `.author-interop`, visual-builder actions |

### At phone width (≤600px)

| Bucket | Behavior |
| --- | --- |
| Primary action | On board pages: icon only in the header (label hidden, `aria-label` set). On other pages: keeps its label. |
| Solve action | Stays. Below 820px the sidebar stacks under the board. |
| View control | Icon only (labels hidden). The zoom slider shrinks to fill the row. |
| Setting | No change. It is a page, not a toolbar. |
| Disclosure / info | Stays collapsed by default. It opens inline. It never opens as a floating panel over the board. |
| Authoring action | Below 900px the editor stacks above the preview. Rows wrap. |

The player sidebar uses the same groups: status strip, `.pp-solve` (solving
controls), and `.pp-reference` (disclosures). Add a control to the group for its
bucket. Do not start a new top-level item.

## Every control, in every bucket

- Build it from `.btn`. Do not add new `button { … }` rules or new hex colors.
- An icon-only control needs an `aria-label`. This includes a button whose text
  label CSS hides at phone width. `display: none` also removes the accessible
  name. A toggle needs `aria-pressed` (`.btn` styles it as active by itself). Do
  not remove the global `:focus-visible` ring.
- A keyboard user must be able to reach it. If it has a hotkey, add the hotkey
  to the hotkey legend.
- It must have a defined phone-width behavior (≤600px). It stays, or it becomes
  icon only (hide the text label, keep the `aria-label`), or it moves into the
  overflow menu or disclosure of its container. "It overflows or wraps in an
  unpredictable way" is not an answer.
- The tap target is at least 32px. `.btn` sets a 2rem minimum. Do not override
  it to a smaller size.
- Text on a `--brand` fill uses `--on-brand`, not `#fff`. White text fails
  contrast in the dark theme.
- Feedback to an action that the user just did (check result, import/export
  outcome) is a `toast()` from `src/app/toast.ts`. A toast floats and never
  moves the layout. Feedback about the *current state* (a JSON parse error,
  "Solved!", a missing puzzle) stays inline until its cause is fixed.

## Checklist

1. Which bucket is it? If it fits two buckets, it is two controls or the wrong control.
2. Can a control that is already in that container take this job?
3. Does it need to be a button, or is it a setting?
4. What does it do at phone width?
