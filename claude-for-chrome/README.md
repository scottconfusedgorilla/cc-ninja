# claude-for-chrome — Chrome capture

Status: **MVP shipped in v0.16.0.**

Captures Claude conversations and ships them to the [local HTTP server](../server/) for git-tracked persistence as `memodef:Transcript` artifacts.

There are **two capture paths** because Chrome treats two Claude surfaces very differently:

| Surface | Path | Setup | Save effort |
|---|---|---|---|
| `https://claude.ai/` in a regular browser tab | Chrome extension (right-click → Save) | Load unpacked extension | One click |
| Anthropic's **Claude Sidepanel** (docked on right of browser) | DevTools Snippet | One-time Snippet install | ~4 clicks per save |

The Sidepanel runs in another extension's sandbox, which Chrome forbids third-party extensions from reading. The Snippet workflow is the supported escape hatch.

---

## Path 1 — claude.ai in a regular tab (extension flow)

**One-time install:**
1. Start the [server](../server/): `cd server && node out/index.js`
2. Open `chrome://extensions`
3. Toggle **Developer mode** on (top-right)
4. Click **Load unpacked** and select this `claude-for-chrome/` directory
5. Pin the CCNinja icon to the toolbar for convenience

**Per save:**
1. Open the conversation on `https://claude.ai/`
2. Make sure the conversation contains a routing tag line:
   ```
   [project]=cc-ninja [position]=ccc-ninja-engineer [user]=scott@confusedgorilla.com
   ```
   All three keys are required, all on one line.
3. Right-click anywhere in the page → **Save with CCNinja** (or click the toolbar icon).
4. Desktop notification confirms: `Created cc-ninja/transcripts/ccc-ninja-engineer/`.

---

## Path 2 — Sidepanel (Chrome Snippets flow)

**One-time install:**
1. Start the server (same as above).
2. Open the Anthropic Sidepanel.
3. Right-click inside the Sidepanel → **Inspect**. DevTools opens against `chrome-extension://fcoeoabgfenejglbffodgkkbkcdhcgfn/sidepanel.html`.
4. In DevTools, switch to the **Sources** tab.
5. In the left panel, find **Snippets** (you may need to click the `»` overflow menu to reveal it).
6. Click **+ New snippet**. Name it `cc-ninja save`.
7. Open [sidepanel-snippet.js](sidepanel-snippet.js), copy the whole file, paste into the snippet pane, save with Ctrl+S.

That's the one-time setup. The snippet is now stored in Chrome and survives across browser restarts.

**Per save:**
1. Make sure the conversation contains the routing tag line (same as Path 1).
2. With the Sidepanel open, right-click inside it → **Inspect**.
3. In DevTools, **Sources → Snippets → right-click `cc-ninja save` → Run**.
   (Or with the snippet open, press `Ctrl+Enter`.)
4. A small popup window appears, shows `Updated cc-ninja/transcripts/ccc-ninja-engineer/`, and auto-closes after ~1 second.

---

## Why the routing tag line

Claude has no persistent memory across sessions, and neither path has UI to ask "which project does this conversation belong to" without breaking the flow. The user-typed tag line is in-band metadata that travels with the conversation: always present when you save, editable mid-conversation (last line wins), zero extra UI.

## Why the Sidepanel needs Snippets instead of the extension

Chrome's extension security model blocks third-party extensions from injecting content scripts, calling `chrome.scripting.executeScript`, or attaching `chrome.debugger` to another extension's page. Anthropic's Sidepanel is their extension's page; we can't reach it from ours. DevTools console (and therefore Snippets) runs *inside* the inspected page's context, which is the seam Chrome leaves open. We use it.

The Sidepanel page also has a strict Content Security Policy that blocks direct `fetch` to localhost, so the snippet uses a different mechanism: it opens a tiny popup window pointed at `http://localhost:7333/relay#<encoded-payload>` (URL hash never traverses the network). The relay page is same-origin with the server and POSTs from there.

## Known constraints (both paths)

- **Tool-call structured records are not recoverable from the DOM.** Captures are lossier on the tool-trace axis than Claude Code's JSONL-sourced captures from the [VS Code extension](../vscode/).
- **DOM selectors are best-effort.** Both [content.js](content.js) (Path 1) and [sidepanel-snippet.js](sidepanel-snippet.js) (Path 2) have a labeled section for the assistant/user turn selectors plus a generic `innerText` fallback. If Claude's markup changes, saves keep working with degraded formatting until selectors are fixed.

## Configuration

Override the server URL (only useful if you moved the server off port 7333):

```js
// In the extension's service worker console (chrome://extensions → CCNinja → "service worker"):
chrome.storage.local.set({ serverUrl: "http://localhost:8000/transcript" });
```

For the Sidepanel snippet, edit the `RELAY_URL` constant at the top of [sidepanel-snippet.js](sidepanel-snippet.js) and re-save the snippet.

See the [v0.15.0 design discussion](../transcripts/) for the architectural reasoning.
