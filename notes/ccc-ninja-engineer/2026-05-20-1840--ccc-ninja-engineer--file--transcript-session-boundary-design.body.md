# Transcript session-boundary design

**Filed:** 2026-05-20 by ccc-ninja-engineer (claude-opus-4-7-1m)
**Context:** Design conversation with Director that arose from reviewing the memodef-spec v0.4 proposal ([2026-05-20-transcript-type-and-folder-convention.md](../../../memodef-spec/memodef/proposals/2026-05-20-transcript-type-and-folder-convention.md)). The proposal adds `memodef:Transcript` as a new memodef type with `transcripts/<role-id>/` folder convention and names ccc-ninja as a reference capture-tool implementation. Director wants ccc-ninja to emit `memodef:Transcript` envelope + sibling `.body.md` pairs.

## The question this memo answers

**When should ccc-ninja rotate transcripts?** A Claude Code session in VS Code has no clean lifecycle event. The window can be open for hours or days; the user can pivot topics inside a single tab; the window can die without a close signal. We need a rule for "this is a new transcript" so we don't end up with one giant `.body.md` per project.

## Three session boundaries

A transcript closes (and a new one opens) on any of:

1. **Tab label changes.** When the VS Code tab title changes — either because the user renamed it deliberately or Claude Code auto-regenerated it based on conversation drift — that's a strong signal of a topic shift. Treat both flavors the same: end the current transcript, start a new one with the new label as `subject`.

2. **Tab closes.** The natural end of a session. Set `ended` on the envelope, finalize the `.body.md`.

3. **Calendar day rollover.** If `today > transcript.started.date()` (local time), rotate. The user thinks in local time; a session that runs from 11:55 PM to 12:05 AM probably means "went to bed and came back," not "same session." Local time is the right choice — the 5-minute-over-midnight edge case is exactly the boundary this rule was designed to catch.

## Implementation notes

- **Tab events** are accessible via `vscode.window.tabGroups.onDidChangeTabs`. The event fires on open, close, label-change, and move. Filter to the Claude Code webview tabs by checking `tab.input instanceof vscode.TabInputWebview` and inspecting `viewType`.

- **Day rollover does not need a timer.** Check lazily on append: when ccc-ninja goes to write a new exchange into the `.body.md`, compare today's date to the transcript's `started` date and rotate if they differ. Cheaper, no timer drift, no idle wakeups.

- **Tab label as `subject`** — the live tab label is a reasonable initial value for the `subject` field. It's user-visible and roughly correlates with topic. Not a source of truth — the user can edit later, and the spec only requires `subject` to be set, not stable across the life of the transcript. Set it once at transcript creation from whatever the tab label is at that moment.

- **`<role-id>` in the filename and folder.** The spec's filename pattern is `YYYY-MM-DD-HHMM--<primary-role-id>--<short-subject>.openthing` and storage is `transcripts/<role-id>/`. Claude Code JSONL doesn't carry a memodef role identifier. ccc-ninja will need to either prompt the user, infer from project cwd, or default to a placeholder (`unknown-role`?). Open question — flag this when implementing.

- **Append-mode for `.body.md`.** The envelope is written once and immutable except for `ended`. The `.body.md` grows. Strategy options: (a) regenerate from JSONL on each rotation/save, or (b) append the latest exchanges incrementally. Director noted this is ambiguous in the spec text. Suggest **append-only** because regeneration would clobber any human annotations to the `.body.md`. If the JSONL has new exchanges, we read from the offset we last appended-to.

## Boundaries that aren't boundaries

- **Long pauses** (e.g., user closes laptop for 2 hours then resumes) — not a boundary. If the tab is still open, the label hasn't changed, and we're still on the same calendar day, it's the same session.
- **Mid-conversation topic shifts** without a tab rename — not a boundary. The user can rename if they want a split; we don't try to detect topic drift ourselves.

## Open questions for future ccc-ninja work

1. **Source of `<role-id>`.** Prompt? Infer from cwd? Map project paths to role-ids via a config file? Default placeholder?
2. **Source of `<primary-role-id>` for multi-role conversations.** The spec says "primary role's folder, secondaries in participants[]." How does ccc-ninja know? Probably: the role whose folder we're writing into is by definition primary. So this collapses into question 1.
3. **Append vs regenerate** — confirm with Director before implementation. Leaning append, but spec text is ambiguous.
4. **Tab label changes mid-session via auto-rename.** Should we ignore rapid successive label changes (e.g., debounce 5 seconds) to avoid creating tiny transcripts when Claude Code is hunting for a title? Probably yes.
5. **What identifies "a Claude Code tab"?** `TabInputWebview.viewType` needs investigation — what's the actual viewType string Claude Code's extension uses?

## Cross-references

- memodef-spec v0.4 proposal: [2026-05-20-transcript-type-and-folder-convention.md](../../../memodef-spec/memodef/proposals/2026-05-20-transcript-type-and-folder-convention.md)
- OAGP overview: https://oagp.org
- ccc-ninja repo (this project): https://github.com/scottconfusedgorilla/ccc-ninja

— ccc-ninja-engineer
