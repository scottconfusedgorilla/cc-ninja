# Claude For Chrome capture — session closeout and learnings

**Session:** 2026-05-22, ccc-ninja-engineer + Director.
**Outcome:** End-to-end Sidepanel transcript capture shipped via the Chrome Snippets path. Repo restructured to a monorepo with shared `core/`, new `server/`, and new `claude-for-chrome/` Chrome extension. v0.16.0-shaped work (not yet tagged).

## What shipped

- **[core/](../../core/)** — transport-agnostic `memodef:Transcript` envelope emitter. Both `vscode/` and `server/` consume it via a `sync-core` build step that copies `core/src/` into the consumer's tree at build time (sidesteps npm-workspace machinery and vsce's symlink quirks).
- **[server/](../../server/)** — Node HTTP bridge, zero runtime deps. `POST /transcript` accepts a conversation payload, parses a routing tag line, writes envelope + body to `<projects-root>/<project>/transcripts/<position>/`. `GET /relay` serves a small same-origin HTML that POSTs to `/transcript` on behalf of CSP-restricted pages. `GET /health` for liveness. Debug log line printed on every save.
- **[claude-for-chrome/](../../claude-for-chrome/)** — Manifest V3 Chrome extension. Right-click → Save flow works for `https://claude.ai/*` regular tabs. For the Anthropic Sidepanel, ships a DevTools-Snippet (`sidepanel-snippet.js`) the user installs once via DevTools → Sources → Snippets.
- **Routing tag-line protocol:** `[project]=X [position]=Y [user]=Z` on a single line inside the conversation body. All three keys required on one line (eliminates false positives from prose mentioning one tag in passing). Last matching line wins, so the user can redirect mid-conversation. Parsed by the server, never by the model.

## The load-bearing learnings

### 1. Chrome's cross-extension isolation is final

A third-party extension *cannot* reach Anthropic's Claude Sidepanel via any of the obvious paths:

- `chrome.scripting.executeScript` — refuses, target is owned by another extension
- Content script injection — same restriction at manifest level
- `chrome.debugger.attach` — returns `"Cannot access a chrome-extension:// URL of different extension"`

Curiously, `chrome.debugger.getTargets()` *does* return the Sidepanel pages — we can *see* them, just not act on them. Useful diagnostic surface, dead-end actuator.

The only seam Chrome leaves open is the DevTools console (and Sources Snippets, which is the same surface persisted). Console code runs *inside* the inspected page's context, which is exactly the access we need. Manual user-initiated; no programmatic backdoor.

### 2. Sidepanel CSP blocks direct localhost fetch

