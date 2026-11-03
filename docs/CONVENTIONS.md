# Conventions

Short rules for everyone who changes this project.

## Commits

- One change in each commit. If the subject needs "and", make two commits.
- The subject is one line of 72 characters or fewer. Use the imperative mood. Do not end it with a full stop.
  Example: `Cap decompression size on URL imports`.
- The subject says what changed.
- Add a body only when the reason is not clear from the change. Keep it to a few short lines.
- Before you commit, run `npm run format`, `npm run typecheck`, `npm run lint` and `npm test`. All three must pass.
