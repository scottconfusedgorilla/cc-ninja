import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { parseTranscript } from "./parser";
import { formatAsMarkdown, formatAsPlainText } from "./formatter";
import { formatAsHtml } from "./htmlFormatter";
import { emitTranscript } from "./transcriptEmitter";

const execFileAsync = promisify(execFile);

let statusBarItem: vscode.StatusBarItem;
let lastFormattedMarkdown: string | undefined;
let lastFormattedText: string | undefined;
let lastFormattedHtml: string | undefined;
let outputTabUri: vscode.Uri | undefined;

export function activate(context: vscode.ExtensionContext) {
  migrateWorkspaceState(context);

  // Status bar
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.text = "$(notebook) Update Transcript";
  statusBarItem.command = "ccNinja.updateSessionTranscript";
  refreshStatusBarTooltip(context);
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "ccNinja.copyTranscript",
      () => copyTranscriptCommand(context)
    ),
    vscode.commands.registerCommand(
      "ccNinja.copyToClipboard",
      () => copyToClipboardCommand()
    ),
    vscode.commands.registerCommand(
      "ccNinja.saveAsMarkdown",
      () => saveCommand("md")
    ),
    vscode.commands.registerCommand(
      "ccNinja.saveAsText",
      () => saveCommand("txt")
    ),
    vscode.commands.registerCommand(
      "ccNinja.saveAsHtml",
      () => saveCommand("html")
    ),
    vscode.commands.registerCommand(
      "ccNinja.previewHtml",
      () => showHtmlPreview(context)
    ),
    vscode.commands.registerCommand(
      "ccNinja.copyThisSession",
      () => copyThisSessionCommand(context)
    ),
    vscode.commands.registerCommand(
      "ccNinja.updateSessionTranscript",
      () => updateSessionTranscriptCommand(context)
    ),
    vscode.commands.registerCommand(
      "ccNinja.finalizeSessionTranscript",
      () => finalizeSessionTranscriptCommand(context)
    ),
    vscode.commands.registerCommand(
      "ccNinja.setRoleId",
      () => setRoleIdCommand(context)
    )
  );
}

async function setRoleIdCommand(context: vscode.ExtensionContext) {
  const existing = context.workspaceState.get<string>("ccNinja.roleId");
  await context.workspaceState.update("ccNinja.roleId", undefined);
  const fresh = await getOrPromptRoleId(context);
  if (fresh) {
    const change = existing ? ` (was: ${existing})` : "";
    vscode.window.showInformationMessage(
      `CC Ninja: role-id set to ${fresh}${change}`
    );
  } else if (existing) {
    // User cancelled; restore the prior value rather than orphaning state
    await context.workspaceState.update("ccNinja.roleId", existing);
  }
}

async function copyTranscriptCommand(context: vscode.ExtensionContext) {
  const file = await pickTranscriptFile();
  if (!file) return;

  statusBarItem.text = "$(sync~spin) CC Ninja parsing...";

  try {
    const raw = Buffer.from(
      await vscode.workspace.fs.readFile(file)
    ).toString("utf-8");
    const messages = parseTranscript(raw);

    if (messages.length === 0) {
      vscode.window.showWarningMessage(
        "CC Ninja: No messages found in the selected file."
      );
      statusBarItem.text = "$(notebook) Update Transcript";
      return;
    }

    // Ask user about formatting options
    const includeTools = await vscode.window.showQuickPick(
      [
        { label: "Include tool calls", picked: true, value: true },
        { label: "Hide tool calls", picked: false, value: false },
      ],
      { placeHolder: "Include tool calls (Read, Write, Bash, etc.)?" }
    );

    const opts = {
      includeToolCalls: includeTools?.value ?? true,
      includeToolResults: false,
      includeTimestamps: true,
    };

    lastFormattedMarkdown = formatAsMarkdown(messages, opts);
    lastFormattedText = formatAsPlainText(messages);
    lastFormattedHtml = formatAsHtml(messages, opts);

    // Ask which output format
    const format = await vscode.window.showQuickPick(
      [
        { label: "$(preview) Visual Preview (looks like Claude Code)", value: "preview" },
        { label: "$(markdown) Markdown tab", value: "markdown" },
      ],
      { placeHolder: "How do you want to view the transcript?" }
    );

    if (!format) {
      statusBarItem.text = "$(notebook) Update Transcript";
      return;
    }

    if (format.value === "preview") {
      showHtmlPreview(context);
    } else {
      openMarkdownTab();
    }

    const count = messages.filter(
      (m) => m.role === "user" || m.role === "assistant"
    ).length;
    vscode.window.showInformationMessage(
      `CC Ninja: Parsed ${count} messages.`
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`CC Ninja: Failed to parse — ${msg}`);
  }

  statusBarItem.text = "$(notebook) Update Transcript";
}

