# OAGP Bootstrap Proposal — CCNinja

**Date:** 2026-05-26
**Drafted by:** AI peer in the bootstrap-helper capacity (`ccninja-bootstrap-strategist`)
**Status:** RATIFIED 2026-05-26 with amendments — awaiting explicit "instantiate" go-ahead
**Companion artifact (post-instantiate):** `org/ccninja-organization.opencatalog`

---

## Ratification decisions (2026-05-26, Director)

1. **Position naming:** prefixed, but **dashless project prefix** — `ccninja-`,
   not `cc-ninja-`. Canonical OAGP id is **`ccninja`**. (Git repo + npm packages
   remain `cc-ninja`; only the OAGP identifier layer goes dashless.)
2. **AI-seat status:** **staffed** (both Strategist and Engineer get AI incumbent
   blocks).
3. **Canonical engineer role-id:** **`ccninja-engineer`**. Lineage: originally
   *Claude Code Copier* → `ccc-ninja` (Claude Code Copier Ninja) → `cc-ninja` →
   `ccninja`. Existing `cc-ninja-engineer` / `ccc-ninja-engineer` transcript
   folders stay as historical seat records.
4. **Portfolio-CLAUDE.md MUSTs:** agreed — CCNinja's charter **explicitly
   reconciles/exempts** the misfitting portfolio MUSTs (see section below).
5. **vision:** accepted as drafted ("fine for now" — provisional).
6. **`notes/`:** a valid substrate folder for notes-to-self artifacts; recognized.

`v1_success_criterion` remains provisional (Director may revise); not blocking.

---

## Ratified orgdef

