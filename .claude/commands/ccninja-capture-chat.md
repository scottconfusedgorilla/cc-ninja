---
description: Capture this Claude Code session as a memodef:Transcript artifact via the cc-ninja CLI.
argument-hint: "[role-id] — omit to use the session name as the seat"
allowed-tools: Bash(node cli/out/index.js:*)
---

Capture the current Claude Code session as a `memodef:Transcript` artifact.

**Do NOT reconstruct, narrate, or summarize the conversation yourself.** The
cc-ninja CLI reads this session's JSONL directly from `~/.claude/projects/` —
that file is the faithful capture source. Your only job is to run the CLI and
report what it prints. (Capture happens in the harness, not the model.)

Resolve the role-id:

- If `$ARGUMENTS` is non-empty, use it as the role-id.
- Otherwise, use **this session's name** (the seat you are occupying, e.g. the
  title set via `/rename`) as the role-id. The session name *is* the seat
  declaration.

Then run, from the repo root:

```
node cli/out/index.js --role-id <resolved-role-id>
```

Report the `Created`/`Updated` path the CLI prints, and nothing else. If the CLI
errors (e.g. no JSONL found, or no role-id resolvable), surface its exact error
and stop — do not fall back to writing a transcript by hand.