async function copyThisSessionCommand(context: vscode.ExtensionContext) {
  statusBarItem.text = "$(sync~spin) CC Ninja parsing...";

  try {
    const file = await findNewestTranscript();
    if (!file) {
      vscode.window.showWarningMessage(
        "CC Ninja: No Claude Code transcripts found."
      );
      statusBarItem.text = "$(notebook) Update Transcript";
      return;
    }

    const raw = Buffer.from(
      await vscode.workspace.fs.readFile(file)
    ).toString("utf-8");
    const messages = parseTranscript(raw);

    if (messages.length === 0) {
      vscode.window.showWarningMessage(
        "CC Ninja: No messages found in the current session."
      );
      statusBarItem.text = "$(notebook) Update Transcript";
      return;
    }

    const mdOpts = {
      includeToolCalls: true,
      includeToolResults: false,
      includeTimestamps: true,
    };

    lastFormattedMarkdown = formatAsMarkdown(messages, mdOpts);
    lastFormattedText = formatAsPlainText(messages);
    lastFormattedHtml = formatAsHtml(messages, {
      includeToolCalls: true,
      includeToolResults: true,
      includeTimestamps: true,
    });

    showHtmlPreview(context);

    const count = messages.filter(
      (m) => m.role === "user" || m.role === "assistant"
    ).length;
    const title = await getSessionTitle(file.fsPath);
    vscode.window.showInformationMessage(
      `CC Ninja: "${title}" — ${count} messages.`
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`CC Ninja: Failed to parse — ${msg}`);
  }

  statusBarItem.text = "$(notebook) Update Transcript";
}

async function findNewestTranscript(): Promise<vscode.Uri | undefined> {
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const claudeDir = path.join(homeDir, ".claude", "projects");

  // Scope the search to the current workspace's encoded subfolder. Claude
  // Code stores transcripts at ~/.claude/projects/<encoded-path>/ where the
  // encoding replaces `:`, `/`, `\` with `-` (e.g. s:/Projects/foo →
  // s--Projects-foo). Without this scoping, the global-newest pick can land
  // a transcript from an unrelated project into this workspace's
  // transcripts/ folder.
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const scopeDir = workspaceFolder
    ? path.join(claudeDir, encodeWorkspaceForClaude(workspaceFolder))
    : claudeDir;

  try {
    if (workspaceFolder) {
      try {
        const stat = await fs.promises.stat(scopeDir);
        if (!stat.isDirectory()) return undefined;
      } catch {
        return undefined;
      }
    }

    const pattern = new vscode.RelativePattern(scopeDir, "**/*.jsonl");
    const files = await vscode.workspace.findFiles(pattern, null, 200);
    if (files.length === 0) return undefined;

    let newest: vscode.Uri | undefined;
    let newestMtime = 0;

    await Promise.all(
      files.map(async (f) => {
        try {
          const stat = await fs.promises.stat(f.fsPath);
          if (stat.mtimeMs > newestMtime) {
            newestMtime = stat.mtimeMs;
            newest = f;
          }
        } catch { /* skip */ }
      })
    );

    return newest;
  } catch {
    return undefined;
  }
}

