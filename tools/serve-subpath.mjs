// Test: servíruje dist/ v podsložce /konfigurator-loga/ (jako GitHub Pages projektová stránka).
// Spuštění: node tools/serve-subpath.mjs  → http://localhost:4174/konfigurator-loga/
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "dist");
const PREFIX = "/konfigurator-loga/";
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json", ".svg": "image/svg+xml", ".txt": "text/plain" };

createServer(async (req, res) => {
  let url = decodeURIComponent(req.url.split("?")[0]);
  if (!url.startsWith(PREFIX)) { res.writeHead(404); res.end("mimo prefix " + PREFIX); return; }
  let rel = url.slice(PREFIX.length) || "index.html";
  const file = path.join(ROOT, rel);
  try {
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404); res.end("not found: " + rel);
  }
}).listen(4174, () => console.log("http://localhost:4174" + PREFIX));
