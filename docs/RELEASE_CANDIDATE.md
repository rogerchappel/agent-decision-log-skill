# Release Candidate Notes

## Classification

ship

## Verification

Run:

```bash
npm test
npm run check
npm run smoke
```

2026-07-08 release-candidate verification:

- `npm test`: pass, 4 tests.
- `npm run check`: pass, Node syntax checks.
- `npm run smoke`: pass, rendered `fixtures/decision.valid.json` as Markdown.
- `bash scripts/validate.sh`: pass, runs the full local verification set.

## Release Checklist

- README includes quickstart and limitations.
- `SKILL.md` documents approval boundaries.
- Fixtures cover valid and invalid records.
- CLI exits non-zero on validation failure.
