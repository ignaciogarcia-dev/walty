/**
 * Minimal static file server for the spike, on a plain localhost origin.
 *
 * CRITICAL for objective 3: it sends NO Cross-Origin-Opener-Policy and NO
 * Cross-Origin-Embedder-Policy headers, so the page is NOT cross-origin
 * isolated. If init/keygen/sign still succeed here, COOP/COEP are not needed.
 *
 * `withIsolation` (env SPIKE_COOP=1) flips on COOP/COEP to prove isolation
 * does not BREAK it either.
 */
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
  ".map": "application/json",
};

export function startServer(
  rootDir: string,
  opts: { withIsolation?: boolean } = {},
): Promise<{ server: Server; port: number; url: string }> {
  const server = createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      const rel = urlPath === "/" ? "/index.html" : urlPath;
      const filePath = normalize(join(rootDir, rel));
      if (!filePath.startsWith(rootDir)) {
        res.writeHead(403).end("forbidden");
        return;
      }
      const data = await readFile(filePath);
      const headers: Record<string, string> = {
        "Content-Type": MIME[extname(filePath)] || "application/octet-stream",
        "Cache-Control": "no-store",
      };
      if (opts.withIsolation) {
        headers["Cross-Origin-Opener-Policy"] = "same-origin";
        headers["Cross-Origin-Embedder-Policy"] = "require-corp";
        headers["Cross-Origin-Resource-Policy"] = "same-origin";
      }
      res.writeHead(200, headers).end(data);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ server, port, url: `http://127.0.0.1:${port}/` });
    });
  });
}
