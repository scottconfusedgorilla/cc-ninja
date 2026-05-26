#!/usr/bin/env node
/**
 * cc-ninja-capture — standalone CLI for capturing Claude Code sessions
 * (CLI, desktop GUI, or any other surface that writes JSONL to ~/.claude/
 * projects/<encoded-workspace>/). Editor-agnostic sibling of the VS Code
 * extension. Same envelope shape, same routing, same on-disk layout.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawn } from "child_process";
import {
  emitTranscript,
  parseTranscript,
  formatAsMarkdown,
  deriveSubjectFromUserLines,
  normalizePath,
} from "./core";

const PACKAGE_VERSION = "0.3.0";

interface CliArgs {
  workspace: string;
  roleId?: string;
  jsonlOverride?: string;
  projectsRoot: string;
  includeSubagents: boolean;
  finalize: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (key === "help" || key === "include-subagents" || key === "finalize") {
      args[key] = true;
      continue;
    }
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return {
    workspace: path.resolve(String(args.workspace ?? process.cwd())),
    roleId:
      typeof args["role-id"] === "string"
        ? args["role-id"]
        : process.env.CC_NINJA_ROLE_ID || undefined,
    jsonlOverride: typeof args.jsonl === "string" ? args.jsonl : undefined,
    projectsRoot: path.resolve(
      String(args["projects-root"] ?? path.join(os.homedir(), ".claude", "projects"))
    ),
    includeSubagents: args["include-subagents"] === true,
    finalize: args.finalize === true,
    help: args.help === true,
  };
}

function printHelp(): void {
  process.stdout.write(
    `cc-ninja-capture v${PACKAGE_VERSION}\n` +
      `\n` +
      `  Reads the newest Claude Code JSONL session for a workspace and writes\n` +
      `  a memodef:Transcript envelope + body pair to <workspace>/transcripts/<role-id>/.\n` +
      `\n` +
      `Usage:\n` +
      `  cc-ninja-capture [options]\n` +
      `\n` +
      `Options:\n` +
      `  --workspace <path>        Workspace whose Claude Code sessions to read.\n` +
      `                              Default: current working directory.\n` +
      `  --role-id <id>            Role identity for the seat being captured.\n` +
      `                              Falls back to env CC_NINJA_ROLE_ID,\n` +
      `                              then to <workspace>/.ccninja-role file.\n` +
      `  --jsonl <path>            Override JSONL auto-detection with an explicit file.\n` +
      `  --projects-root <path>    Claude Code projects root.\n` +
      `                              Default: ~/.claude/projects\n` +
      `  --include-subagents       Also emit separate transcripts for each\n` +
      `                              subagent JSONL nested under the parent session.\n` +
      `  --finalize                Stamp the envelope's \`ended\` timestamp on this run.\n` +
      `                              Omit unless the session is actually closed.\n` +
      `  --help                    Show this.\n`
  );
}

function encodeWorkspacePath(workspace: string): string {
  // Claude Code encodes a workspace path by lowercasing the drive letter and
  // replacing EACH ':', '/', and '\\' with a single '-' (separators are NOT
  // run-collapsed: 's:\\Projects' → 's--Projects', two dashes). E.g.
  // S:\Projects\thingalog → s--Projects-thingalog.
  const lowerDrive = workspace.replace(/^([a-zA-Z]):/, (_m, d: string) => `${d.toLowerCase()}:`);
  return lowerDrive.replace(/[:\\/]/g, "-");
}

/**
 * Resolve the encoded Claude Code project directory for a workspace. Rather
 * than trust the encoder to byte-match what Claude Code wrote (the casing of
 * path segments can differ from the path we were handed, and varies across
 * Windows/WSL/macOS), we compute the expected name and then match it against
 * the actual folders in projectsRoot — exact first, then case-insensitively.
 */
