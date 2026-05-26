# CCNinja — Project Constitution

CCNinja is **OAGP-shaped** (ratified 2026-05-26).

- **Org charter:** [`org/ccninja-organization.opencatalog`](org/ccninja-organization.opencatalog) — the authoritative orgdef.
- **Upstream layer:** the portfolio `s:/projects/CLAUDE.md` (shared MUSTs), reconciled below.
- **To join as an AI peer:** run `/oagp-onboard` (read `org/`, this file, `memos/`, `proposals/`, `transcripts/`).
- **Naming:** the OAGP identifier layer is **dashless** — `ccninja`, `ccninja-strategist`, `ccninja-engineer`. The git repo and npm packages remain `cc-ninja` / `cc-ninja-cli` / `@cc-ninja/core` / `cc-ninja-server`.

## Mission

Capture, format, and save AI chat transcripts as durable, git-tracked `memodef:Transcript` artifacts (envelope + sibling `.body.md`) across multiple AI surfaces — Claude Code (VS Code extension + standalone CLI) and Claude For Chrome (via a local HTTP bridge). CCNinja is the reference capture-tool implementation cited by the memodef-spec v0.4 transcript proposal.

## Governance

Director (Scott Edsby) holds final authority on direction, scope, merges, and pushes. The **Strategist** and **Engineer** are AI seats with bounded authority: they propose and implement, and commit/push only with explicit per-session Director go-ahead.

## Red lines (MUST)

1. **Mandatory redaction, no opt-out.** Recognized secrets are masked on every save; there is no disable flag. To preserve a secret verbatim, do it outside the tool.
2. **Capture happens in the harness, not the model.** No transport may have the model serialize/narrate the conversation; capture reads the source of truth (JSONL/DOM).
3. **No autonomous merges or pushes.** Commit and push only with explicit per-session Director go-ahead; work lands on a branch first.
4. **No proprietary lock-in.** Emit conformant `memodef:Transcript` against the open memodef spec; never a closed format. The artifact stays readable by any peer.
5. **Version bump on every release + version surfaced in diagnostics.**

## Values (principles)

- **capture-fidelity-in-the-harness-not-the-model** — the model is a worse-than-faithful narrator of its own context.
- **envelope-body-split** — envelope written once and indexable; body grows; only `ended` is mutable.
- **transport-agnostic-core** — one shared emitter; each surface derives only its transport-specific bits.
- **seat-over-incumbent** — transcripts belong to the seat, not the session; the durable thing is the seat's trajectory.
- **secret-safety-by-default** — redact on save; conservative patterns so fidelity is never silently corrupted.
- **versioning-discipline** — bump on every release; surface the running version.

## Reconciliation with the portfolio CLAUDE.md

The portfolio MUSTs assume a web app over a datastore. CCNinja is a TypeScript extension + CLI + local bridge that writes files. They are reconciled as follows:

- **Testing (pytest):** N/A as written (no Python). The correctness gate is `tsc` compilation plus targeted `node` verification runs against real and synthetic fixtures. Adopt a TS test runner (e.g. vitest) when a standing unit-test suite is warranted; do not ship on a failing build/typecheck.
- **WCAG 2.1 AA / touch targets:** applies only to any future human-facing web UI. Current surfaces (CLI output, VS Code commands + toasts) inherit VS Code's accessibility. N/A until a web UI ships.
- **Soft delete:** N/A — no datastore CRUD. The analogue is **append-mode / update-in-place** (envelope once, body grows; match-on-key updates the same pair) and **no destructive git-history rewrites without Director authorization**.
- **Build numbers (`build NNN`):** replaced by **semver per component**, surfaced in diagnostics and the `capture_tool` envelope stamp.

## Seats

| Seat | Status | Notes |
|---|---|---|
| `director` | staffed | Scott Edsby — human Product Owner |
| `ccninja-strategist` | staffed | AI seat — strategy + proposals |
| `ccninja-engineer` | staffed | AI seat — role: senior-project-oriented-software-engineer. Legacy role-ids: `ccc-ninja-engineer`, `cc-ninja-engineer` |