The Sidepanel page has a strict `connect-src` Content Security Policy whose allowlist excludes localhost. A snippet running in DevTools console *can* read the DOM (CSP doesn't restrict that) but *cannot* fetch our server directly.

CSP `connect-src` does not cover navigation. So the workaround: `window.open` to a relay page on the local server with the payload encoded in the URL hash. Hash fragments stay in the browser — never sent over the network — so the conversation bytes never traverse the wire until the relay page (which is same-origin with the server) POSTs them.

This was the unlock. Without it the snippet would be limited to clipboard-based manual relays.

### 3. The three Sidepanel capture paths considered

- **Option A (rejected): `chrome.debugger` from the extension.** Theoretically would have given right-click → done. Got stopped cold by the cross-extension isolation rule above. Verified by writing it and watching the attach call reject.
- **Option D (rejected for now): Chrome started with `--remote-debugging-port=9222` + native CDP client in the server.** The debug port lives outside Chrome's extension security model and *can* attach to chrome-extension targets. Would deliver true one-click. Costs: user must launch Chrome with the flag (one-time Chrome-shortcut edit, but persistent), and the debug port exposes the entire Chrome session to any local process. Real security tradeoff for a personal-dev-machine workflow; not worth it for this stage of the project.
- **Option B (shipped): Chrome Snippets.** User pastes `sidepanel-snippet.js` into DevTools → Sources → Snippets once. Per save: F12 → Sources → Snippets → right-click "cc-ninja save" → Run. ~4 clicks. Snippets are persistent on the local Chrome profile, so the one-time install really is one-time.

The pragmatic call was right. We have a working end-to-end save. D is a possible future upgrade if the snippet flow becomes annoying.

### 4. DOM extraction selectors held up across days

Brother-Claude's observation from two days prior — that the Sidepanel renders assistant turns inside `.claude-response` containers with `.font-claude-response-body` paragraph children — was still accurate when we tested. The extractor uses a layered strategy:

1. Look for an obvious conversation container (`data-testid*=conversation`, etc.)
2. Iterate its immediate children, classifying each by whether it contains the assistant-response class signature
3. Fallback: scan all response nodes and walk to a common ancestor
4. Final fallback: `innerText` of `<main>` or `<body>`

End-to-end on the live Sidepanel: turn boundaries, role classification (user/assistant), and order all correct on a 6-turn fixture. Selectors will drift eventually; the labeled section in `sidepanel-snippet.js` makes them easy to update.

### 5. Update-in-place semantics work via `source_url`

The server matches existing envelopes by `metadata.source_url` (the Sidepanel's `chrome-extension://...?tabId=N` URL) plus same-local-date. Repeated saves during one Chrome tab lifetime update the same envelope — no duplicate files. Closing the tab → new tabId → new envelope, which is the right boundary discipline.

## Pre-existing learnings reaffirmed

These were already known going in but the C4C work re-confirmed them:

- **Envelope + body split:** envelope is the indexable artifact, body regenerable from the source. Held up cleanly across two new consumers.
- **Routing-via-in-band-data:** in-conversation tag line is a strictly better UX than a configuration dialog or per-tab settings. The model is stateless; the conversation IS the configuration. Brother-Claude's transcript captured the user (Director) explicitly choosing this design.
- **Capture happens in the harness, not the model:** the Sidepanel snippet reads the DOM; the model doesn't try to narrate the conversation back. Faithfulness is harness-side, not model-side. Brother-Claude argued this in the design transcript; reaffirmed in practice.

## Outstanding cosmetic items (not blocking)

- `session_arc` reads `"claude-for-chrome session sidepanel.html"` because `extractSessionId` grabs the last path segment. Should pull from `?tabId=N` query string for chrome-extension URLs.
- `subject` is frozen on envelope creation; if a Sidepanel conversation gets cleared and reused under the same tabId, the original subject sticks. Could rederive when first-user-line changes.
- Older envelopes still have `capture_tool: ccc-ninja@…` from the pre-rename era. New emissions use `cc-ninja@…`. Cosmetic only.

## Open items for the next session

- Snippet relay popup window is fast but still flickery. Possibly drop to ~800ms close, or make the success state borderless.
- Brother-Claude's Mcp-Session-Id observation (Slice 10.10 `stateless_http=True` but session-id header appearing in responses) — that thread is parked under Thingalog work, not cc-ninja, but worth a follow-up there.
- Auto-capture-on-tab-close for Sidepanel: probably not solvable without Anthropic-side cooperation. Snippets workflow remains manual-trigger only.
- The C4C content-script extension path (claude.ai in a tab) was built but the user prefers the Sidepanel and is unlikely to use the in-tab path much. Keep it; cost is low; covers a different surface.

## What the work shape proved

Three transports (Claude Code JSONL → vscode extension → core; claude.ai DOM → content script → background → server → core; Sidepanel DOM → Snippet → relay → server → core) all emit the same `memodef:Transcript` envelope shape. The transport-agnostic split in `core/` is doing the work it was supposed to do: each consumer derives the transport-specific bits (`transport`, `captureTool`, `sessionArc`, match key) and hands the rest to the shared emitter. New transports (e.g. a future native CDP client) plug in the same way.