```json
{
  "catdef": "1.4",
  "orgdef": "1.0.0",
  "type": "orgdef:Organization",
  "id": "ccninja",
  "name": "CCNinja",
  "version": "1.0.0",
  "mission": "CCNinja captures, formats, and saves AI chat transcripts as durable, git-tracked memodef:Transcript artifacts (envelope + sibling .body.md), across multiple AI surfaces — Claude Code (VS Code extension and standalone CLI) and Claude For Chrome (via a local HTTP bridge). It is the reference capture-tool implementation cited by the memodef-spec v0.4 transcript proposal.",
  "vision": "Every AI conversation worth keeping becomes a durable, addressable, queryable artifact in your own repository — from any AI surface — composing with the rest of the memodef/OAGP substrate family (catalogs, cross-references, conformance fixtures).",
  "scope": "IN scope: capturing conversations from supported surfaces; the transport-agnostic envelope emitter (core/); per-transport adapters; secret redaction; the on-disk transcripts/<role-id>/ layout; notes/ for seat notes-to-self. OUT of scope: authoring or governing the memodef spec itself (that belongs to the memodef-spec org / memodef-strategist); analyzing, summarizing, or transforming transcript content beyond faithful capture; operating a hosted/cloud service (CCNinja is local, repo-resident tooling).",
  "governance_model": "Product-Owner-led with bounded AI authority. The Director (human Product Owner, Scott Edsby) holds final authority on direction, scope, merges, and pushes. The Strategist (AI seat) drafts strategy and architectural proposals for the Director to ratify. The Engineer (AI seat, role-bound to senior-project-oriented-software-engineer) implements, runs builds, and commits/pushes with explicit per-session Director go-ahead. The org coordinates with — but does not control — the memodef-spec org for transcript-shape spec changes.",
  "values": [
    { "name": "capture-fidelity-in-the-harness-not-the-model", "description": "Transcripts are captured by reading the source of truth (Claude Code JSONL, or the page DOM) in the harness. The model never narrates or reconstructs its own conversation. Slash-command and command-palette triggers shell out to the capture tool; they do not ask the model to serialize itself.", "rationale": "A model is a worse-than-faithful narrator of its own context (which is redacted/summarized). Fidelity must be structural, not best-effort." },
    { "name": "envelope-body-split", "description": "The .openthing envelope is the small indexable artifact; the .body.md is the regenerable content. The envelope is written once and the body grows; the only mutable envelope field is `ended`.", "rationale": "Append-mode operation preserves the record as a session grows — the design property the memodef:Transcript type was built around." },
    { "name": "transport-agnostic-core", "description": "All transports emit one shared envelope shape via one shared emitter in core/. Each consumer derives only the transport-specific bits and hands the rest to the same code path.", "rationale": "New surfaces plug in the same way; proven across four+ transports. A fix in core/ (redaction, subject derivation) benefits all of them at once." },
    { "name": "seat-over-incumbent", "description": "A transcript belongs to the seat (position), not the session. The durable thing is the seat's trajectory; the AI session is ephemeral. Renaming a Claude tab/session declares the seat.", "rationale": "Sessions are stateless and disposable; seats persist. Continuity is a record handed to a successor, not a live memory." },
    { "name": "secret-safety-by-default", "description": "Recognized secrets are redacted from transcript bodies on every save, with no opt-out, using a conservative high-confidence pattern set. The redactor surfaces what it masked so the user can rotate.", "rationale": "A capture tool whose output is committed to git must never launder a secret into history. Over-aggressive redaction is also a footgun (silent corruption of a fidelity record), hence conservative patterns." },
    { "name": "versioning-discipline", "description": "Bump the version on every release/package operation, and surface the running version at the top of diagnostic output.", "rationale": "Lost time during debugging when 'did the install actually take?' is not visible from the running build." }
  ],
  "red_lines": [
    { "rule": "Mandatory redaction, no opt-out. Recognized secrets are masked on every save; there is no disable flag. If a secret must be preserved verbatim, the user does it outside the tool.", "rationale": "A capture tool must never be the mechanism that launders a recognizable secret into git history." },
    { "rule": "Capture happens in the harness, not the model. No transport may have the model serialize or narrate the conversation; capture reads the source of truth.", "rationale": "Fidelity is structural. The model cannot be trusted as a faithful recorder of its own context." },
    { "rule": "No autonomous merges or pushes. The Engineer and Strategist commit and push only with explicit per-session Director go-ahead; work lands on a branch first.", "rationale": "Bounded authority." },
    { "rule": "No proprietary lock-in. CCNinja emits conformant memodef:Transcript artifacts against the open memodef spec; it does not invent a closed format. The artifact must remain readable by any peer and composable with the memodef family.", "rationale": "Portability of the record is the point. Lock-in would defeat the durable-artifact mission." },
    { "rule": "Version bump on every release + version surfaced in diagnostics.", "rationale": "Enforceable form of the versioning-discipline value." }
  ],
  "recommended_patterns": {
    "general": [
      { "pattern": "Director + AI Strategist + AI Engineer triad", "description": "A human Director (final authority, ratifier) paired with two distinct AI seats: a Strategist (drafts strategy/architecture proposals) and an Engineer (writes code, builds, ships).", "rationale": "Separating strategy from implementation forces artifact-producing strategy work onto its own track." },
      { "pattern": "Transport-agnostic capture core", "description": "A shared envelope emitter; each new surface derives only its transport-specific bits and reuses the shared write path.", "rationale": "New capture surfaces become adapters, not rewrites." },
      { "pattern": "Harness-side capture, model-as-trigger", "description": "A slash command / command-palette action triggers the capture tool, which reads the source-of-truth JSONL/DOM. The model pulls the trigger and reports; it never reconstructs the conversation.", "rationale": "Keeps faithfulness structural while still giving one-step ergonomics." },
      { "pattern": "Mandatory redaction at the emit chokepoint", "description": "The safety transform lives in the single shared write path (emitTranscript), so no caller/transport can route around it.", "rationale": "An invariant enforced at a chokepoint is structurally true, not procedurally hoped-for." },
      { "pattern": "Seat declared by session/tab name", "description": "Renaming the Claude tab (VS Code) or session (CLI /rename) declares the role-id/seat, which is captured into the artifact.", "rationale": "The conversation surface IS the seat declaration; no separate config needed." }
    ],
    "recommended_roles": [
      { "id": "ccninja-engineer", "role_definition_hint": "senior-project-oriented-software-engineer (roledef.org)" }
    ]
  },
  "v1_success_criterion": "[PROVISIONAL — Director may revise] CCNinja reaches v1 when: (a) all supported transports emit memodef:Transcript artifacts conformant to ratified memodef v0.4; (b) mandatory redaction covers the high-confidence secret set across every transport [DONE 2026-05-26]; (c) capture is one-step per surface (VS Code command, /ccninja-capture-chat for CLI, right-click/snippet for C4C); (d) the tools are distributable (vsix published, CLI npm-installable).",
  "relationships": [
    { "type": "reports_to", "from": "ccninja-strategist", "to": "director", "description": "Strategist drafts strategy and architectural proposals; Director ratifies." },
    { "type": "reports_to", "from": "ccninja-engineer", "to": "director", "description": "Engineer implements and ships; commits/pushes only with explicit per-session Director go-ahead." },
    { "type": "coordinates_with", "from": "ccninja-strategist", "to": "memodef-strategist", "description": "Consumes the memodef:Transcript shape spec (external org); does not control it. CCNinja is the reference implementation cited by the v0.4 proposal." }
  ],
  "items": [
    { "type": "orgdef:Position", "id": "director", "name": "Director", "status": "staffed", "incumbent": "Scott Edsby <scott@confusedgorilla.com>", "description": "Human Product Owner with final authority on direction, scope, merges, and pushes. Named 'director' to match the vocabulary used in transcript participant records." },
    { "type": "orgdef:Position", "id": "ccninja-engineer", "name": "Engineer", "status": "staffed", "role_definition": { "id": "senior-project-oriented-software-engineer", "version": "1.0.0", "url": "https://roledef.org/roledefs/senior-project-oriented-software-engineer.openthing" }, "description": "AI seat with delegated implementation authority: writes code, runs builds, ships. Has carried most of the project's build arc. Canonical role-id ccninja-engineer; legacy role-ids ccc-ninja-engineer (Claude Code Copier Ninja era) and cc-ninja-engineer remain as historical transcript folders.", "incumbent": { "kind": "ai", "session_arc": "Claude Code instances invoked from s:/projects/cc-ninja/. Active 2026-04 through 2026-05.", "portable": true, "portable_via": "https://roledef.org/roledefs/senior-project-oriented-software-engineer.openthing" } },
    { "type": "orgdef:Position", "id": "ccninja-strategist", "name": "Strategist", "status": "staffed", "description": "AI seat that drafts strategy, architectural proposals, and pattern memos for the Director to ratify.", "incumbent": { "kind": "ai", "session_arc": "Claude session in the cc-ninja workspace. Active 2026-05.", "portable": true } }
  ],
  "metadata": {
    "bootstrap_proposal": "proposals/oagp-bootstrap-2026-05-26.md",
    "substrate_folders": ["org/", "memos/", "proposals/", "transcripts/", "notes/"],
    "upstream_orgs": ["memodef-spec (memodef-strategist)"],
    "naming_note": "OAGP identifier layer is dashless (ccninja, ccninja-*). The git repo and npm packages remain cc-ninja / cc-ninja-cli / @cc-ninja/core / cc-ninja-server for now."
  }
}
```

