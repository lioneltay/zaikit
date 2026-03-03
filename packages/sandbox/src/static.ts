import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const UI_DIR = join(__dirname, "..", "dist", "ui");

export function serveStaticFile(pathname: string): Response | null {
  const relativePath = pathname.replace(/^\//, "") || "index.html";
  const filePath = join(UI_DIR, relativePath);

  try {
    const content = readFileSync(filePath);
    const ext = extname(filePath);
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    return new Response(content, {
      headers: { "Content-Type": contentType },
    });
  } catch {
    return null;
  }
}

export function serveIndexHtml(basePath?: string): Response | null {
  const indexPath = join(UI_DIR, "index.html");

  let content: string;
  try {
    content = readFileSync(indexPath, "utf-8");
  } catch {
    return new Response("Sandbox UI not built. Run: pnpm build:ui", {
      status: 404,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // Inject <base href> so relative asset paths (./assets/...) resolve correctly
  // regardless of the URL depth (e.g. /sandbox/weather/abc-123)
  if (basePath) {
    const base = basePath.endsWith("/") ? basePath : `${basePath}/`;
    content = content.replace("<head>", `<head>\n    <base href="${base}" />`);
  }

  return new Response(content, {
    headers: { "Content-Type": "text/html" },
  });
}
