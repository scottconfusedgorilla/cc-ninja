# Changelog

## 0.13.1

- **Bug fix:** `findNewestTranscript()` now scopes the search to the current workspace's encoded subfolder under `~/.claude/projects/` (e.g. `s:/Projects/thingalog` → `s--Projects-thingalog`). Previously it picked the globally newest `.jsonl` from any project, which could land a transcript from an unrelated session into the current workspace's `transcripts/` folder. Caught by thingalog-strategist 2026-05-20.

## 0.13.0

Acts on three refinements filed by memodef-strategist (memo 2026-05-20-1955) after seeing the first v0.12.0 emissions in the wild.

- **Subject derivation** now skips harness/system XML tag injections (`<ide_opened_file>`, `<system-reminder>`, `<command-name>`, etc.) when picking the subject anchor — walks forward to the first user turn whose content does not begin with `<`. Subjects (and the filename slugs derived from them) are now scannable
- **`ended` field** is no longer set on every snapshot. `Update Session Transcript` leaves it absent on creation and preserves any prior value on update. The new **`CCC Ninja: Finalize Session Transcript`** command stamps `ended` to the last message timestamp on detected close. Honors the append-mode design: the envelope's only mutable field is `ended`, set exactly once
- **Working-repo root detection**: transcripts now write to the first directory walking shallowly from the workspace root that contains `CLAUDE.md` plus a recognizable spec marker (`SCHEMA.md`, `memos/`, `decisions/`, `notes/`, or `transcripts/`). Falls back to workspace root if not found. Fixes the case where `memodef-spec` (the GitHub repo root) is the workspace folder but `memodef-spec/memodef/` is the actual working-repo root

## 0.12.1

- Cosmetic: `ended` field now appears in canonical position (between `started` and `subject`) on both create and update paths
- Cosmetic: `metadata.source_jsonl` is stored with forward slashes for cross-platform readability; lookup tolerates either separator so existing envelopes still match

## 0.12.0

- Add `CCC Ninja: Update Session Transcript` command — emits a `memodef:Transcript` envelope (`.openthing`) plus sibling `.body.md` per the memodef-spec v0.4 proposal, into `transcripts/<role-id>/` in the workspace root
- Role-id is prompted on first use and remembered per-workspace via `workspaceState`
- Same-day same-source JSONL invocations update the existing transcript in place (regenerate body, refresh `ended` timestamp); otherwise a fresh pair is created

## 0.1.0

- Initial release
- Parse Claude Code JSONL transcripts
- Format as Markdown with speaker labels, timestamps, and code blocks
- Copy to clipboard, save as .md or .txt
- Auto-discover transcripts in ~/.claude/projects/
- Optional tool call inclusion
