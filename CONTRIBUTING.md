# Contributing

Keep changes deterministic and local-first. Tests and smoke checks must not call external services, fetch evidence refs, or write to remote systems.

Before opening a PR, run:

```sh
npm run release:check
```

When adding packaged docs, fixtures, or entrypoints, update `scripts/package-smoke.mjs` so the npm tarball keeps the files needed for installation, review, and release verification.