async function resolveEncodedDir(
  projectsRoot: string,
  workspace: string
): Promise<{ dir: string; encoded: string }> {
  const encoded = encodeWorkspacePath(workspace);
  const exact = path.join(projectsRoot, encoded);
  try {
    if ((await fs.promises.stat(exact)).isDirectory()) return { dir: exact, encoded };
  } catch {
    /* no exact match — fall through to scan */
  }
  try {
    const entries = await fs.promises.readdir(projectsRoot, { withFileTypes: true });
    const lower = encoded.toLowerCase();
    const hit = entries.find((e) => e.isDirectory() && e.name.toLowerCase() === lower);
    if (hit) return { dir: path.join(projectsRoot, hit.name), encoded };
  } catch {
    /* projectsRoot unreadable — report the computed path in the error */
  }
  return { dir: exact, encoded };
}

async function findNewestJsonl(encodedDir: string): Promise<string | null> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(encodedDir, { withFileTypes: true });
  } catch {
    return null;
  }
  const files = entries.filter((e) => e.isFile() && e.name.endsWith(".jsonl"));
  if (files.length === 0) return null;
  let newest: { path: string; mtime: number } | null = null;
  for (const f of files) {
    const full = path.join(encodedDir, f.name);
    const stat = await fs.promises.stat(full);
    if (!newest || stat.mtimeMs > newest.mtime) {
      newest = { path: full, mtime: stat.mtimeMs };
    }
  }
  return newest?.path ?? null;
}

async function findSubagentJsonls(encodedDir: string, parentBasename: string): Promise<string[]> {
  // Subagent traces live at <encodedDir>/<parent-session-uuid>/subagents/agent-*.jsonl.
  const sessionId = parentBasename.replace(/\.jsonl$/, "");
  const subagentDir = path.join(encodedDir, sessionId, "subagents");
  try {
    const entries = await fs.promises.readdir(subagentDir);
    return entries
      .filter((e) => e.endsWith(".jsonl"))
      .map((e) => path.join(subagentDir, e));
  } catch {
    return [];
  }
}

async function readSubagentMeta(jsonlPath: string): Promise<{ agentName?: string }> {
  // sibling .meta.json named like agent-<id>.meta.json
  const metaPath = jsonlPath.replace(/\.jsonl$/, ".meta.json");
  try {
    const raw = await fs.promises.readFile(metaPath, "utf-8");
    const meta = JSON.parse(raw);
    return { agentName: meta?.agent_name ?? meta?.name ?? meta?.agentName };
  } catch {
    return {};
  }
}

async function readRoleIdFile(workspace: string): Promise<string | undefined> {
  const candidates = [
    path.join(workspace, ".ccninja-role"),
    path.join(workspace, ".cc-ninja-role"),
  ];
  for (const p of candidates) {
    try {
      const raw = await fs.promises.readFile(p, "utf-8");
      const trimmed = raw.trim();
      if (trimmed) return trimmed;
    } catch {
      /* not present */
    }
  }
  return undefined;
}