---

## Constitutional reconciliation with the portfolio CLAUDE.md (ratified)

The portfolio `s:/projects/CLAUDE.md` declares several MUSTs that assume a
web app over a datastore. CCNinja is a TypeScript VS Code extension + CLI +
local bridge that writes files. The charter reconciles them as follows (this
text transplants into the project `CLAUDE.md` at instantiate):

- **Testing (pytest):** N/A as written (no Python). CCNinja's correctness gate
  is `tsc` compilation plus targeted `node` verification runs against real and
  synthetic fixtures. A TypeScript test runner (e.g. vitest) SHOULD be adopted
  when a standing unit-test suite is warranted; until then, do not deploy on a
  failing build/typecheck.
- **WCAG 2.1 AA / touch targets:** applies only to any future human-facing web
  UI. The current surfaces (CLI output, VS Code command + toasts) inherit VS
  Code's own accessibility. N/A until CCNinja ships a web UI.
- **Soft delete:** N/A — CCNinja performs no datastore CRUD. The analogous
  discipline is **append-mode / update-in-place** (envelope written once, body
  grows; match-on-key updates the same pair) and **no destructive git-history
  rewrites without Director authorization**.
- **Build numbers (`build NNN`):** replaced by **semver per component**
  (`@cc-ninja/core`, `cc-ninja` extension, `cc-ninja-cli`, `cc-ninja-server`),
  surfaced in diagnostic output and the `capture_tool` envelope stamp. The
  integer-build-number convention does not apply.

---

## Next steps

On your **"ratify and instantiate"**, I run Phase 4:
1. `org/ccninja-organization.opencatalog` — the charter above, markers stripped.
2. Ensure substrate folders (`memos/`, `proposals/`, `transcripts/`, `notes/`
   already exist; add `.gitkeep` where needed).
3. **Create** project `CLAUDE.md` (none exists) with red-lines-as-MUSTs, values,
   and the reconciliation section above.
4. File the bootstrap memo to the `ccninja-strategist` seat (`action_required: false`).
5. Stage everything; **push only on your explicit go-ahead.**
