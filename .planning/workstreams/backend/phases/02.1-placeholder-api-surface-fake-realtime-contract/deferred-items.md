# Deferred Items — Phase 02.1

Out-of-scope discoveries logged during plan execution, per the executor's SCOPE BOUNDARY rule
(not fixed — recorded for later triage).

## From 02.1-01

- **`start:prod` script points at the wrong build output path.** `apps/gutcallfun-core/package.json`'s
  `start:prod` script runs `node dist/main`, but the Nest CLI's actual compiled output for this
  project lands at `dist/src/main.js` (confirmed via `find dist -name main.js` after `npm run build`).
  Pre-existing, unrelated to any file this plan modified — no task in 02.1-01 touches the `scripts`
  block. Will silently fail (`MODULE_NOT_FOUND`) the first time someone runs `npm run start:prod`
  or builds a Docker image around it. Needs a one-line fix (`node dist/src/main` or a `tsconfig`
  `outDir`/`rootDir` adjustment) before any real deploy attempt.
