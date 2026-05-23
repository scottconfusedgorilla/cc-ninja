/**
 * Service worker for CC Ninja Chrome extension.
 *
 * The right-click menu + toolbar icon capture path works ONLY for
 * https://claude.ai/* tabs (a regular browser tab loaded at claude.ai).
 *
 * The Anthropic Claude For Chrome Sidepanel runs at
 *   chrome-extension://fcoeoabgfenejglbffodgkkbkcdhcgfn/sidepanel.html
 * which is a different extension's page. Chrome's extension isolation
 * model forbids:
 *   - injecting content scripts into it
 *   - chrome.scripting.executeScript against it
 *   - chrome.debugger.attach against it ("Cannot access a chrome-extension://
 *     URL of different extension")
 *   - direct fetch from inside it (CSP `connect-src` allowlist excludes
 *     localhost)
 *
 * For Sidepanel saves the documented workflow is to install
 * sidepanel-snippet.js as a Chrome DevTools Snippet (one-time) and run it
 * from DevTools → Sources → Snippets. See README for the walkthrough.
 */

const SERVER_URL_DEFAULT = "http://localhost:7333/transcript";
const MENU_ID = "cc-ninja-save";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "Save with CC Ninja",
      contexts: ["page", "selection", "frame"],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  triggerCapture(tab);
});

chrome.action.onClicked.addListener((tab) => {
  triggerCapture(tab);
});

function triggerCapture(tab) {
  if (tab?.id && isClaudeAiTab(tab.url)) {
    chrome.tabs.sendMessage(tab.id, { type: "cc-ninja/extract" }).catch((err) => {
      notify(
        "CC Ninja error",
        `Content script not reachable (${err.message}). Try reloading the claude.ai tab.`
      );
    });
    return;
  }

  if (isAnthropicSidepanel(tab?.url)) {
    notify(
      "CC Ninja — Sidepanel saves use Snippets",
      "Open DevTools on the Sidepanel → Sources → Snippets → run \"cc-ninja save\". See the extension's README for the one-time setup."
    );
    return;
  }

  notify(
    "CC Ninja — no capture target",
    "Open a claude.ai conversation in a regular tab, or use the DevTools Snippet path for the Sidepanel."
  );
}

function isClaudeAiTab(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "claude.ai";
  } catch {
    return false;
  }
}

function isAnthropicSidepanel(url) {
  if (!url) return false;
  return url.startsWith("chrome-extension://fcoeoabgfenejglbffodgkkbkcdhcgfn/sidepanel.html");
}

// Inbound payload from a content script (claude.ai path).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "cc-ninja/payload") return;
  postTranscript(msg.payload)
    .then((result) => {
      sendResponse({ ok: true, result });
      const verb = result.isNew ? "Created" : "Updated";
      notify(
        "CC Ninja — saved",
        `${verb} ${result.project}/transcripts/${result.position}/`
      );
    })
    .catch((err) => {
      sendResponse({ ok: false, error: err.message });
      notify("CC Ninja — error", err.message);
    });
  return true;
});

async function postTranscript(payload) {
  const { serverUrl } = await chrome.storage.local.get(["serverUrl"]);
  const url = serverUrl || SERVER_URL_DEFAULT;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}

function notify(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon128.png",
    title,
    message,
  });
}
