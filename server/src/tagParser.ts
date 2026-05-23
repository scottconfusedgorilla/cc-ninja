/**
 * Finds the last line in the body that contains all three routing tags on
 * one line: [project]=<value> [position]=<value> [user]=<value>. The "last"
 * rule lets the user override an earlier setting later in the conversation
 * (the conversation is the memory). All three keys are required on the same
 * line to eliminate false positives from prose that happens to mention one.
 */

export interface RoutingTags {
  project: string;
  position: string;
  user: string;
}

export function parseRoutingTags(body: string): RoutingTags | null {
  const lines = body.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const tags = extractTagsFromLine(lines[i]);
    if (tags) return tags;
  }
  return null;
}

function extractTagsFromLine(line: string): RoutingTags | null {
  const project = matchTag(line, "project");
  const position = matchTag(line, "position");
  const user = matchTag(line, "user");
  if (!project || !position || !user) return null;
  return { project, position, user };
}

function matchTag(line: string, key: string): string | null {
  const regex = new RegExp(`\\[${key}\\]=(\\S+)`);
  const m = line.match(regex);
  return m ? m[1] : null;
}
