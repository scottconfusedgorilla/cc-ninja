/**
 * Emits memodef:Transcript envelopes + sibling .body.md files per the
 * memodef-spec v0.4 proposal (transcripts/<role-id>/ folder convention).
 *
 * Update semantic: if an envelope already exists in the destination folder
 * whose metadata.source_jsonl matches the JSONL being captured AND whose
 * `started` falls on today's local date, the existing pair is updated in
 * place. Otherwise a fresh pair is created.
 */

import * as fs from "fs";
import * as path from "path";
import { ParsedMessage } from "./parser";

export interface EmitOptions {
  roleId: string;
  directorIdentity?: string;
  workspaceRoot: string;
  jsonlPath: string;
  messages: ParsedMessage[];
  markdownBody: string;
  packageVersion: string;
  /**
   * When true, populate `ended` with the timestamp of the last captured
   * message. When false (default), leave `ended` absent on creation and
   * preserve any prior value on update — per v0.4 append-mode discipline,
   * the envelope's only mutable field is `ended` and it should be set
   * exactly once on detected close, not on every snapshot.
   */
  finalize?: boolean;
}

export interface EmitResult {
  envelopePath: string;
  bodyPath: string;
  isNew: boolean;
}

export async function emitTranscript(opts: EmitOptions): Promise<EmitResult> {
  const transcriptsDir = path.join(opts.workspaceRoot, "transcripts", opts.roleId);
  await fs.promises.mkdir(transcriptsDir, { recursive: true });

  const existing = await findExistingEnvelope(transcriptsDir, opts.jsonlPath);
  if (existing) {
    return updateExisting(existing, opts);
  }
  return createNew(transcriptsDir, opts);
}

async function findExistingEnvelope(
  transcriptsDir: string,
  jsonlPath: string
): Promise<string | null> {
  let entries: string[];
  try {
    entries = await fs.promises.readdir(transcriptsDir);
  } catch {
    return null;
  }

  const today = localDateString(new Date());
  const targetJsonl = normalizePath(jsonlPath);

  for (const entry of entries) {
    if (!entry.endsWith(".openthing")) continue;
    const fullPath = path.join(transcriptsDir, entry);
    try {
      const raw = await fs.promises.readFile(fullPath, "utf-8");
      const env = JSON.parse(raw);
      if (env?.type !== "memodef:Transcript") continue;
      const recordedJsonl = env?.metadata?.source_jsonl;
      if (typeof recordedJsonl !== "string") continue;
      if (normalizePath(recordedJsonl) !== targetJsonl) continue;
      const started = env?.started;
      if (typeof started !== "string") continue;
      if (localDateString(new Date(started)) !== today) continue;
      return fullPath;
    } catch {
      continue;
    }
  }
  return null;
}

async function updateExisting(
  envelopePath: string,
  opts: EmitOptions
): Promise<EmitResult> {
  const raw = await fs.promises.readFile(envelopePath, "utf-8");
  const prior = JSON.parse(raw) as Record<string, unknown>;

  const ended = opts.finalize
    ? opts.messages[opts.messages.length - 1]?.timestamp
    : (prior.ended as string | undefined);
  const env = buildEnvelope({
    participants: (prior.participants as unknown[]) ?? [],
    started: String(prior.started ?? ""),
    ended,
    subject: String(prior.subject ?? ""),
    transport: String(prior.transport ?? "vscode-claude-code"),
    captureTool: `ccc-ninja@${opts.packageVersion}`,
    captureFormat: String(prior.capture_format ?? "markdown"),
    bodyRef: String(prior.body_ref ?? ""),
    metadata: mergeMetadata(prior.metadata, { source_jsonl: normalizePath(opts.jsonlPath) }),
    extras: extractExtras(prior),
  });

  const bodyPath = path.join(path.dirname(envelopePath), env.body_ref as string);
  await fs.promises.writeFile(bodyPath, opts.markdownBody, "utf-8");
  await fs.promises.writeFile(
    envelopePath,
    JSON.stringify(env, null, 2) + "\n",
    "utf-8"
  );

  return { envelopePath, bodyPath, isNew: false };
}

