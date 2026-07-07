# Orchestration

## Agent Flow

1. Gather the decision context from run notes.
2. Create a local JSON decision log.
3. Validate with `agent-decision-log validate`.
4. Render Markdown for the destination surface.
5. Keep the source JSON with the run artifacts.

## Failure Handling

- Missing required fields: stop and request or infer the missing context.
- Secret-looking values: redact before sharing.
- Missing evidence: mark the decision as incomplete until evidence is added.

## External Actions

This project does not execute external actions. Agents should use it before publishing or sending a decision summary.

