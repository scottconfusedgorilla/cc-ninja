# cc-ninja-cli + multi-Claude-tab routing — session closeout and learnings

**Session:** 2026-05-23, ccc-ninja-engineer + Director. Continuation of the broader cc-ninja arc; builds on the 2026-05-22 Claude For Chrome closeout.
**Outcome:** Shipped a fourth capture transport (standalone CLI) and fixed the role-id-per-Claude-tab problem in the VS Code extension. Pushed as commit `bfa4bac` with VS Code at v0.16.4.

## What shipped

- **[cli/](../../cli/)** — new subproject. `cc-ninja-capture` binary, zero runtime deps. Reads JSONL from `~/.claude/projects/<encoded-workspace>/`, emits envelope + body via `core/`. Editor-agnostic, so it covers Claude Code from any surface (CLI, the Claude Code desktop GUI, or any Claude-Code-aware IDE) — anywhere the JSONL writes are happening. `--include-subagents` walks `<parent-uuid>/subagents/*.jsonl` and emits a separate transcript per subagent, with role-id suffixed `<parent-role>--<agent-id>`.
- **[core/](../../core/) expanded** — `parseTranscript` and `formatAsMarkdown`/`formatAsPlainText` moved out of `vscode/src/` into `core/src/`, so the new CLI and the existing VS Code extension share them via the sync-core build trick. `htmlFormatter.ts` stays in vscode/ (it's vscode-flavored).
- **[vscode/](../../vscode/) v0.16.0–v0.16.4** — multi-Claude-tab routing fix and naming polish. Detail in [vscode/CHANGELOG.md](../../vscode/CHANGELOG.md); load-bearing learnings below.
- **`.gitignore` hardening** — `cli/src/core/` and `server/src/core/` added alongside the existing `vscode/src/core/` exclusion. Build copies of `core/src/`, never source of truth.

## The load-bearing learnings

### 1. Filesystem-read works for Claude Code (CLI + GUI). It does NOT work for Claude Desktop.

Both Claude Code CLI and the newer Claude Code desktop GUI write conversation JSONL to `~/.claude/projects/<encoded-workspace>/`, in the same format. So a single reader covers both, and our existing parser handles it without modification.

Claude Desktop (the Electron app at `%APPDATA%/Local/Packages/Claude_pzs8sxrjxfjjc/`) does NOT write conversation history to disk in any usable form. The IndexedDB only stores the user's in-progress message draft, autosaved per keystroke — actual sent messages and assistant responses live on Anthropic's servers, fetched per-load. The filesystem-read approach that worked for Claude Code does not translate. For Claude Desktop capture we'd be back to DOM-scrape via DevTools, same as the C4C Sidepanel.

(Documented in the prior 2026-05-22 Electron capture-gap note.)

### 2. Multiple Claude chat tabs per workspace is now solvable for role-id, not for JSONL.

The user case: caliper workspace with both `caliper-strategist` and `caliper-engineer` Claude chat tabs open, each conceptually a different seat. VS Code's `workspaceState` only holds one role-id per workspace, so both saves were routing to the same folder.

**What worked:** the active Claude tab's label is reliably available as `vscode.window.tabGroups.activeTabGroup.activeTab.label`. We identify Claude chat tabs by `input.viewType === "mainThreadWebview-claudeVSCodePanel"`. When the active tab is a Claude chat AND its label is a valid role-id slug (`^[a-z0-9][a-z0-9-]*$`), we use the label as the role-id — overriding workspaceState. This means renaming Claude tabs is now the user-facing mechanism for declaring a seat. (v0.16.0)

**What didn't work — and we accepted the gap:** matching a specific Claude tab to its specific JSONL file. The chrome.debugger investigation confirmed Anthropic.claude-code v2.1.145 publishes `exports: undefined`, so there is no public API to query. We considered filesystem watching, quick-pick fallback, and a conversation-side marker — Director chose option D (accept the limitation, document it). The folder is correctly routed by tab focus, but the content captured is always "the newest JSONL in the encoded folder." In the dominant case (you focus a tab right after typing in it) they align; in the edge case (you focus a tab without typing in it and immediately save) they diverge. Documented in vscode/README.md "Known limitations" and in the [[multi-claude-tab-jsonl-gap]] memory.

### 3. Naming should match the dominant signal, not the convenience.

I initially renamed the command to "Save Focused Chat" thinking focus was the primary signal. Director caught the error: focus determines the *folder*, but the *content* (the part the user actually cares about) comes from JSONL recency — "the chat with the latest output." Renamed again to "Save Most Recent Chat" in v0.16.4. The lesson holds beyond this command: when an action draws on two signals, name it after the one that determines the load-bearing output, not the one that determines a derived field.

### 4. Build-time copies of shared source need to be gitignored from day one.

The sync-core trick (copy `core/src/` into each consumer's `src/core/` at build time) is clean for everything except git: without an ignore rule, the build copies get committed, then every subsequent `npm run build` produces a diff against itself. The first commit of this PR almost included `cli/src/core/` and `server/src/core/` as new files (alongside the existing `vscode/src/core/` exclusion I'd already added). Caught it during git status review; fix was three lines of `.gitignore`. **Whenever introducing a build-time-copy pattern, gitignore the destination immediately, not after the first build.**

### 5. Diagnostic commands MUST surface the running version.

Filed as a separate MUST in [[cc-ninja-versioning-discipline]]. Reason: during the multi-Claude-tab debugging I repeatedly repackaged without bumping the version. Both Director and I lost time investigating "did the install actually take?" when the answer wasn't visible from the running build. The fix is two-part: bump version on every package operation, AND print the version at the top of any diagnostic output. Now enforced in the diagnostic command itself, and the rule lives in memory for future sessions.

## Outstanding cosmetic items (carried from prior session, not blocking)

- `session_arc` reads `"claude-for-chrome session sidepanel.html"` for Sidepanel captures because `extractSessionId` grabs the last path segment instead of the `?tabId=` query param. Cosmetic, fix is one function.
- `subject` is frozen on envelope creation; if a session gets cleared and reused under the same identifier, original subject sticks. Edge case.
- Multi-Claude-tab JSONL ambiguity (above). Accepted as documented behavior.

## Open items for the next session

- Claude Desktop capture: if/when it becomes pressing, the DevTools-snippet pattern from the C4C Sidepanel is the ready-made template. Anthropic's CSP on Claude Desktop is the open question — if it matches the Sidepanel's, the same relay-via-URL-hash trick works directly.
- CLI distribution: currently the user runs it via `node out/index.js`. For broader use, `npm link` or `npm publish` would make `cc-ninja-capture` available globally. Not urgent.
- Subagent trace ergonomics: the CLI emits one transcript per subagent, with role-id `<parent>--<agent-id>`. Currently the agent IDs are unhelpful UUIDs (e.g. `agent-a17bb2b1e7fe4c87a`). The sibling `.meta.json` likely has a human-readable agent name we could use instead — partially implemented but not verified against real meta.json files.
- Cleanup pass on older envelopes that still say `capture_tool: ccc-ninja@...` from the pre-rename era. New emissions are correct.

## What the work shape continues to prove

Adding the CLI brought the transport count to four (vscode/cli/server-via-extension/server-via-snippet), with a single shared envelope shape and a single shared emitter. The transport-agnostic split in `core/` keeps doing what it should — each new consumer derives the transport-specific bits and hands the rest to the same code path. The next transport (Claude Desktop, or anything else) plugs in the same way.