async function createNew(
  transcriptsDir: string,
  opts: EmitOptions
): Promise<EmitResult> {
  const firstMsg = opts.messages[0];
  const started = firstMsg?.timestamp || new Date().toISOString();
  const ended = opts.finalize
    ? opts.messages[opts.messages.length - 1]?.timestamp
    : undefined;

  const subject = deriveSubject(opts.messages);
  const filenameStem = `${filenameDatePart(started)}--${opts.roleId}--${slugify(subject)}`;
  const envelopeFilename = `${filenameStem}.openthing`;
  const bodyFilename = `${filenameStem}.body.md`;

  const participants: Array<Record<string, string>> = [
    { position: opts.roleId, session_arc: deriveSessionArc(opts.messages, opts.jsonlPath) },
  ];
  if (opts.directorIdentity) {
    participants.push({ position: "director", identity: opts.directorIdentity });
  }

  const env = buildEnvelope({
    participants,
    started,
    ended,
    subject,
    transport: "vscode-claude-code",
    captureTool: `ccc-ninja@${opts.packageVersion}`,
    captureFormat: "markdown",
    bodyRef: bodyFilename,
    metadata: {
      redaction_status: "raw",
      retention_policy: "permanent",
      source_jsonl: normalizePath(opts.jsonlPath),
    },
  });

  const envelopePath = path.join(transcriptsDir, envelopeFilename);
  const bodyPath = path.join(transcriptsDir, bodyFilename);

  await fs.promises.writeFile(bodyPath, opts.markdownBody, "utf-8");
  await fs.promises.writeFile(
    envelopePath,
    JSON.stringify(env, null, 2) + "\n",
    "utf-8"
  );

  return { envelopePath, bodyPath, isNew: true };
}

interface EnvelopeShape {
  participants: unknown;
  started: string;
  ended?: string;
  subject: string;
  transport: string;
  captureTool: string;
  captureFormat: string;
  bodyRef: string;
  metadata: Record<string, unknown>;
  extras?: Record<string, unknown>;
}

function buildEnvelope(s: EnvelopeShape): Record<string, unknown> {
  const env: Record<string, unknown> = {
    catdef: "1.4",
    memodef: "0.4.0",
    type: "memodef:Transcript",
    participants: s.participants,
    started: s.started,
  };
  if (s.ended) env.ended = s.ended;
  env.subject = s.subject;
  env.transport = s.transport;
  env.capture_tool = s.captureTool;
  env.capture_format = s.captureFormat;
  env.body_ref = s.bodyRef;
  if (s.extras) {
    for (const [k, v] of Object.entries(s.extras)) {
      env[k] = v;
    }
  }
  env.metadata = s.metadata;
  return env;
}

function mergeMetadata(
  prior: unknown,
  overrides: Record<string, unknown>
): Record<string, unknown> {
  const base = (prior && typeof prior === "object" ? prior : {}) as Record<string, unknown>;
  return { ...base, ...overrides };
}

const CANONICAL_KEYS = new Set([
  "catdef",
  "memodef",
  "type",
  "participants",
  "started",
  "ended",
  "subject",
  "transport",
  "capture_tool",
  "capture_format",
  "body_ref",
  "metadata",
]);

function extractExtras(prior: Record<string, unknown>): Record<string, unknown> {
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(prior)) {
    if (!CANONICAL_KEYS.has(k)) extras[k] = v;
  }
  return extras;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

function localDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function filenameDatePart(iso: string): string {
  const d = new Date(iso);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}-${hh}${mm}`;
}

function deriveSubject(messages: ParsedMessage[]): string {
  // Skip user messages whose first non-whitespace character is `<` — those
  // are harness/system injections like <ide_opened_file>, <system-reminder>,
  // <command-name>, <user-prompt-submit-hook>, <local-command-stdout>.
  // The first conversational turn is what belongs in the subject.
  for (const msg of messages) {
    if (msg.role !== "user") continue;
    const content = msg.content?.trim();
    if (!content) continue;
    if (content.startsWith("<")) continue;
    const firstLine = content.split("\n")[0].trim();
    return firstLine.length > 80 ? firstLine.slice(0, 77) + "..." : firstLine;
  }
  return "session-transcript";
}

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/, "");
  return slug || "session";
}

function deriveSessionArc(messages: ParsedMessage[], jsonlPath: string): string {
  const assistantMsg = messages.find((m) => m.role === "assistant");
  const model = assistantMsg?.model ?? "unknown-model";
  const sessionId = path.basename(jsonlPath, ".jsonl");
  return `${model}, vscode-claude-code session ${sessionId}`;
}
