# PRD

## Problem

Agent runs make many local choices that are difficult to inspect later. A reviewer often sees the final diff but not the rejected options, risk tradeoffs, or evidence that shaped the path.

## Goal

Provide a small, local-first CLI and skill that validates and renders decision records for agent handoffs, PRs, and audits.

## Users

- Agent builders who want reproducible run notes.
- Maintainers reviewing automated contributions.
- Operators preparing handoffs between agents.

## V1 Features

- Validate required decision log fields.
- Flag missing evidence and unowned follow-ups.
- Detect common secret-looking strings.
- Render Markdown and normalized JSON.
- Include fixtures and tests.

## Non-Goals

- External writes.
- Live evidence fetching.
- Hosted storage.
- Full governance workflow.