function showHtmlPreview(context: vscode.ExtensionContext) {
  if (!lastFormattedHtml) {
    vscode.window.showWarningMessage(
      "CC Ninja: No transcript loaded. Run 'CC Ninja: Copy Transcript' first."
    );
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    "cccNinjaPreview",
    "Claude Code Transcript",
    vscode.ViewColumn.One,
    { enableScripts: true }
  );

  // Inject a copy button and save buttons into the webview
  const htmlWithControls = lastFormattedHtml.replace(
    "</body>",
    `<div class="controls">
  <button onclick="copyAll()">Copy to Clipboard</button>
  <button onclick="vscode.postMessage({command:'saveHtml'})">Save as HTML</button>
  <button onclick="vscode.postMessage({command:'saveMd'})">Save as Markdown</button>
  <button onclick="vscode.postMessage({command:'saveTxt'})">Save as Text</button>
</div>
<script>
  const vscode = acquireVsCodeApi();
  function copyAll() {
    const el = document.querySelector('.transcript');
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('copy');
    sel.removeAllRanges();
    const btn = event.target;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy to Clipboard', 1500);
  }
</script>
<style>
.controls {
  position: fixed;
  top: 16px;
  right: 16px;
  display: flex;
  gap: 8px;
  z-index: 100;
}
.controls button {
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 8px 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-code);
  color: var(--text);
  cursor: pointer;
  transition: background 0.15s;
}
.controls button:hover {
  background: var(--bg-user-bubble);
}
</style>
</body>`
  );

  panel.webview.html = htmlWithControls;

  panel.webview.onDidReceiveMessage(
    (message) => {
      switch (message.command) {
        case "saveHtml":
          saveCommand("html");
          break;
        case "saveMd":
          saveCommand("md");
          break;
        case "saveTxt":
          saveCommand("txt");
          break;
      }
    },
    undefined,
    context.subscriptions
  );
}

function openMarkdownTab() {
  const content = lastFormattedMarkdown!;
  vscode.workspace
    .openTextDocument({ content, language: "markdown" })
    .then((doc) => {
      vscode.window.showTextDocument(doc, { preview: false });
      outputTabUri = doc.uri;
      vscode.commands.executeCommand("setContext", "ccNinja.isOutputTab", true);

      const disposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
        const isOutput =
          editor &&
          editor.document.uri.toString() === outputTabUri?.toString();
        vscode.commands.executeCommand(
          "setContext",
          "ccNinja.isOutputTab",
          !!isOutput
        );
      });

      const closeDisposable = vscode.workspace.onDidCloseTextDocument(
        (closed) => {
          if (closed.uri.toString() === outputTabUri?.toString()) {
            vscode.commands.executeCommand(
              "setContext",
              "ccNinja.isOutputTab",
              false
            );
            outputTabUri = undefined;
            disposable.dispose();
            closeDisposable.dispose();
          }
        }
      );
    });
}

async function pickTranscriptFile(): Promise<vscode.Uri | undefined> {
  const active = vscode.window.activeTextEditor;
  if (active && active.document.fileName.endsWith(".jsonl")) {
    const useActive = await vscode.window.showQuickPick(
      [
        { label: "Use current file", value: "current" },
        { label: "Browse for file...", value: "browse" },
        { label: "Find in .claude/ folder", value: "find" },
      ],
      { placeHolder: "Which transcript to parse?" }
    );

    if (!useActive) return undefined;
    if (useActive.value === "current") return active.document.uri;
    if (useActive.value === "browse") return browseForFile();
    return findClaudeTranscripts();
  }

  const choice = await vscode.window.showQuickPick(
    [
      { label: "Browse for file...", value: "browse" },
      { label: "Find in .claude/ folder", value: "find" },
    ],
    { placeHolder: "Select a Claude Code transcript file" }
  );

  if (!choice) return undefined;
  if (choice.value === "browse") return browseForFile();
  return findClaudeTranscripts();
}

async function browseForFile(): Promise<vscode.Uri | undefined> {
  const uris = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { "JSONL Transcripts": ["jsonl"], "All Files": ["*"] },
    title: "Select Claude Code Transcript",
  });
  return uris?.[0];
}