async function detectDirectorIdentity(): Promise<string | undefined> {
  return new Promise((resolve) => {
    const proc = spawn("git", ["config", "user.email"], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    proc.stdout?.on("data", (chunk: Buffer) => (out += chunk.toString()));
    proc.on("close", () => {
      const email = out.trim();
      resolve(email || process.env.USER || process.env.USERNAME);
    });
    proc.on("error", () => resolve(process.env.USER || process.env.USERNAME));
  });
}

interface CaptureSpec {
  jsonlPath: string;
  roleId: string;
  workspace: string;
  directorIdentity?: string;
  finalize: boolean;
  /** Suffix appended to filename + position to disambiguate subagent transcripts. */
  subagentLabel?: string;
}

async function capture(spec: CaptureSpec): Promise<void> {
  const raw = await fs.promises.readFile(spec.jsonlPath, "utf-8");
  const messages = parseTranscript(raw);
  if (messages.length === 0) {
    process.stderr.write(`warn: no messages parsed from ${spec.jsonlPath}\n`);
    return;
  }
  const markdownBody = formatAsMarkdown(messages, {
    includeToolCalls: true,
    includeToolResults: false,
    includeTimestamps: true,
  });

  const firstMsg = messages[0];
  const lastMsg = messages[messages.length - 1];
  const started = firstMsg?.timestamp || new Date().toISOString();
  const ended = spec.finalize ? lastMsg?.timestamp : undefined;
  const userContents = messages.filter((m) => m.role === "user").map((m) => m.content ?? "");
  const subject = deriveSubjectFromUserLines(userContents);
  const assistantMsg = messages.find((m) => m.role === "assistant");
  const model = assistantMsg?.model ?? "unknown-model";
  const sessionId = path.basename(spec.jsonlPath, ".jsonl");
  const arcSuffix = spec.subagentLabel ? ` subagent ${spec.subagentLabel}` : "";
  const sessionArc = `${model}, claude-code session ${sessionId}${arcSuffix}`;
  const sourceJsonl = normalizePath(spec.jsonlPath);

  const roleIdForFolder = spec.subagentLabel
    ? `${spec.roleId}--${spec.subagentLabel}`
    : spec.roleId;

  const result = await emitTranscript({
    transcriptsRoot: spec.workspace,
    roleId: roleIdForFolder,
    directorIdentity: spec.directorIdentity,
    started,
    ended,
    subject,
    transport: "claude-code-cli",
    captureTool: `cc-ninja-cli@${PACKAGE_VERSION}`,
    sessionArc,
    match: { key: "source_jsonl", value: sourceJsonl },
    metadata: {
      redaction_status: "raw",
      retention_policy: "permanent",
      source_jsonl: sourceJsonl,
    },
    markdownBody,
  });

  const verb = result.isNew ? "Created" : "Updated";
  process.stdout.write(
    `${verb} ${path.relative(spec.workspace, result.envelopePath)}\n`
  );

  if (result.redaction.total > 0) {
    const breakdown = result.redaction.hits
      .map((h) => `${h.type}×${h.count}`)
      .join(", ");
    process.stdout.write(
      `  redacted ${result.redaction.total} secret(s) before writing: ${breakdown}\n` +
        `  (masked in the transcript as [REDACTED:<type>] — rotate any real credentials)\n`
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const workspace = args.workspace;

  // Resolve role-id
  const roleId =
    args.roleId ?? (await readRoleIdFile(workspace));
  if (!roleId) {
    process.stderr.write(
      `error: no role-id. Pass --role-id <id>, set CC_NINJA_ROLE_ID, or create a .ccninja-role file in the workspace.\n`
    );
    process.exit(1);
  }

  // Resolve JSONL
  let parentJsonl: string | null;
  let encodedDir: string;
  if (args.jsonlOverride) {
    parentJsonl = path.resolve(args.jsonlOverride);
    encodedDir = path.dirname(parentJsonl);
  } else {
    const resolved = await resolveEncodedDir(args.projectsRoot, workspace);
    encodedDir = resolved.dir;
    parentJsonl = await findNewestJsonl(encodedDir);
    if (!parentJsonl) {
      process.stderr.write(
        `error: no .jsonl found under ${encodedDir}.\n` +
          `       (Workspace path encoded as ${resolved.encoded}.)\n`
      );
      process.exit(1);
    }
  }

  const directorIdentity = await detectDirectorIdentity();
  process.stdout.write(
    `cc-ninja-capture v${PACKAGE_VERSION}\n` +
      `  workspace:  ${workspace}\n` +
      `  role-id:    ${roleId}\n` +
      `  jsonl:      ${parentJsonl}\n` +
      (directorIdentity ? `  director:   ${directorIdentity}\n` : "")
  );

  await capture({
    jsonlPath: parentJsonl,
    roleId,
    workspace,
    directorIdentity,
    finalize: args.finalize,
  });

  if (args.includeSubagents) {
    const subagentJsonls = await findSubagentJsonls(encodedDir, path.basename(parentJsonl));
    if (subagentJsonls.length > 0) {
      process.stdout.write(`  + ${subagentJsonls.length} subagent trace(s):\n`);
      for (const sub of subagentJsonls) {
        const meta = await readSubagentMeta(sub);
        const label = meta.agentName || path.basename(sub, ".jsonl");
        await capture({
          jsonlPath: sub,
          roleId,
          workspace,
          directorIdentity,
          finalize: args.finalize,
          subagentLabel: label,
        });
      }
    }
  }
}

main().catch((err) => {
  process.stderr.write(`fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
