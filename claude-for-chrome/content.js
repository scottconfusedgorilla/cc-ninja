/**
 * Content script for claude.ai pages. Extracts the conversation DOM into a
 * markdown body and forwards it to the service worker for posting to the local
 * cc-ninja-server.
 *
 * DOM-selector strategy: structured extraction tries known claude.ai turn
 * markers first; if the DOM shape has shifted, a generic-innerText fallback
 * still produces a usable body. The user-typed routing tag line
 * (`[project]=X [position]=Y [user]=Z`) will be preserved either way, since
 * it's just text the user typed inside the conversation.
 */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "cc-ninja/extract") return;
  try {
    const payload = buildPayload();
    chrome.runtime
      .sendMessage({ type: "cc-ninja/payload", payload })
      .then((reply) => sendResponse(reply))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
  return true;
});

function buildPayload() {
  const conversationUrl = window.location.href;
  const startedAt = sessionStorage.getItem("cc-ninja-started-at") || persistStartedAt();
  const bodyMarkdown = extractMarkdown();
  const title = document.title?.replace(/\s*\|\s*Claude.*$/i, "").trim() || undefined;
  return {
    conversationUrl,
    startedAt,
    bodyMarkdown,
    title,
    model: detectModel(),
  };
}

function persistStartedAt() {
  const iso = new Date().toISOString();
  try {
    sessionStorage.setItem("cc-ninja-started-at", iso);
  } catch {
    /* private mode or storage disabled */
  }
  return iso;
}

/**
 * UPDATE THIS BLOCK when claude.ai's DOM changes. Each strategy returns
 * non-empty markdown when it finds something usable; the first one to succeed
 * wins. The final innerText fallback is the safety net.
 */
function extractMarkdown() {
  return (
    extractFromTurnRoles() ||
    extractFromProseBlocks() ||
    extractFromInnerText() ||
    "_(no conversation content extracted)_"
  );
}

function extractFromTurnRoles() {
  // claude.ai has historically used data-test-render-count alongside per-turn
  // wrappers with role hints in nearby attributes. We look for any element
  // that has a `data-*` role attribute hint, then walk siblings.
  const turns = document.querySelectorAll(
    '[data-testid*="message" i], [data-testid*="turn" i]'
  );
  if (turns.length === 0) return null;
  const parts = [];
  for (const turn of turns) {
    const role = inferRole(turn);
    const text = turn.innerText?.trim();
    if (!text) continue;
    parts.push(`## ${capitalize(role)}\n\n${text}`);
  }
  return parts.length > 0 ? parts.join("\n\n") : null;
}

function extractFromProseBlocks() {
  // Fallback: scan for prose containers. Claude renders user messages in
  // bubbles and assistant messages in a wider "prose" container.
  const candidates = document.querySelectorAll(
    "article, [class*='prose'], [class*='message']"
  );
  if (candidates.length === 0) return null;
  const seen = new Set();
  const parts = [];
  for (const el of candidates) {
    const text = el.innerText?.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    const role = inferRole(el);
    parts.push(`## ${capitalize(role)}\n\n${text}`);
  }
  return parts.length > 0 ? parts.join("\n\n") : null;
}

function extractFromInnerText() {
  const main = document.querySelector("main") || document.body;
  const text = main.innerText?.trim();
  return text ? `## Conversation\n\n${text}` : null;
}

function inferRole(el) {
  const attrs = Array.from(el.attributes || [])
    .map((a) => `${a.name}=${a.value}`)
    .join(" ")
    .toLowerCase();
  const classes = (el.className || "").toString().toLowerCase();
  const combined = `${attrs} ${classes}`;
  if (/(\b|-)user(\b|-)/.test(combined) || /human/.test(combined)) return "user";
  if (/assistant|claude|response|ai-/.test(combined)) return "assistant";
  return "turn";
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function detectModel() {
  // Best-effort: scan the DOM for a model badge. Returns undefined if not found.
  const badge = document.querySelector(
    '[data-testid*="model" i], [aria-label*="model" i]'
  );
  if (!badge) return undefined;
  const text = badge.textContent?.trim();
  return text && text.length < 80 ? text : undefined;
}
