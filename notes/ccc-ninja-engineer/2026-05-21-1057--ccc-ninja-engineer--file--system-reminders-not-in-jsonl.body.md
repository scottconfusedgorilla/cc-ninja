# Claude Code does not persist system-reminders to JSONL

**Filed:** 2026-05-21 by ccc-ninja-engineer (claude-opus-4-7)
**Context:** Diagnosis filed after caliper-strategist's QA report flagged that v0.14.0's claim of "system-reminder rendering" produced zero captures in real-world use. Cross-references: [[transcript-session-boundary-design]] for earlier ccc-ninja design notes.

## The claim that turned out wrong

v0.14.0 added two pieces of code:
- [parser.ts:extractSystemReminders](../../src/parser.ts) — pulls `<system-reminder>...</system-reminder>` blocks out of user message text
- [formatter.ts](../../src/formatter.ts) and [htmlFormatter.ts](../../src/htmlFormatter.ts) — render those reminders distinctly with a 🛎️ glyph

The model was: Claude Code injects system-reminders into user messages (we observe them in our context), so they must be in the JSONL, so we can extract and render them.

**That model was wrong.** Direct inspection of the session JSONL revealed that system-reminders are runtime-only — delivered to the model in context but never persisted to disk.

## Empirical evidence

For ccc-ninja's own session JSONL (`~/.claude/projects/s--Projects-ccc-ninja/9103a7c6-...jsonl`):

- 41 grep hits for the literal string `<system-reminder>`
- 0 of those hits in user message content (string or text-block)
- All 41 were inside tool input/output payloads: Bash command args, Edit `new_string`/`originalFile`, TodoWrite todo descriptions — places where the engineer (me) had written the literal text while authoring code or running diagnostic commands
- Search for `"TodoWrite tool hasn"` (the canonical opening of a TodoWrite reminder, which had fired many times in the session): 1 hit, again inside a Bash command
- Full key enumeration of the JSONL schema: no field named anything like `reminder`, `system`, `hook`, or `inject`

For caliper-strategist's session: similar — 20 grep hits, all in conversation text or shell commands, no actual reminder captures despite ~37 TodoWrite reminders firing in the session.

## What this means

The transient nature of system-reminders is consistent with how Claude Code's tool-use loop works: the harness *constructs* the conversation it sends to the model on each turn, adding reminders contextually based on whatever heuristics the harness decides matter (e.g., "TodoWrite hasn't fired recently"). The constructed message is what the model sees, but only the user's actual input and the model's actual response get persisted to JSONL.

Anything injected by the harness — system-reminders, `<ide_opened_file>`, `<command-name>`, `<user-prompt-submit-hook>`, `<local-command-stdout>` — has different persistence behavior. Some are persisted (as part of user text content), some aren't. The persistence model is opaque from outside Claude Code.

## What to do with the code

**Leave it in place.** The cost is near-zero (a regex run against each user message that always matches nothing). The benefit is that if/when Claude Code changes its persistence model to include reminders — or if a sidecar source becomes available — no downstream changes are needed. The extractor pushes `system_reminder` role messages; the formatters render them; the whole pipeline is intact and ready.

A comment in parser.ts now explains this explicitly so future-me doesn't rip it out as "dead code."

## What NOT to do

- **Don't try to reconstruct reminders from heuristics.** Tempting: "I know TodoWrite reminders fire after N tool uses without TodoWrite; I could synthesize them." Don't. Synthesizing context injections from inferred rules creates a false audit trail. If a reminder fired and altered the assistant's behavior, that's load-bearing — and we don't actually know when one fired without ground truth.
- **Don't grep JSONLs for `<system-reminder>` and treat hits as reminders.** Most hits are false positives (the literal text appearing inside tool payloads).
- **Don't bump the schema or invent new envelope fields** to track "missing reminders." The transcript is what was recorded; gaps are the truth of what was recorded.

## Implications for the transcript audit-trail purpose

Decisions documented in memos can cite transcripts as the verbatim source. If a decision was influenced by a system-reminder, that influence is *not visible* in the transcript. This is a known gap. Citers should phrase carefully: "the transcript shows the conversation the AI participated in, modulo non-persisted harness injections."

If this gap becomes a real problem in practice — e.g., a decision audit can't be reconstructed because a critical reminder isn't in the body — that'd be motivation to ask Anthropic for a persistence-mode change, OR to build a custom Claude Code wrapper that does persist reminders. Out of scope for ccc-ninja today.

## Cross-references

- caliper-strategist QA report (2026-05-21) — incoming feedback that triggered this investigation
- v0.14.0 changelog entry — initial (incorrect) implementation claim
- v0.14.3 changelog entry — corrected understanding
- [[transcript-session-boundary-design]] — earlier ccc-ninja design notes

— ccc-ninja-engineer
