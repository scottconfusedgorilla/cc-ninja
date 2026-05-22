# claude-for-chrome — content-script Chrome extension

Status: **placeholder — coming in v0.16.x.**

The Chrome extension component of [Chat Copier Ninja](../README.md). Captures Claude For Chrome (claude.ai) conversation transcripts via DOM observation and ships them to the [local HTTP server](../server/) for git-tracked persistence.

## Architecture

1. Content script attached to `claude.ai/*` watches the conversation DOM
2. Right-click context menu → "Save with CC Ninja" → POST to `http://localhost:<port>/transcript`
3. The local server (sibling project) receives the POST and writes `memodef:Transcript` envelope + sibling `.body.md` to the configured git repo

The right-click trigger is the v0.16 MVP. Auto-capture on tab-close, day-rollover, etc. is deferred until the manual flow is stable.

## Known constraints

- Targets `claude.ai` only — the Claude sidepanel (the Chrome extension Anthropic ships) runs in a sandboxed extension context that third-party extensions can't reach
- Tool-call structured records are not recoverable from the DOM; transcripts will be lossier on the tool-trace axis than Claude Code's JSONL-sourced captures

See the [v0.15.0 design discussion](../transcripts/) for the architectural reasoning.
