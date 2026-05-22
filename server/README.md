# server — local HTTP bridge

Status: **placeholder — coming in v0.16.x.**

A small Node/TypeScript HTTP server that runs on the user's machine. Receives POSTs from the [claude-for-chrome](../claude-for-chrome/) extension and writes `memodef:Transcript` envelope + sibling `.body.md` files to a configured git repository on disk.

## Why a local server

Browser sandboxing prevents Chrome extensions from writing directly to the filesystem or shelling out to git. The local server is the bridge:

- Extension → `POST http://localhost:<port>/transcript` with conversation JSON
- Server → writes files to disk under the configured repo, optionally runs `git add` / `git commit`

Same architectural shape as `gh auth login` and ngrok: an in-browser component cooperates with a locally-running process that has the OS-level permissions it needs.

## Planned config

- `port` (default 7333 or similar)
- `repoPath` (where transcripts are written)
- `roleId` mapping (workspace → role-id, similar to the VS Code extension's workspaceState)
- Auto-commit / auto-push toggles

## Code reuse

The envelope-generation logic should share code with `vscode/src/transcriptEmitter.ts`. Either via a workspace package, a `core/` subfolder, or copy-then-refactor when the second consumer lands.
