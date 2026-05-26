import * as path from "path";
import { emitTranscript, deriveSubjectFromUserLines, EmitResult } from "./core";
import { parseRoutingTags } from "./tagParser";

export interface TranscriptPayload {
  /** Unique identifier for this conversation; used as the match key for in-place update. */
  conversationUrl: string;
  /** ISO start time. */
  startedAt: string;
  /** ISO end time; only present on finalize. */
  endedAt?: string;
  /** Pre-formatted markdown body, including the routing-tag line. */
  bodyMarkdown: string;
  /** Optional subject fallback if no conversational user line is detectable. */
  title?: string;
  /** Optional model name used in the sessionArc field. */
  model?: string;
}

export interface ServerConfig {
  projectsRoot: string;
  captureToolVersion: string;
}

export interface HandlerResult {
  status: number;
  body: Record<string, unknown>;
}

export async function handleTranscript(
  payload: unknown,
  config: ServerConfig
): Promise<HandlerResult> {
  const parsed = validatePayload(payload);
  if ("error" in parsed) {
    return { status: 400, body: { error: parsed.error } };
  }

  const tags = parseRoutingTags(parsed.bodyMarkdown);
  if (!tags) {
    return {
      status: 400,
      body: {
        error:
          "No routing-tag line found. Add a line like: [project]=cc-ninja [position]=ccc-ninja-engineer [user]=scott@confusedgorilla.com",
      },
    };
  }

  const project = sanitizeSegment(tags.project);
  const position = sanitizeSegment(tags.position);
  if (!project || !position) {
    return {
      status: 400,
      body: { error: "Project or position contains disallowed characters." },
    };
  }

  const transcriptsRoot = path.join(config.projectsRoot, project);
  const subject = deriveSubject(parsed.bodyMarkdown, parsed.title);
  const sessionId = extractSessionId(parsed.conversationUrl);
  const sessionArc = `${parsed.model ?? "claude"}, claude-for-chrome session ${sessionId}`;

  const result: EmitResult = await emitTranscript({
    transcriptsRoot,
    roleId: position,
    directorIdentity: tags.user,
    started: parsed.startedAt,
    ended: parsed.endedAt,
    subject,
    transport: "claude-for-chrome",
    captureTool: `cc-ninja-server@${config.captureToolVersion}`,
    sessionArc,
    match: { key: "source_url", value: parsed.conversationUrl },
    metadata: {
      redaction_status: "raw",
      retention_policy: "permanent",
      source_url: parsed.conversationUrl,
    },
    markdownBody: parsed.bodyMarkdown,
  });

  return {
    status: 200,
    body: {
      envelopePath: result.envelopePath,
      bodyPath: result.bodyPath,
      isNew: result.isNew,
      project,
      position,
      redaction: result.redaction,
    },
  };
}

type ValidPayload = TranscriptPayload;
type ValidationResult = ValidPayload | { error: string };

function validatePayload(p: unknown): ValidationResult {
  if (!p || typeof p !== "object") return { error: "Body must be a JSON object." };
  const o = p as Record<string, unknown>;
  if (typeof o.conversationUrl !== "string" || !o.conversationUrl) {
    return { error: "Missing required string: conversationUrl" };
  }
  if (typeof o.startedAt !== "string" || !o.startedAt) {
    return { error: "Missing required string: startedAt (ISO timestamp)" };
  }
  if (typeof o.bodyMarkdown !== "string" || !o.bodyMarkdown) {
    return { error: "Missing required string: bodyMarkdown" };
  }
  return {
    conversationUrl: o.conversationUrl,
    startedAt: o.startedAt,
    endedAt: typeof o.endedAt === "string" ? o.endedAt : undefined,
    bodyMarkdown: o.bodyMarkdown,
    title: typeof o.title === "string" ? o.title : undefined,
    model: typeof o.model === "string" ? o.model : undefined,
  };
}

/** Allow only [a-z0-9-]; reject anything that could traverse the filesystem. */
function sanitizeSegment(s: string): string | null {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(s)) return null;
  return s;
}

function extractSessionId(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * For a markdown body produced by the Chrome extension, the structure may be
 * `## User\n...\n## Assistant\n...`. Pull user-section bodies and feed them to
 * the shared deriveSubjectFromUserLines helper, which skips harness/tag lines.
 */
function deriveSubject(body: string, fallbackTitle: string | undefined): string {
  const userBlocks = extractUserBlocks(body);
  if (userBlocks.length > 0) {
    const subject = deriveSubjectFromUserLines(userBlocks);
    if (subject && subject !== "session-transcript") return subject;
  }
  if (fallbackTitle && fallbackTitle.trim()) return fallbackTitle.trim().slice(0, 80);
  return "session-transcript";
}

function extractUserBlocks(body: string): string[] {
  const blocks: string[] = [];
  const lines = body.split(/\r?\n/);
  let current: string[] | null = null;
  for (const line of lines) {
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      if (current) {
        blocks.push(stripTagLines(current.join("\n")).trim());
        current = null;
      }
      if (/^user\b/i.test(heading[1])) current = [];
      continue;
    }
    if (current) current.push(line);
  }
  if (current) blocks.push(stripTagLines(current.join("\n")).trim());
  return blocks.filter((b) => b.length > 0);
}

function stripTagLines(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !/\[project\]=\S+/.test(line) || !/\[position\]=\S+/.test(line))
    .join("\n");
}
