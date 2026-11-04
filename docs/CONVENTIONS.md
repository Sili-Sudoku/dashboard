# Conventions

Short rules for everyone who changes this project.

## Commits

- One change in each commit. If the subject needs "and", make two commits.
- The subject is one line of 72 characters or fewer. Use the imperative mood. Do not end it with a full stop.
  Example: `Cap decompression size on URL imports`.
- The subject says what changed.
- Add a body only when the reason is not clear from the change. Keep it to a few short lines.
- Before you commit, run `npm run format`, `npm run typecheck`, `npm run lint` and `npm test`. All three must pass.

## Comments

- Write the why, not the what. If the code says it, the comment does not.
- Keep a comment to a few lines. A header of more than about 12 lines is a sign that the text belongs in `docs/`.
- Do not tell the history of a design ("we tried three designs"). Keep the measured result that explains the
  current choice, in one line.
- Do not put ticket numbers in comments.
- Write in simple technical English (ASD-STE100): short sentences, active voice.

## Manual checks

Run Lighthouse by hand before a release, or after a change to the look of a page. It is not part of CI. It finds
real-browser problems that the jsdom tests cannot see, such as colour contrast, touch-target size, and load speed.

```bash
npm run build && npx vite preview --port 4199
npx lighthouse http://localhost:4199/ --chrome-flags="--headless" --view
```

Check `/`, `/puzzles`, a puzzle such as `/p/demo-mixed`, and `/new`. The last result was 95-100 for performance and
100 for accessibility. Ignore the audits `valid-source-maps` (the build has no source maps on purpose), `llms-txt` and
`agentic-browsing`.
