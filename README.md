# agent-decision-log-skill

`agent-decision-log-skill` helps agents leave a compact, reviewable record of why they chose a path. It validates a local JSON decision log, flags risky or under-evidenced entries, and renders Markdown or JSON that can be pasted into a PR, handoff, or run audit.

## Quickstart

```bash
npm install
npm test
node bin/agent-decision-log.js validate fixtures/decision.valid.json
node bin/agent-decision-log.js render fixtures/decision.valid.json --format markdown
```

## Input Shape

```json
{
  "id": "decision-001",
  "title": "Choose release candidate branch",
  "context": "Need a branch that keeps main stable while reviewers inspect the build.",
  "options": [
    { "name": "push to main", "tradeoffs": ["fast", "less reviewable"] },
    { "name": "release candidate branch", "tradeoffs": ["reviewable", "slower"] }
  ],
  "chosen": "release candidate branch",
  "rationale": "Keeps a review boundary and supports verification notes.",
  "evidence": [
    { "label": "test output", "ref": "npm test" }
  ],
  "risks": [
    { "level": "medium", "description": "PR may drift if main changes." }
  ],
  "followups": [
    { "owner": "maintainer", "task": "Review release candidate PR." }
  ]
}
```

## Commands

- `agent-decision-log validate <file>` checks required fields and reports issues.
- `agent-decision-log render <file> --format markdown` emits a human-readable decision record.
- `agent-decision-log render <file> --format json` emits normalized JSON with warnings.

## Safety Notes

The tool is local-first and never writes to external services. It does not prove that a decision was correct; it only checks whether the decision record is complete enough to review. Secret-looking values are flagged so the agent can redact before sharing.

## Limitations

- JSON input only in V1.
- Evidence refs are treated as text, not fetched or verified.
- Risk scoring is heuristic and intentionally conservative.

