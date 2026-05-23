/**
 * VS Code adapter for the shared @cc-ninja/core emitter. Derives transport,
 * captureTool, sessionArc, started/ended, subject from VS Code's ParsedMessage
 * stream and a JSONL path; delegates the actual envelope + body writes to core.
 */

import * as path from "path";
import {
  emitTranscript as coreEmit,
  deriveSubjectFromUserLines,
  normalizePath,
  EmitResult,
} from "./core";
import { ParsedMessage } from "./core";

export interface EmitOptions {
  roleId: string;
  directorIdentity?: string;
  workspaceRoot: string;
  jsonlPath: string;
  messages: ParsedMessage[];
  markdownBody: string;
  packageVersion: string;
  /** When true, populate `ended` from the last captured message timestamp. */
  finalize?: boolean;
}

export type { EmitResult };

export async function emitTranscript(opts: EmitOptions): Promise<EmitResult> {
  const firstMsg = opts.messages[0];
  const lastMsg = opts.messages[opts.messages.length - 1];
  const started = firstMsg?.timestamp || new Date().toISOString();
  const ended = opts.finalize ? lastMsg?.timestamp : undefined;

  const userContents = opts.messages
    .filter((m) => m.role === "user")
    .map((m) => m.content ?? "");
  const subject = deriveSubjectFromUserLines(userContents);

  const assistantMsg = opts.messages.find((m) => m.role === "assistant");
  const model = assistantMsg?.model ?? "unknown-model";
  const sessionId = path.basename(opts.jsonlPath, ".jsonl");
  const sessionArc = `${model}, vscode-claude-code session ${sessionId}`;

  const sourceJsonl = normalizePath(opts.jsonlPath);

  return coreEmit({
    transcriptsRoot: opts.workspaceRoot,
    roleId: opts.roleId,
    directorIdentity: opts.directorIdentity,
    started,
    ended,
    subject,
    transport: "vscode-claude-code",
    captureTool: `cc-ninja@${opts.packageVersion}`,
    sessionArc,
    match: { key: "source_jsonl", value: sourceJsonl },
    metadata: {
      redaction_status: "raw",
      retention_policy: "permanent",
      source_jsonl: sourceJsonl,
    },
    markdownBody: opts.markdownBody,
  });
}
