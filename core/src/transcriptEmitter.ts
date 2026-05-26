/**
 * Emits memodef:Transcript envelopes + sibling .body.md files per the
 * memodef-spec v0.4 proposal (transcripts/<role-id>/ folder convention).
 *
 * Transport-agnostic: vscode-claude-code (JSONL source) and claude-for-chrome
 * (DOM source via local HTTP bridge) both call into this same emitter. The
 * caller pre-derives transport/captureTool/sessionArc/subject and supplies a
 * `match` identifier (e.g. a JSONL path or a claude.ai conversation URL) that
 * the emitter uses to find an existing envelope for in-place update.
 *
 * Update semantic: if an envelope already exists in transcriptsRoot/roleId/
 * whose metadata[match.key] equals match.value AND whose `started` falls on
 * today's local date, the existing pair is updated in place. Otherwise a
 * fresh pair is created.
 */

import * as fs from "fs";
import * as path from "path";

export interface EmitOptions {
  /** Base directory; emitter writes to `${transcriptsRoot}/${roleId}/`. */
  transcriptsRoot: string;
  roleId: string;
  /** Optional human-side participant identity (e.g. an email). */
  directorIdentity?: string;
  /** ISO timestamp of session start. */
  started: string;
  /**
   * ISO timestamp of session end. Omit on every snapshot except the
   * finalize call; per v0.4 append-mode discipline `ended` should be set
   * exactly once on detected close. On update, prior `ended` is preserved
   * when this option is undefined.
   */
  ended?: string;
  /** First conversational line, used for filename slug and envelope field. */
  subject: string;
  /** e.g. "vscode-claude-code" or "claude-for-chrome". */
  transport: string;
  /** Full capture-tool identifier including version, e.g. "cc-ninja@0.15.0". */
  captureTool: string;
  /** e.g. "claude-opus-4-7, vscode-claude-code session <uuid>". */
  sessionArc: string;
  /**
   * Identifier used to match existing envelopes for update. The key names
   * the metadata field (e.g. "source_jsonl" or "source_url") and the value
   * is compared verbatim (after path-separator normalization for paths).
   */
  match: { key: string; value: string };
  /** Additional metadata fields; merged into the envelope's `metadata`. */
  metadata: Record<string, unknown>;
  /** Formatted markdown body. */
  markdownBody: string;
}

export interface EmitResult {
  envelopePath: string;
  bodyPath: string;
  isNew: boolean;
}

export async function emitTranscript(opts: EmitOptions): Promise<EmitResult> {
  const transcriptsDir = path.join(opts.transcriptsRoot, "transcripts", opts.roleId);
  await fs.promises.mkdir(transcriptsDir, { recursive: true });

  const existing = await findExistingEnvelope(transcriptsDir, opts.match);
  if (existing) {
    return updateExisting(existing, opts);
  }
  return createNew(transcriptsDir, opts);
}

async function findExistingEnvelope(
  transcriptsDir: string,
  match: { key: string; value: string }
): Promise<string | null> {
  let entries: string[];
  try {
    entries = await fs.promises.readdir(transcriptsDir);
  } catch {
    return null;
  }

  const today = localDateString(new Date());
  const targetValue = normalizePath(match.value);

  for (const entry of entries) {
    if (!entry.endsWith(".openthing")) continue;
    const fullPath = path.join(transcriptsDir, entry);
    try {
      const raw = await fs.promises.readFile(fullPath, "utf-8");
      const env = JSON.parse(raw);
      if (env?.type !== "memodef:Transcript") continue;
      const recorded = env?.metadata?.[match.key];
      if (typeof recorded !== "string") continue;
      if (normalizePath(recorded) !== targetValue) continue;
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

async function updateExisting(envelopePath: string, opts: EmitOptions): Promise<EmitResult> {
  const raw = await fs.promises.readFile(envelopePath, "utf-8");
  const prior = JSON.parse(raw) as Record<string, unknown>;

  const ended = opts.ended ?? (prior.ended as string | undefined);
  const env = buildEnvelope({
    participants: (prior.participants as unknown[]) ?? [],
    started: String(prior.started ?? opts.started),
    ended,
    subject: String(prior.subject ?? opts.subject),
    transport: String(prior.transport ?? opts.transport),
    captureTool: opts.captureTool,
    captureFormat: String(prior.capture_format ?? "markdown"),
    bodyRef: String(prior.body_ref ?? ""),
    metadata: mergeMetadata(prior.metadata, opts.metadata),
    extras: extractExtras(prior),
  });

  const bodyPath = path.join(path.dirname(envelopePath), env.body_ref as string);
  await fs.promises.writeFile(bodyPath, opts.markdownBody, "utf-8");
  await fs.promises.writeFile(envelopePath, JSON.stringify(env, null, 2) + "\n", "utf-8");

  return { envelopePath, bodyPath, isNew: false };
}

async function createNew(transcriptsDir: string, opts: EmitOptions): Promise<EmitResult> {
  const filenameStem = `${filenameDatePart(opts.started)}--${opts.roleId}--${slugify(opts.subject)}`;
  const envelopeFilename = `${filenameStem}.openthing`;
  const bodyFilename = `${filenameStem}.body.md`;

  const participants: Array<Record<string, string>> = [
    { position: opts.roleId, session_arc: opts.sessionArc },
  ];
  if (opts.directorIdentity) {
    participants.push({ position: "director", identity: opts.directorIdentity });
  }

  const env = buildEnvelope({
    participants,
    started: opts.started,
    ended: opts.ended,
    subject: opts.subject,
    transport: opts.transport,
    captureTool: opts.captureTool,
    captureFormat: "markdown",
    bodyRef: bodyFilename,
    metadata: opts.metadata,
  });

  const envelopePath = path.join(transcriptsDir, envelopeFilename);
  const bodyPath = path.join(transcriptsDir, bodyFilename);

  await fs.promises.writeFile(bodyPath, opts.markdownBody, "utf-8");
  await fs.promises.writeFile(envelopePath, JSON.stringify(env, null, 2) + "\n", "utf-8");

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

export function normalizePath(p: string): string {
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

/**
 * Harness-injected user-turn preambles that are NOT the human's words.
 * These arrive as ordinary (untagged) user content — unlike <command-name>,
 * <system-reminder>, <ide_opened_file> etc. which the leading-'<' rule catches.
 * Slash-command / skill expansions begin with "Base directory for this skill:";
 * bash-command output blocks begin with the "Caveat:" preamble.
 */
const HARNESS_INJECTION_PREFIXES = [
  "Base directory for this skill:",
  "Caveat: The messages below were generated by the user while running",
];

function isHarnessInjectedUserContent(content: string): boolean {
  if (content.startsWith("<")) return true;
  return HARNESS_INJECTION_PREFIXES.some((p) => content.startsWith(p));
}

/** Skip harness/system injections and return the first conversational user line. */
export function deriveSubjectFromUserLines(userContents: string[]): string {
  for (const raw of userContents) {
    const content = raw?.trim();
    if (!content) continue;
    if (isHarnessInjectedUserContent(content)) continue;
    const firstLine = content.split("\n")[0].trim();
    return firstLine.length > 80 ? firstLine.slice(0, 77) + "..." : firstLine;
  }
  return "session-transcript";
}

export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/, "");
  return slug || "session";
}
