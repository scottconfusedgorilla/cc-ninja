/**
 * DevTools console snippet for the Anthropic Claude For Chrome Sidepanel.
 *
 * Why this exists:
 *   1. Chrome forbids third-party content scripts from injecting into another
 *      extension's pages, so cc-ninja's content-script extension cannot reach
 *      the Sidepanel (chrome-extension://fcoeoabgfenejglbffodgkkbkcdhcgfn/
 *      sidepanel.html). DevTools console runs IN the inspected page's context,
 *      which lets us read the Sidepanel DOM.
 *   2. The Sidepanel page has a strict CSP `connect-src` that blocks fetches
 *      to anything outside Anthropic's allowlist (no localhost). So this
 *      snippet does not POST directly — it navigates to a relay page on the
 *      local server, carrying the payload in the URL hash. The hash never
 *      leaves the browser; the relay page (same-origin with the server)
 *      POSTs to /transcript on our behalf.
 *
 * Usage:
 *   1. Make sure cc-ninja-server is running (cd server && node out/index.js)
 *   2. Right-click inside the Sidepanel → Inspect. DevTools opens against
 *      chrome-extension://fcoeoabgfenejglbffodgkkbkcdhcgfn/sidepanel.html.
 *   3. Switch to the Console tab. Paste this entire file, press Enter.
 *   4. A new tab opens at http://localhost:7333/relay#... showing the result;
 *      it auto-closes 3s after a successful save.
 *
 * The conversation must contain a routing tag line somewhere:
 *   [project]=cc-ninja [position]=ccc-ninja-engineer [user]=scott@confusedgorilla.com
 */

(() => {
  const RELAY_URL = "http://localhost:7333/relay";

  const turns = collectTurns();
  if (turns.length === 0) {
    console.error("cc-ninja: no turn elements found. DOM selectors may need updating.");
    return;
  }

  const bodyMarkdown = turnsToMarkdown(turns);
  const conversationUrl = new URL(window.location.href).toString();
  const startedAt = new Date().toISOString();
  const model = detectModel();
  const title = document.title?.replace(/\s*[-|]\s*Claude.*$/i, "").trim() || undefined;

  const payload = { conversationUrl, startedAt, bodyMarkdown, title, model };

  console.log(`cc-ninja: ${turns.length} turn(s), ${bodyMarkdown.length} chars`);

  const encoded = encodeURIComponent(JSON.stringify(payload));
  const url = RELAY_URL + "#" + encoded;
  // Use a small popup window instead of a full tab — smaller visual footprint,
  // less context-switch out of the Sidepanel. Falls back to a tab if Chrome's
  // popup blocker says no.
  let opened = window.open(url, "cc-ninja-relay", "popup,width=520,height=260");
  if (!opened) opened = window.open(url, "_blank");
  if (!opened) {
    console.error(
      "cc-ninja: window.open blocked. Allow popups for this page, or copy this URL into a new tab manually:",
      url
    );
  } else {
    console.log("cc-ninja: opened relay; it will report the save result and auto-close.");
  }

  function collectTurns() {
    // Strategy: find the conversation scroll container, then iterate its
    // immediate children. Each child is one turn. Classification:
    //   - if it contains a `.claude-response` element OR a
    //     `.font-claude-response-body` paragraph → assistant
    //   - otherwise → user
    const candidates = [
      ...document.querySelectorAll("[data-testid*='conversation' i]"),
      ...document.querySelectorAll("[class*='conversation' i]"),
      ...document.querySelectorAll("main"),
    ];
    let container = null;
    let bestScore = 0;
    for (const c of candidates) {
      const score = c.querySelectorAll(".font-claude-response-body, .claude-response").length;
      if (score > bestScore) {
        bestScore = score;
        container = c;
      }
    }
    if (!container) {
      const responses = document.querySelectorAll(".font-claude-response-body, .claude-response");
      if (responses.length === 0) return [];
      container = commonAncestor([...responses]);
    }

    const turns = [];
    for (const child of container.children) {
      const text = child.innerText?.trim();
      if (!text) continue;
      const isAssistant =
        child.querySelector(".font-claude-response-body, .claude-response") !== null ||
        child.classList.contains("claude-response");
      turns.push({ role: isAssistant ? "assistant" : "user", text });
    }
    if (turns.length > 0) return turns;

    const responses = [...container.querySelectorAll(".font-claude-response-body, .claude-response")];
    return responses.map((el) => ({ role: "assistant", text: el.innerText?.trim() ?? "" }));
  }

  function turnsToMarkdown(turns) {
    return turns
      .map((t) => `## ${t.role[0].toUpperCase()}${t.role.slice(1)}\n\n${t.text}`)
      .join("\n\n");
  }

  function detectModel() {
    const badge = document.querySelector(
      "[data-testid*='model' i], [aria-label*='model' i]"
    );
    const text = badge?.textContent?.trim();
    return text && text.length < 80 ? text : undefined;
  }

  function commonAncestor(nodes) {
    if (nodes.length === 0) return null;
    let ancestor = nodes[0].parentElement;
    while (ancestor) {
      if (nodes.every((n) => ancestor.contains(n))) return ancestor;
      ancestor = ancestor.parentElement;
    }
    return document.body;
  }
})();
