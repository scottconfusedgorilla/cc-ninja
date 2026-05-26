# OAGP bootstrap ratified — CCNinja org charter instantiated

**Date OAGP shape was committed:** 2026-05-26
**Ratified by:** Director (Scott Edsby, `scott@confusedgorilla.com`)
**Proposal:** `proposals/oagp-bootstrap-2026-05-26.md`
**Charter:** `org/ccninja-organization.opencatalog`

This memo is the institutional record of CCNinja adopting OAGP shape. It is filed
to the `ccninja-strategist` seat — the decision belongs to the seat, not to any
incumbent. A future AI peer reading its inbox finds, on day zero, what was
decided, when, and by whom.

## What was proposed

A `ccninja-bootstrap-strategist` helper surveyed the project (README, monorepo
layout, commit history, the existing `memos/`/`notes/`/`transcripts/` partial
substrate, and the one inbox memo from `memodef-strategist`) and drafted an
orgdef: mission, scope, governance, six values, five red lines, recommended
patterns, a provisional v1 criterion, three positions (`director`,
`ccninja-strategist`, `ccninja-engineer`), and a relationship to the external
`memodef-spec` org.

## What was ratified (with Director amendments)

- **Naming:** OAGP identifiers are **dashless** — `ccninja`, `ccninja-strategist`,
  `ccninja-engineer`. The git repo and npm packages stay `cc-ninja*`.
- **AI seats are `staffed`** (Strategist and Engineer both carry AI incumbent
  blocks). `director` is staffed by Scott.
- **Canonical engineer role-id is `ccninja-engineer`.** Lineage: *Claude Code
  Copier* → `ccc-ninja` (Claude Code Copier Ninja) → `cc-ninja` → `ccninja`.
  Legacy transcript folders (`ccc-ninja-engineer`, `cc-ninja-engineer`) remain
  as historical seat records.
- **Portfolio-CLAUDE.md reconciliation accepted:** pytest, WCAG AA, soft-delete,
  and integer build-numbers are explicitly reinterpreted/exempted for a
  TypeScript extension + CLI (see the new project `CLAUDE.md`).
- **vision** accepted provisionally; **v1_success_criterion** kept provisional,
  Director may revise.
- **`notes/`** recognized as a valid substrate folder for seat notes-to-self.

## Red lines now in force (see CLAUDE.md)

1. Mandatory redaction, no opt-out.
2. Capture happens in the harness, not the model.
3. No autonomous merges or pushes (branch first; per-session Director go-ahead).
4. No proprietary lock-in (conformant `memodef:Transcript` only).
5. Version bump on every release + version surfaced in diagnostics.

## Substrate now present

`org/` (charter), `memos/` (this memo + prior inbox), `proposals/` (the bootstrap
proposal), `transcripts/` (per-seat records), `notes/` (seat notes-to-self).

## Next steps for future participants

- To onboard a fresh AI peer (or yourself in a new session): `/oagp-onboard`.
- To staff a vacant seat (none currently vacant): the Director authorizes an
  incumbent directly, or an AI peer self-onboards and files an application memo
  for evaluation.
- Future memos → `memos/`, proposals → `proposals/`, transcripts → `transcripts/`.
- Spec-shape questions about `memodef:Transcript` go to the external
  `memodef-strategist` seat (coordinate, don't control).