async function findClaudeTranscripts(): Promise<vscode.Uri | undefined> {
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const claudeDir = path.join(homeDir, ".claude", "projects");

  try {
    const pattern = new vscode.RelativePattern(claudeDir, "**/*.jsonl");
    const files = await vscode.workspace.findFiles(pattern, null, 100);

    if (files.length === 0) {
      vscode.window.showWarningMessage(
        "CC Ninja: No .jsonl files found in ~/.claude/projects/"
      );
      return browseForFile();
    }

    // Get file stats and first user message for each file
    const itemsWithMeta = await Promise.all(
      files.map(async (f) => {
        let mtime = 0;
        try {
          const stat = await fs.promises.stat(f.fsPath);
          mtime = stat.mtimeMs;
        } catch { /* skip */ }

        const title = await getSessionTitle(f.fsPath);
        const project = extractProjectName(f.fsPath, claudeDir);

        return { uri: f, mtime, title, project };
      })
    );

    // Sort newest first
    itemsWithMeta.sort((a, b) => b.mtime - a.mtime);

    const now = Date.now();
    const items = itemsWithMeta.map((item) => ({
      label: item.title,
      description: item.project,
      detail: relativeAge(now, item.mtime),
      uri: item.uri,
    }));

    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: "Select a transcript",
      matchOnDescription: true,
      matchOnDetail: true,
    });

    return pick?.uri;
  } catch {
    return browseForFile();
  }
}

async function getSessionTitle(filePath: string): Promise<string> {
  try {
    const content = await fs.promises.readFile(filePath, "utf-8");
    // Read first few lines to find the first user message
    const lines = content.split("\n").slice(0, 30);
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.message?.role === "user") {
          const msg = entry.message.content;
          const text = typeof msg === "string"
            ? msg
            : Array.isArray(msg)
              ? msg.find((b: { type: string; text?: string }) => b.type === "text")?.text ?? ""
              : "";
          if (text) {
            // Truncate to first line, max 60 chars
            const firstLine = text.split("\n")[0].trim();
            return firstLine.length > 60
              ? firstLine.slice(0, 57) + "..."
              : firstLine;
          }
        }
      } catch { /* skip malformed lines */ }
    }
  } catch { /* file read error */ }
  return path.basename(filePath);
}

function extractProjectName(filePath: string, claudeDir: string): string {
  // Path is like: claudeDir/s--Projects-foo/sessionid.jsonl
  const rel = path.relative(claudeDir, filePath);
  const firstSegment = rel.split(path.sep)[0];
  // Decode: "s--Projects-foo" -> "s:/Projects/foo"
  return firstSegment
    .replace(/--/g, ":/")
    .replace(/-/g, "/");
}

function relativeAge(now: number, mtime: number): string {
  if (!mtime) return "";
  const diffMs = now - mtime;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

async function copyToClipboardCommand() {
  if (!lastFormattedMarkdown) {
    vscode.window.showWarningMessage(
      "CC Ninja: No transcript loaded. Run 'CC Ninja: Copy Transcript' first."
    );
    return;
  }
  await vscode.env.clipboard.writeText(lastFormattedMarkdown);
  vscode.window.showInformationMessage("CC Ninja: Copied to clipboard!");
}

async function saveCommand(format: "md" | "txt" | "html") {
  let content: string | undefined;
  let filters: Record<string, string[]>;

  switch (format) {
    case "md":
      content = lastFormattedMarkdown;
      filters = { Markdown: ["md"] };
      break;
    case "txt":
      content = lastFormattedText;
      filters = { "Text Files": ["txt"] };
      break;
    case "html":
      content = lastFormattedHtml;
      filters = { "HTML Files": ["html"] };
      break;
  }

  if (!content) {
    vscode.window.showWarningMessage(
      "CC Ninja: No transcript loaded. Run 'CC Ninja: Copy Transcript' first."
    );
    return;
  }

  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(`transcript.${format}`),
    filters,
    title: `Save transcript as .${format}`,
  });

  if (uri) {
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf-8"));
    vscode.window.showInformationMessage(`CC Ninja: Saved to ${uri.fsPath}`);
  }
}

async function updateSessionTranscriptCommand(context: vscode.ExtensionContext) {
  await runTranscriptCommand(context, { finalize: false, verbForToast: "Updated" });
}

async function finalizeSessionTranscriptCommand(context: vscode.ExtensionContext) {
  await runTranscriptCommand(context, { finalize: true, verbForToast: "Finalized" });
}

