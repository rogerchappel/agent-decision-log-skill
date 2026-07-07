# Agent Decision Log Skill

Use this skill when an agent needs to explain a consequential decision after or during a run: picking an implementation path, selecting a connector, deciding not to execute an action, choosing a release branch, or handing work to another agent.

## Required Inputs

- A local JSON decision log.
- Evidence references such as commands, file paths, PR URLs, or fixture names.
- Any known risks and follow-up owners.

## Side-Effect Boundaries

This skill is read-only. It validates and renders local files and must not call live connectors, create tickets, send messages, or approve actions.

## Workflow

1. Draft a decision log with context, options, chosen path, rationale, evidence, risks, and follow-ups.
2. Run `agent-decision-log validate <file>`.
3. Fix missing evidence, ambiguous chosen options, and secret-looking values.
4. Run `agent-decision-log render <file> --format markdown`.
5. Include the rendered output in the handoff, PR, or run audit.

## Approval Requirements

No approval is required to run validation locally. Human approval is required before sharing rendered output outside the local workspace when it references private repos, customer data, credentials, or internal incidents.

## Examples

```bash
agent-decision-log validate fixtures/decision.valid.json
agent-decision-log render fixtures/decision.valid.json --format markdown
```

## Verification

Run `npm test`, `npm run check`, and `npm run smoke` before treating this skill as release-ready.

