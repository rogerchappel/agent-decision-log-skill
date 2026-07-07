# Examples

## Release Branch Choice

Use `fixtures/decision.valid.json` to record why a release-candidate branch was preferred over pushing directly to main.

```bash
agent-decision-log render fixtures/decision.valid.json --format markdown
```

## Incomplete Decision

Use `fixtures/decision.invalid.json` to see how the validator reports missing evidence, too few options, and secret-looking content.

```bash
agent-decision-log validate fixtures/decision.invalid.json
```

The invalid fixture should fail validation. That behavior is intentional and useful for CI or pre-handoff checks.