interface RunOptions {
  finalize: boolean;
  verbForToast: string;
}

async function runTranscriptCommand(
  context: vscode.ExtensionContext,
  runOpts: RunOptions
) {
  // Resolve all interactive prerequisites BEFORE showing any progress.
  // Showing a spinner during prompts/git lookups confuses the user when
  // the work is just waiting on them.
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage(
      "CC Ninja: Open a workspace folder first — transcripts are stored relative to the workspace root."
    );
    return;
  }
  const workspaceRoot = workspaceFolders[0].uri.fsPath;

  const roleId = await getOrPromptRoleId(context);
  if (!roleId) return;

  // Now do the actual file work under withProgress so the spinner
  // auto-cleans up on completion or error.
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window,
      title: "CC Ninja: updating transcript",
    },
    async () => {
      try {
        const writeRoot = await findWorkingRepoRoot(workspaceRoot);
        const directorIdentity = await getOrInferDirectorIdentity(
          context,
          writeRoot
        );

        const file = await findNewestTranscript();
        if (!file) {
          vscode.window.showWarningMessage(
            "CC Ninja: No Claude Code transcripts found for this workspace."
          );
          return;
        }

        const raw = Buffer.from(
          await vscode.workspace.fs.readFile(file)
        ).toString("utf-8");
        const messages = parseTranscript(raw);
        if (messages.length === 0) {
          vscode.window.showWarningMessage(
            "CC Ninja: No messages found in the current session."
          );
          return;
        }

        const markdownBody = formatAsMarkdown(messages, {
          includeToolCalls: true,
          includeToolResults: false,
          includeTimestamps: true,
        });

        const version = context.extension.packageJSON.version as string;
        const result = await emitTranscript({
          roleId,
          directorIdentity,
          workspaceRoot: writeRoot,
          jsonlPath: file.fsPath,
          messages,
          markdownBody,
          packageVersion: version,
          finalize: runOpts.finalize,
        });

        const verb = result.isNew ? "Created" : runOpts.verbForToast;
        const relPath = path.relative(workspaceRoot, result.envelopePath);
        await context.workspaceState.update(
          "ccNinja.lastTranscriptRelPath",
          relPath
        );
        await context.workspaceState.update(
          "ccNinja.lastTranscriptAbsPath",
          result.envelopePath
        );
        refreshStatusBarTooltip(context);

        const open = "Open envelope";
        const reveal = "Reveal in Explorer";
        const choice = await vscode.window.showInformationMessage(
          `CC Ninja: ${verb} transcript for ${roleId} at ${relPath}`,
          open,
          reveal
        );
        if (choice === open) {
          const doc = await vscode.workspace.openTextDocument(
            result.envelopePath
          );
          await vscode.window.showTextDocument(doc);
        } else if (choice === reveal) {
          await vscode.commands.executeCommand(
            "revealFileInOS",
            vscode.Uri.file(result.envelopePath)
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(
          `CC Ninja: Failed to update transcript — ${msg}`
        );
      }
    }
  );
}

/**
 * Walk shallowly looking for the "working-repo root" — the directory that
 * holds CLAUDE.md alongside a recognizable spec marker (SCHEMA.md, memos/,
 * decisions/, notes/, or transcripts/). For repos like memodef-spec, the
 * workspace folder (memodef-spec/) is NOT the working root — the inner
 * directory (memodef-spec/memodef/) is. Falls back to the workspace folder
 * if no match is found.
 */
async function findWorkingRepoRoot(workspaceRoot: string): Promise<string> {
  if (await isWorkingRoot(workspaceRoot)) return workspaceRoot;

  try {
    const entries = await fs.promises.readdir(workspaceRoot, {
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;
      if (entry.name === "node_modules") continue;
      const candidate = path.join(workspaceRoot, entry.name);
      if (await isWorkingRoot(candidate)) return candidate;
    }
  } catch {
    // unreadable workspace root — fall through to default
  }

  return workspaceRoot;
}

async function isWorkingRoot(dir: string): Promise<boolean> {
  if (!(await pathExists(path.join(dir, "CLAUDE.md")))) return false;
  const markers = ["SCHEMA.md", "memos", "decisions", "notes", "transcripts"];
  for (const m of markers) {
    if (await pathExists(path.join(dir, m))) return true;
  }
  return false;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.promises.access(p);
    return true;
  } catch {
    return false;
  }
}

