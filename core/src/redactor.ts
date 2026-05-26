/**
 * Secret redaction for transcript bodies.
 *
 * cc-ninja redacts on EVERY save — there is no opt-out. A capture tool whose
 * output lands in git (and is pushed) must never be the mechanism that
 * launders a recognizable secret into history. If you genuinely need a secret
 * preserved verbatim, do it outside the tool; cc-ninja will not help with that.
 *
 * Pattern policy: HIGH-CONFIDENCE only. Each rule matches a vendor key format
 * or private-key block where a hit is unambiguously a secret, so redaction
 * never silently corrupts legitimate conversation content. Generic
 * `keyword=value` and bare-JWT matching are deliberately deferred — their
 * false-positive risk would damage the record (a footgun aimed at the user
 * instead of at a leak). Add them later behind explicit tuning.
 *
 * Redaction never emits the matched bytes: each span is replaced with
 * `[REDACTED:<rule-name>]`, so the record stays legible about WHAT was removed
 * without exposing it.
 */

export const REDACTION_TOOL = "cc-ninja-redactor@1";

export interface RedactionRule {
  name: string;
  pattern: RegExp;
}

export interface RedactionHit {
  type: string;
  count: number;
}

export interface RedactionResult {
  /** Body with every recognized secret replaced by [REDACTED:<type>]. */
  text: string;
  /** Per-rule match counts (never the matched values). */
  hits: RedactionHit[];
  /** Total masked spans across all rules. */
  total: number;
}

/**
 * Order matters: more specific prefixes (anthropic `sk-ant-`) run before
 * broader ones (openai `sk-`) so the specific type label wins.
 */
const RULES: RedactionRule[] = [
  { name: "anthropic-key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { name: "openai-key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9]{20,}/g },
  { name: "aws-access-key-id", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "github-pat", pattern: /\bgithub_pat_[A-Za-z0-9_]{22,}/g },
  { name: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { name: "google-api-key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g },
  { name: "stripe-key", pattern: /\b[sr]k_live_[A-Za-z0-9]{16,}\b/g },
  { name: "bearer-token", pattern: /\bBearer\s+[A-Za-z0-9\-._~+/]{20,}={0,2}/g },
  {
    name: "private-key-block",
    pattern:
      /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
  },
];

/** Mask every recognized secret in `input`. Pure; safe to call repeatedly. */
export function redactSecrets(input: string): RedactionResult {
  let text = input;
  const hits: RedactionHit[] = [];
  let total = 0;
  for (const rule of RULES) {
    let count = 0;
    text = text.replace(rule.pattern, () => {
      count++;
      return `[REDACTED:${rule.name}]`;
    });
    if (count > 0) {
      hits.push({ type: rule.name, count });
      total += count;
    }
  }
  return { text, hits, total };
}
