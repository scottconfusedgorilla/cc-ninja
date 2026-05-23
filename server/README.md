# server — local HTTP bridge

Status: **MVP shipped in v0.16.0.**

A small Node/TypeScript HTTP server that runs on the user's machine. Receives POSTs from the [claude-for-chrome](../claude-for-chrome/) extension and writes `memodef:Transcript` envelope + sibling `.body.md` files to a configured git repository on disk.

## Why a local server

Browser sandboxing prevents Chrome extensions from writing directly to the filesystem or shelling out to git. The local server is the bridge:

- Extension → `POST http://localhost:<port>/transcript` with conversation JSON
- Server → writes files to disk under `<projects-root>/<project>/transcripts/<position>/`

Same architectural shape as `gh auth login` and ngrok: an in-browser component cooperates with a locally-running process that has the OS-level permissions it needs.

## Build

```sh
cd server
npm install
npm run build
```

The build copies `core/src/` into `server/src/core/` (gitignored) so the shared envelope-emission logic is consumed directly by tsc — no symlinks, no separate package.

## Run

```sh
node out/index.js [--port 7333] [--projects-root s:/Projects]
```

Defaults:
- `--port 7333` (override with `CC_NINJA_PORT` env var)
- `--projects-root s:/Projects` (override with `CC_NINJA_PROJECTS_ROOT`)

The server resolves write destinations as `<projects-root>/<project>/transcripts/<position>/` — `project` and `position` come from the routing tag line in the conversation body.

## Endpoints

### `POST /transcript`

Accepts a JSON payload:

```json
{
  "conversationUrl": "https://claude.ai/chat/<uuid>",
  "startedAt": "2026-05-21T22:00:00.000Z",
  "endedAt": "2026-05-21T23:14:00.000Z",
  "bodyMarkdown": "## User\n\n…\n\n[project]=cc-ninja [position]=ccc-ninja-engineer [user]=scott@confusedgorilla.com\n\n## Assistant\n\n…",
  "title": "Optional title",
  "model": "claude-opus-4-7"
}
```

Required: `conversationUrl`, `startedAt`, `bodyMarkdown`. The body must contain a routing-tag line:

```
[project]=<project> [position]=<role-id> [user]=<identity>
```

All three keys on the same line — eliminates false positives from prose mentioning one key in passing. If multiple tag lines are present, the **last one wins** (the user can redirect mid-conversation).

Response on success:
```json
{
  "envelopePath": "...transcripts/<position>/<filename>.openthing",
  "bodyPath": "...transcripts/<position>/<filename>.body.md",
  "isNew": true,
  "project": "cc-ninja",
  "position": "ccc-ninja-engineer"
}
```

Failure conditions (400):
- Missing required field
- No routing-tag line found
- Project or position contains characters outside `[a-z0-9-]` (path-traversal guard)

The server uses `conversationUrl` as the match key for in-place updates — subsequent POSTs with the same `conversationUrl` on the same local date update the existing envelope + body pair rather than creating a duplicate.

### `GET /health`

Liveness check. Returns `{ ok: true, version, projectsRoot }`.

## Code reuse

The envelope-emission logic is shared with the [VS Code extension](../vscode/) via the [core/](../core/) package. Both consumers copy `core/src/` into their own `src/core/` at build time. This avoids npm-workspace / symlink complexity while keeping one source of truth for the envelope shape.
