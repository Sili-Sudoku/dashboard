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

## Browser smoke test

`npm run test:e2e` builds the app and runs a few tests in a real Chromium (`e2e/`). CI does not run it, to keep CI
light, so run it before a release. Run `npx playwright install chromium` once on a new machine. The tests cover what
jsdom cannot: real layout, a phone-sized screen, and offline use through the service worker.

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

`npm run deps` runs three checks. It fails if the Node version in `engines.node` is within 180 days of its end of life
(from the official Node release schedule; skipped when offline). It fails if a package that ships to users has a known
vulnerability. Then it lists packages with newer versions. Dev-only tools (tests, lint) can have advisories without
affecting users, so the audit skips them. CI runs the Node check on every push. Run the full command before a release.

## Deploying

A push to `main` builds the site and publishes it to GitHub Pages (`.github/workflows/deploy.yml`). It needs no token
and no second repository. One-time setup, in the repository settings:

1. Settings → Pages → Source: **GitHub Actions**.
2. Settings → Pages → Custom domain: `sudoku.silical.dev`, then **Enforce HTTPS** once the certificate is ready.
3. At the DNS provider: a `CNAME` record for `sudoku` pointing to `<org>.github.io`.

The workflow does not run the tests. `CI` does that on the same push, so a red CI after a deploy means the site is
live with a failing check. Pages ignores `public/_redirects`, so the workflow copies `index.html` to `404.html` to make
`/p/<puzzle>` and the other routes load the app.
