# Claude Desktop (Electron) is not directly capturable — only via its claude.ai web mirror

**Session:** 2026-05-22 evening. Conducted *in the Claude desktop app* (Filesystem-extension chair), not Claude Code and not Claude-for-Chrome. Cross-filed here as a cc-ninja surface-coverage finding.

**One-line answer to the Director's sidebar question ("can we get transcripts from Claude Desktop"):** Not directly. Yes, indirectly, via the conversation's claude.ai web mirror — using the Chrome capture path that already shipped in v0.16.0.

## How this came up

The session was building out an unrelated personal org (`swpersonal`) from inside the Claude desktop app, using the official Filesystem extension to write files to `S:\Projects`. The question of capturing *that session* as a transcript arose, which surfaced the desktop-specific capture story. The ccc-ninja-engineer (in a parallel sidebar) did the IndexedDB investigation that produced result #1 below.

## The three results (all confirmed, not inferred)

### 1. Claude Desktop keeps no local conversation store

Claude Desktop is a thin Electron wrapper around the claude.ai web app. Its local Chromium storage layers (`Cache`, `IndexedDB`, `Local Storage`) are generic web-storage — nothing app-specific that looks like a conversation store. The **only** conversation-related thing persisted locally is the **in-progress TipTap message draft**, autosaved character-by-character as the user types. The largest IndexedDB match during the dig was the user's literally-just-typed, unsent draft. Sent messages and assistant responses are **not** on disk — they live on Anthropic's servers and are fetched per-load.

**Implication for cc-ninja:** the `vscode/` JSONL-read approach has no analogue here. There is no `~/.claude/projects/*.jsonl` equivalent for the desktop app. Nothing on disk to read.

### 2. Desktop DevTools is locked, so the Chrome Snippets path does not transfer

`Ctrl+Shift+I` in the desktop app does nothing — the Electron build ships with DevTools disabled. This matters because the **shipped** Sidepanel capture path (option B in the C4C closeout, `2026-05-22-0907`) depends on the DevTools → Sources → Snippets console seam. That seam is exactly what's closed in the desktop Electron build. So the capture method that works for the Chrome Sidepanel **cannot** be ported to the desktop app as-is.

(Options 2 and 3 from the evening's discussion — API replay with the user's own key + conversation ID, and `--remote-debugging-port=9222` against Electron — remain theoretically open, but the remote-debug option carries the same whole-session-exposure security tradeoff already rejected as Option D in the C4C closeout. Same conclusion: not worth it at this stage.)

### 3. The capture route is the web mirror

Because the conversation is server-side, the same conversation is reachable by logging into **claude.ai in real Chrome** with the same account. Real Chrome is **not** subject to the Electron DevTools lockdown, so the **already-shipped** v0.16.0 capture paths — the in-tab content-script path and the Sidepanel Snippet path — apply to the web-rendered conversation directly.

**Net architecture:** the desktop app itself is uncapturable; *its conversation's web mirror is capturable with existing tooling.* The desktop app is, for capture purposes, just a viewport onto a server-side conversation that Chrome can also view (and therefore scrape).

## Correction to the public README

The public `README.md` on GitHub still lists the `claude-for-chrome/` and `server/` components as **Planned (v0.16.x)**. Per the `2026-05-22-0907` closeout, that work **shipped** (v0.16.0, untagged at time of writing). The README is stale and should be updated — relevant because anyone evaluating "can cc-ninja capture X" off the README would wrongly conclude the Chrome path doesn't exist yet.

## Why this is additive to the C4C closeout

The `2026-05-22-0907` closeout covered **Claude-for-Chrome** thoroughly (Chrome cross-extension isolation, the Sidepanel, Chrome Snippets). It did **not** test the **Claude desktop Electron app**, which is a distinct surface with a distinct result: no local store + locked DevTools = no direct capture, web-mirror only. That's the gap this note fills.

## Follow-ups

- **End-to-end test:** confirm that opening a *desktop-originated* conversation in claude.ai-in-Chrome reliably exposes the full history to the Sidepanel/in-tab extractor. Expected yes (server-side conversation), but not yet exercised for a thread that began in the desktop app.
- **README fix:** Chrome path is shipped, not planned.
- **Docs:** consider documenting "desktop users capture via the web mirror" as the supported workflow, since direct desktop capture appears to need Anthropic-side cooperation — same shape as the C4C closeout's conclusion about auto-capture-on-tab-close.

---

*Authored by a desktop-app Claude (swpersonal-bootstrap-helper chair) with Filesystem write access, cross-filed to ccc-ninja-engineer notes. This note is itself an example of the gap: the session that produced it cannot be auto-captured, because it ran in the desktop app.*