function encodeWorkspaceForClaude(workspacePath: string): string {
  return workspacePath.replace(/[:\\/]/g, "-");
}

/**
 * Inferred director identity for the human side of participants[]. Cached
 * per-workspace; falls back to `git config user.email` then OS username.
 * Returns undefined only if all sources fail.
 */
async function getOrInferDirectorIdentity(
  context: vscode.ExtensionContext,
  cwd: string
): Promise<string | undefined> {
  const stored = context.workspaceState.get<string>("ccNinja.directorIdentity");
  if (stored) return stored;

  const gitEmail = await getGitUserEmail(cwd);
  if (gitEmail) {
    await context.workspaceState.update("ccNinja.directorIdentity", gitEmail);
    return gitEmail;
  }

  try {
    const username = os.userInfo().username;
    if (username) {
      await context.workspaceState.update("ccNinja.directorIdentity", username);
      return username;
    }
  } catch {
    // fall through
  }

  return undefined;
}

async function getGitUserEmail(cwd: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["config", "user.email"], {
      cwd,
      timeout: 2000,
    });
    const email = stdout.trim();
    return email || undefined;
  } catch {
    return undefined;
  }
}

/**
 * One-shot migration of workspaceState keys after the v0.15.0 rename
 * (ccc-ninja → cc-ninja). Copies any value under an old `cccNinja.*` key
 * into the corresponding new `ccNinja.*` key when the new key is empty,
 * then clears the old. Safe to call repeatedly — no-op after migration.
 */
function migrateWorkspaceState(context: vscode.ExtensionContext): void {
  const pairs: Array<[string, string]> = [
    ["cccNinja.roleId", "ccNinja.roleId"],
    ["cccNinja.directorIdentity", "ccNinja.directorIdentity"],
    ["cccNinja.lastTranscriptRelPath", "ccNinja.lastTranscriptRelPath"],
    ["cccNinja.lastTranscriptAbsPath", "ccNinja.lastTranscriptAbsPath"],
  ];
  for (const [oldKey, newKey] of pairs) {
    const oldValue = context.workspaceState.get(oldKey);
    const newValue = context.workspaceState.get(newKey);
    if (oldValue !== undefined && newValue === undefined) {
      context.workspaceState.update(newKey, oldValue);
    }
    if (oldValue !== undefined) {
      context.workspaceState.update(oldKey, undefined);
    }
  }
}

function refreshStatusBarTooltip(context: vscode.ExtensionContext): void {
  const relPath = context.workspaceState.get<string>(
    "ccNinja.lastTranscriptRelPath"
  );
  if (relPath) {
    statusBarItem.tooltip = `Click to update transcript\nLast captured: ${relPath}`;
  } else {
    statusBarItem.tooltip =
      "Click to update transcript — captures the current Claude Code session as a memodef:Transcript pair (envelope + sibling .body.md)";
  }
}

async function getOrPromptRoleId(
  context: vscode.ExtensionContext
): Promise<string | undefined> {
  const stored = context.workspaceState.get<string>("ccNinja.roleId");
  if (stored) return stored;

  const entered = await vscode.window.showInputBox({
    prompt:
      "What memodef role-id has Claude taken on in this workspace? (will be remembered per-workspace)",
    placeHolder: "e.g., memodef-strategist, ccc-ninja-engineer",
    ignoreFocusOut: true,
    validateInput: (value) => {
      const trimmed = value.trim();
      if (!trimmed) return "Required";
      if (!/^[a-z0-9][a-z0-9-]*$/.test(trimmed)) {
        return "Use lowercase letters, digits, and hyphens only";
      }
      return null;
    },
  });

  const trimmed = entered?.trim();
  if (!trimmed) return undefined;

  await context.workspaceState.update("ccNinja.roleId", trimmed);
  return trimmed;
}

export function deactivate() {
  statusBarItem?.dispose();
}
