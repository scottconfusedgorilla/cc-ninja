#!/usr/bin/env node
import * as http from "http";
import { handleTranscript, ServerConfig } from "./handler";

const PACKAGE_VERSION = "0.1.0";

/**
 * Relay page served at GET /relay. Lets a CSP-restricted page (the Anthropic
 * Claude For Chrome Sidepanel) reach the local server by navigating here
 * with the payload encoded in the URL hash. Hash fragments stay in the
 * browser, never sent over the network — even though we're navigating to
 * http://localhost, the conversation bytes don't traverse the network until
 * this page (same-origin with the server) POSTs them to /transcript.
 */
const RELAY_HTML = `<!doctype html>
<html><head><title>cc-ninja</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; margin: 1.5em; }
  .status { padding: 0.75em 1em; border-radius: 6px; }
  .ok { background: #e7f7e7; border: 1px solid #2d8a2d; color: #1c5a1c; }
  .err { background: #fdecec; border: 1px solid #c33; color: #8a1c1c; }
  .pending { background: #f0f0f0; border: 1px solid #999; color: #333; }
  pre { background: #f7f7f7; padding: 0.75em; border-radius: 4px; overflow: auto; font-size: 0.85em; margin-top: 1em; }
</style></head>
<body>
<div id="status" class="status pending">Saving…</div>
<pre id="out" style="display:none"></pre>
<script>
(async () => {
  const statusEl = document.getElementById('status');
  const outEl = document.getElementById('out');
  function setStatus(cls, msg) { statusEl.className = 'status ' + cls; statusEl.textContent = msg; }
  function showDetails(text) { outEl.style.display = 'block'; outEl.textContent = text; }

  const hash = location.hash.slice(1);
  if (!hash) {
    setStatus('err', 'No payload in URL hash.');
    return;
  }
  let payload;
  try {
    payload = JSON.parse(decodeURIComponent(hash));
  } catch (err) {
    setStatus('err', 'Failed to parse hash payload: ' + err.message);
    return;
  }
  let res;
  try {
    res = await fetch('/transcript', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    setStatus('err', 'Network error: ' + err.message);
    return;
  }
  const data = await res.json().catch(() => ({}));
  if (res.ok) {
    const verb = data.isNew ? 'Created' : 'Updated';
    setStatus('ok', verb + ' ' + data.project + '/transcripts/' + data.position + '/');
    document.title = verb + ' — cc-ninja';
    setTimeout(() => window.close(), 1200);
  } else {
    setStatus('err', 'Server returned ' + res.status + ': ' + (data.error || 'unknown error'));
    showDetails(JSON.stringify(data, null, 2));
  }
})();
</script>
</body></html>`;

interface CliArgs {
  port: number;
  projectsRoot: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = "true";
      }
    }
  }
  const port = parseInt(args.port ?? process.env.CC_NINJA_PORT ?? "7333", 10);
  const projectsRoot =
    args["projects-root"] ?? process.env.CC_NINJA_PROJECTS_ROOT ?? "s:/Projects";
  return { port, projectsRoot };
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function setCorsHeaders(res: http.ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function logLine(msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  process.stdout.write(`[${ts}] ${msg}\n`);
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  const config: ServerConfig = {
    projectsRoot: cli.projectsRoot,
    captureToolVersion: PACKAGE_VERSION,
  };

  const server = http.createServer(async (req, res) => {
    setCorsHeaders(res);

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      sendJson(res, 200, {
        ok: true,
        version: PACKAGE_VERSION,
        projectsRoot: config.projectsRoot,
      });
      return;
    }

    if (req.method === "GET" && req.url === "/relay") {
      logLine(`GET  /relay     served`);
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(RELAY_HTML);
      return;
    }

    if (req.method === "POST" && req.url === "/transcript") {
      try {
        const raw = await readBody(req);
        const cvUrl =
          (() => {
            try {
              return JSON.parse(raw)?.conversationUrl;
            } catch {
              return undefined;
            }
          })() ?? "<no conversationUrl>";
        logLine(
          `POST /transcript  ${raw.length.toString().padStart(7)} bytes  ← ${cvUrl}`
        );
        let payload: unknown;
        try {
          payload = JSON.parse(raw);
        } catch {
          logLine(`  → 400  body is not valid JSON`);
          sendJson(res, 400, { error: "Body is not valid JSON." });
          return;
        }
        const result = await handleTranscript(payload, config);
        if (result.status === 200) {
          const b = result.body as {
            isNew?: boolean;
            project?: string;
            position?: string;
            envelopePath?: string;
          };
          const verb = b.isNew ? "Created" : "Updated";
          logLine(`  → 200  ${verb} ${b.project}/transcripts/${b.position}/`);
        } else {
          logLine(`  → ${result.status}  ${(result.body as { error?: string }).error ?? "(no message)"}`);
        }
        sendJson(res, result.status, result.body);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logLine(`  → 500  ${msg}`);
        sendJson(res, 500, { error: msg });
      }
      return;
    }

    sendJson(res, 404, { error: `No handler for ${req.method} ${req.url}` });
  });

  server.listen(cli.port, () => {
    process.stdout.write(
      `cc-ninja-server v${PACKAGE_VERSION} listening on http://localhost:${cli.port}\n` +
        `  projects-root: ${config.projectsRoot}\n` +
        `  POST /transcript  — accept conversation payload\n` +
        `  GET  /health      — liveness check\n`
    );
  });
}

main().catch((err) => {
  process.stderr.write(`fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
