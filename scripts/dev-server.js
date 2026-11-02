import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import configurationHandler from "../api/configuration.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PORT = Number(process.env.PORT || 8000);
const MAX_BODY_BYTES = 1024 * 1024;
const MIME_TYPES = {
  ".css":"text/css; charset=utf-8",
  ".html":"text/html; charset=utf-8",
  ".ico":"image/x-icon",
  ".js":"text/javascript; charset=utf-8",
  ".json":"application/json; charset=utf-8",
  ".png":"image/png",
  ".svg":"image/svg+xml",
  ".txt":"text/plain; charset=utf-8",
  ".webmanifest":"application/manifest+json; charset=utf-8",
  ".webp":"image/webp",
  ".xml":"application/xml; charset=utf-8"
};
const PUBLIC_DIRECTORIES = new Set(["assets", "css", "data", "js", "public"]);
const PUBLIC_FILES = new Set(["favicon.ico", "googlef225cee30a4b6859.html", "robots.txt", "site.webmanifest", "sitemap.xml"]);

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Cache-Control":"no-store",
    "Content-Type":"application/json; charset=utf-8"
  });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) {
      const error = new Error("Request body is too large.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.status = 400;
    throw error;
  }
}

async function handleConfiguration(req, res) {
  try {
    req.body = await readJsonBody(req);
    await configurationHandler(req, res);
  } catch (error) {
    sendJson(res, error.status || 500, {
      error:error.status ? error.message : "The local configuration service could not complete the request."
    });
    if (!error.status) console.error("Local configuration API failed:", error);
  }
}

async function handleStatic(req, res, pathname) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow:"GET, HEAD" });
    res.end();
    return;
  }
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }
  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^[/\\]+/, "");
  const filePath = resolve(ROOT, relativePath);
  const fromRoot = relative(ROOT, filePath);
  const [first, ...rest] = fromRoot.split(sep);
  const publicFile = !rest.length && PUBLIC_FILES.has(first);
  if (!fromRoot || fromRoot.startsWith(`..${sep}`) || fromRoot === ".." ||
      (first !== "index.html" && !PUBLIC_DIRECTORIES.has(first) && !publicFile)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  try {
    const file = await stat(filePath);
    if (!file.isFile()) throw new Error("Not a file");
    res.writeHead(200, {
      "Cache-Control":"no-cache",
      "Content-Length":file.size,
      "Content-Type":MIME_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream"
    });
    if (req.method === "HEAD") res.end();
    else createReadStream(filePath).pipe(res);
  } catch (error) {
    if (error.code !== "ENOENT" && error.code !== "ENOTDIR" && error.message !== "Not a file") {
      console.error("Local static file request failed:", error);
      res.writeHead(500);
      res.end("Unable to read file");
      return;
    }
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (requestUrl.pathname === "/api/configuration") {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      sendJson(res, 405, { error:"Method not allowed." });
      return;
    }
    await handleConfiguration(req, res);
    return;
  }
  await handleStatic(req, res, requestUrl.pathname);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`DrillDeck local development server: http://127.0.0.1:${PORT}`);
  console.log("The local server provides test configuration validation only; deploy to Vercel for accounts, chat and leaderboard APIs.");
});
