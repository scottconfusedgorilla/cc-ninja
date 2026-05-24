# Changelog

## 0.16.6 — remove "Copy This Session" command

Removed the **CCNinja: Copy This Session** command (`ccNinja.copyThisSession`). It was an older quick-action that auto-grabbed the newest JSONL, formatted it, and showed an HTML preview — useful before the memodef:Transcript flow landed, but now redundant with **Save Most Recent Chat** (which writes the canonical artifact) and **Visual Preview** (which renders the last-formatted output). Anyone with a keybinding pointing at `ccNinja.copyThisSession` will need to rebind.

## 0.16.5 — short-form name "CC Ninja" → "CCNinja"

Visual/branding tweak — close the space in the short-form name used throughout the UI. Toast prefixes, status bar text, output channel name, command palette titles, READMEs all updated. Package identifier (`cc-ninja`), command IDs (`ccNinja.*`), and `displayName` ("Chat Copier Ninja") are unchanged — this only affects user-visible short-form mentions.

## 0.16.4 — rename "Focused Chat" → "Most Recent Chat"

The 0.16.3 names overstated what focus determines. The folder name comes from the focused tab's label, but the actual *content* captured is whichever Claude JSONL was most recently modified — i.e. the chat that just had output. "Most Recent Chat" is honest to the dominant signal (JSONL recency), and reads as a verb a user would naturally invoke right after a response lands.

- **Command palette:**
  - `ccNinja.updateSessionTranscript`: "Save Focused Chat as Transcript" → **"Save Most Recent Chat"**
  - `ccNinja.finalizeSessionTranscript`: "Finalize Focused Chat Transcript" → **"Finalize Most Recent Chat"**
- **Status bar text:** "Save Focused Chat" → **"Save Most Recent Chat"**
- **Tooltip:** updated to describe both signals — content from newest JSONL, folder from focused tab's label (or workspace default role-id).

## 0.16.3 — rename commands to lead with "Focused Chat"

The "Update Session Transcript" command name read as if there was a single ambient session being saved, but the save actually depends on which tab is focused (since v0.16.0). Renamed to make the dependency on focus visible at the call site — harder to invoke with the wrong tab focused if the command itself says "Focused Chat."

- **Command palette titles:**
  - `ccNinja.updateSessionTranscript`: "Update Session Transcript" → **"Save Focused Chat as Transcript"**
  - `ccNinja.finalizeSessionTranscript`: "Finalize Session Transcript" → **"Finalize Focused Chat Transcript"**
- **Status bar text:** "Update Transcript" → **"Save Focused Chat"**
- **Status bar tooltip:** rewrites to explain the role-id-from-focused-tab behavior.

Command IDs are unchanged, so any existing keybindings continue to work.

## 0.16.2 — diagnostic robustness fix

- Fix crash in **CCNinja: Show Active Tab Info** when an extension's `exports` is undefined (the indent helper tried `undefined.split("\n")`). Also prints `exports (typeof)` and `exports keys` for the rare case where `exports` is a non-stringifiable object so we can still see the shape.
- Empirical finding from running this against Anthropic.claude-code v2.1.145: `exports` is undefined, so there is no public extension API to query for tab → session mapping. Recording the result for future reference.

## 0.16.1 — diagnostic extended to probe Claude Code extension API

- **CCNinja: Show Active Tab Info** now also dumps any installed extension whose id or displayName matches `/claude|anthropic/`: id, version, isActive, publisher, contributed commands (first 30), and the `exports` object returned from its `activate()`. Used to discover whether the Claude Code extension publishes an API that lets us match tab → session UUID deterministically (instead of the current "newest JSONL in folder" heuristic).

## 0.16.0 — multi-Claude-tab routing + shared core/

**New:**
- Auto-detect role-id from the active Claude Code chat tab's label. When the focused tab is a Claude chat webview (identified by `viewType === "mainThreadWebview-claudeVSCodePanel"`), its tab label becomes the role-id for the capture — overriding the workspaceState fallback. Enables multiple Claude chats per workspace, each routing to its own seat folder.
- New diagnostic command **CCNinja: Show Active Tab Info** — dumps the active tab's label, input class, and viewType to a "CCNinja Diagnostics" output channel. Includes the running extension version at the top so you can verify which build is loaded.

**Refactor:**
- `parseTranscript` and `formatAsMarkdown`/`formatAsPlainText` moved out of `vscode/src/` into `core/` so the new `cli/` subproject (sibling to `vscode/`, `server/`, `claude-for-chrome/`) can consume them. No behavior change for the VS Code extension; `htmlFormatter.ts` stays in vscode/ since it's vscode-flavored.

## 0.15.0 — project rename + monorepo restructure

**Breaking changes:**
- Project renamed from `ccc-ninja` (Claude Code Copier Ninja) to `cc-ninja` (Chat Copier Ninja). Reflects the project's actual scope: capturing AI chat transcripts across platforms, not just Claude Code
- All command IDs renamed `cccNinja.*` → `ccNinja.*`. Keybindings referencing the old IDs need to be updated
- Extension identifier changed: `scottconfusedgorilla.ccc-ninja` → `scottconfusedgorilla.cc-ninja`. Uninstall the old extension and install the new one — they don't auto-upgrade across identifier changes
- Repository moved: `github.com/scottconfusedgorilla/ccc-ninja` → `github.com/scottconfusedgorilla/cc-ninja`

**Non-breaking:**
- One-shot migration of workspaceState keys (`cccNinja.roleId` → `ccNinja.roleId`, etc.) on first activation, so existing role-id, director identity, and last-transcript-path persist across the rename
- Existing transcripts and notes under the `ccc-ninja-engineer/` role-id are left unchanged — they're audit-trail artifacts and shouldn't be rewritten. New captures use `cc-ninja-engineer/` (or whatever role-id you set going forward)

