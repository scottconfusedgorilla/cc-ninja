# Chat Copier Ninja (CC Ninja)

Capture, format, and save AI chat transcripts as durable, git-tracked artifacts.

CC Ninja produces `memodef:Transcript` envelope + sibling `.body.md` pairs per the [memodef-spec v0.4 proposal](https://github.com/scottconfusedgorilla/memodef-spec). Each transcript is a verbatim recording of a conversation, addressable by file path and queryable like any other file in your repo. Use them for snippet retrieval (books, presentations, citations), lost-window recovery, and audit-trail pinning against decisions documented elsewhere.

Originally built as a VS Code extension for Claude Code (when the project was named `ccc-ninja` — Claude Code Copier Ninja). Renamed and restructured in v0.15.0 to span multiple platforms.

## Components

| Component | Status | Target platform |
|---|---|---|
| [`core/`](core/) | Shipping (v0.16.0) | Transport-agnostic envelope emitter shared by the other components |
| [`vscode/`](vscode/) | Shipping | Claude Code (reads `~/.claude/projects/*.jsonl`) |
| [`server/`](server/) | Shipping (v0.16.0) | Localhost HTTP bridge — receives POSTs from the Chrome extension, writes git-tracked files |
| [`claude-for-chrome/`](claude-for-chrome/) | Shipping (v0.16.0) | Claude For Chrome at `claude.ai` (DOM scrape via content script) |

Each component emits the same `memodef:Transcript` artifact shape, so transcripts from different platforms compose with the rest of the memodef family (catalogs, cross-references, conformance fixtures).

## Why three components

Browser sandboxing prevents the Chrome extension from writing directly to disk or shelling out to git. The local server is the bridge — same architectural shape as `gh auth login` or ngrok. The VS Code extension has filesystem access natively, so it writes directly.

```
Claude Code session       (VS Code workspace)
        │
        ▼
~/.claude/projects/*.jsonl
        │
        ▼
  vscode/ extension  ──────────────►  repo/transcripts/<role-id>/

Claude For Chrome session (claude.ai)
        │
        ▼
   DOM in claude.ai tab
        │
        ▼
claude-for-chrome/ extension  ──POST──►  server/ (localhost)
                                              │
                                              ▼
                                  repo/transcripts/<role-id>/
```

## Quick start (VS Code extension)

See [`vscode/README.md`](vscode/README.md) for installation, command reference, and usage.

## Project context

- [OAGP](https://oagp.org) — the four-spec family CC Ninja's artifact shape is governed by
- [memodef-spec](https://github.com/scottconfusedgorilla/memodef-spec) — the spec governing `memodef:Transcript` shape
- This project is the reference capture-tool implementation cited by the v0.4 spec proposal

## License

MIT
