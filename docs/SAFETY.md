# Safety

`agent-decision-log-skill` is designed for local review artifacts.

## Safe Uses

- Summarizing a decision for a pull request.
- Capturing a handoff between agents.
- Recording why an external action was deferred.
- Checking that evidence and follow-ups are present.

## Stop Conditions

- The rendered output contains credentials, customer data, private incident details, or internal-only URLs.
- The decision record claims correctness without evidence.
- A follow-up that needs a human owner is unassigned.

## Sharing Guidance

Run validation before sharing. Treat warnings as review prompts, not as automatic approvals.