**New monorepo layout:**
- `vscode/` — the existing extension (this is what got renamed)
- `claude-for-chrome/` — placeholder for a content-script extension targeting claude.ai (v0.16+)
- `server/` — placeholder for a localhost HTTP bridge that writes memodef:Transcript artifacts to a git repo on disk (v0.16+)

## 0.14.3

- **Documentation of a finding from caliper-strategist 2026-05-21:** the v0.14.0 system-reminder extractor + renderer is correctly wired but never finds work to do, because Claude Code does not persist `<system-reminder>` injections to the session JSONL. They are transient runtime context — delivered to the model but never written to disk. A grep through both the ccc-ninja and caliper session JSONLs found zero reminder injections in user content (all hits were in tool inputs/outputs where the literal string had been written by the author). Code left dormant for future-proofing; comment added in [parser.ts](src/parser.ts) explaining the situation

## 0.14.2

- **Fixes stuck-spinner bug** caught by Director 2026-05-21. The status bar item's text was being mutated during interactive prompts and git lookups, which left the spinner appearing wedged whenever a prompt was waiting on user input. Now uses `vscode.window.withProgress` for the file-work phase only — auto-cleans up on completion or error — and all prerequisite prompts run before the progress indicator appears. The persistent button label stays "Update Transcript" throughout

## 0.14.1

- **Status bar button rebound** to `cccNinja.updateSessionTranscript` and renamed to "Update Transcript" (was "Copy current Claude Code session transcript" pointing at the v0.7 quick-action)
- **Status bar tooltip** now shows the path of the last-captured transcript when one exists; persists across reloads via workspaceState
- **Defensive 2 s timeout** on the `git config user.email` lookup added in v0.14.0, to prevent the status bar spinner from getting stuck if the git binary is missing or hangs

## 0.14.0

Acts on QA feedback from caliper-strategist 2026-05-21 (three issues found while using ccc-ninja@0.13.1 for real).

- **Human participant in `participants[]`.** Transcripts now declare both sides of the conversation. Director identity is auto-inferred from `git config user.email` (preferred) or OS username (fallback), persisted per-workspace, no prompt required
- **`<system-reminder>` blocks rendered distinctly.** Previously these harness signals were mashed into the user message text. Now extracted from user content, surfaced as a separate role with 🛎️ glyph in markdown and a muted monospace box in the HTML view
- **Image placeholders.** When the user pasted a screenshot, the body showed nothing where the image was. Now emits `[Image: <media-type>, ~<N> KB]` so a future reader knows an image was present in the original exchange
- **`CCCNinja: Set Role-id for This Workspace` command** + role-id surfaced in the success toast — defensive UX for the typo case (`caliper-strategis` slipping in for `caliper-strategist`). The 17-char "truncation" caliper-strategist observed is not a code path in ccc-ninja; the input validator accepts any well-formed lowercase identifier. The new command lets you correct a mistyped role-id without hand-editing workspaceState

## 0.13.1

- **Bug fix:** `findNewestTranscript()` now scopes the search to the current workspace's encoded subfolder under `~/.claude/projects/` (e.g. `s:/Projects/thingalog` → `s--Projects-thingalog`). Previously it picked the globally newest `.jsonl` from any project, which could land a transcript from an unrelated session into the current workspace's `transcripts/` folder. Caught by thingalog-strategist 2026-05-20.

## 0.13.0

Acts on three refinements filed by memodef-strategist (memo 2026-05-20-1955) after seeing the first v0.12.0 emissions in the wild.

- **Subject derivation** now skips harness/system XML tag injections (`<ide_opened_file>`, `<system-reminder>`, `<command-name>`, etc.) when picking the subject anchor — walks forward to the first user turn whose content does not begin with `<`. Subjects (and the filename slugs derived from them) are now scannable
- **`ended` field** is no longer set on every snapshot. `Update Session Transcript` leaves it absent on creation and preserves any prior value on update. The new **`CCCNinja: Finalize Session Transcript`** command stamps `ended` to the last message timestamp on detected close. Honors the append-mode design: the envelope's only mutable field is `ended`, set exactly once
- **Working-repo root detection**: transcripts now write to the first directory walking shallowly from the workspace root that contains `CLAUDE.md` plus a recognizable spec marker (`SCHEMA.md`, `memos/`, `decisions/`, `notes/`, or `transcripts/`). Falls back to workspace root if not found. Fixes the case where `memodef-spec` (the GitHub repo root) is the workspace folder but `memodef-spec/memodef/` is the actual working-repo root

## 0.12.1

- Cosmetic: `ended` field now appears in canonical position (between `started` and `subject`) on both create and update paths
- Cosmetic: `metadata.source_jsonl` is stored with forward slashes for cross-platform readability; lookup tolerates either separator so existing envelopes still match

## 0.12.0

- Add `CCCNinja: Update Session Transcript` command — emits a `memodef:Transcript` envelope (`.openthing`) plus sibling `.body.md` per the memodef-spec v0.4 proposal, into `transcripts/<role-id>/` in the workspace root
- Role-id is prompted on first use and remembered per-workspace via `workspaceState`
- Same-day same-source JSONL invocations update the existing transcript in place (regenerate body, refresh `ended` timestamp); otherwise a fresh pair is created

## 0.1.0

- Initial release
- Parse Claude Code JSONL transcripts
- Format as Markdown with speaker labels, timestamps, and code blocks
- Copy to clipboard, save as .md or .txt
- Auto-discover transcripts in ~/.claude/projects/
- Optional tool call inclusion
