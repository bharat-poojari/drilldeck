import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import configurationHandler from "../api/configuration.js";
import chatHandler from "../api/chat.js";
import leaderboardHandler from "../api/leaderboard.js";
import { configureLocalJsonStorage } from "../lib/server/github-json.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ENV_FILE = join(ROOT, ".env");
if (existsSync(ENV_FILE)) {
  if (typeof process.loadEnvFile !== "function") {
    throw new Error("Loading .env requires Node.js 20.12 or newer.");
  }
  process.loadEnvFile(ENV_FILE);
}
const PORT = Number(process.env.PORT || 8000);
const useGitHubStorage = process.env.DRILLDECK_USE_GITHUB_STORAGE === "true";
if (!useGitHubStorage) {
  configureLocalJsonStorage(resolve(process.env.DRILLDECK_LOCAL_STORAGE_DIR || resolve(ROOT, ".local-data")));
}
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
const PUBLIC_DIRECTORIES = new Set(["about", "assets", "css", "data", "exams", "js", "mock-tests", "public", "subjects"]);
const PUBLIC_FILES = new Set(["404.html", "browserconfig.xml", "favicon.ico", "googlef225cee30a4b6859.html", "robots.txt", "service-worker.js", "site.webmanifest", "sitemap.xml"]);
const SEO_REDIRECTS = new Map([
  ["/kea-exam-preparation", "/exams/"],
  ["/fda-exam-preparation", "/exams/kea-fda/"],
  ["/sda-exam-preparation", "/exams/kea-sda/"],
  ["/karnataka-gk", "/subjects/general-knowledge/"],
  ["/current-affairs", "/subjects/current-affairs/"],
  ["/general-science", "/subjects/general-science/"],
  ["/geography", "/subjects/geography/"],
  ["/about", "/about/"]
]);
const API_HANDLERS = new Map([
  ["/api/chat", chatHandler],
  ["/api/leaderboard", leaderboardHandler]
]);

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Cache-Control":"no-store",
    "Content-Type":"application/json; charset=utf-8"
  });
  res.end(JSON.stringify(body));
}

async function sendNotFound(req, res) {
  const filePath = resolve(ROOT, "404.html");
  try {
    const file = await stat(filePath);
    res.writeHead(404, {
      "Cache-Control":"no-cache",
      "Content-Length":file.size,
      "Content-Type":"text/html; charset=utf-8"
    });
    if (req.method === "HEAD") res.end();
    else createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error("Custom 404 page could not be served:", error);
    res.writeHead(404, { "Content-Type":"text/plain; charset=utf-8" });
    res.end("Not found");
  }
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

async function handleApiFunction(req, res, handler) {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") {
      req.body = await readJsonBody(req);
    }
    await handler(req, res);
  } catch (error) {
    sendJson(res, error.status || 500, {
      error:error.status ? error.message : "The local API request could not be completed."
    });
    if (!error.status) console.error("Local API request failed:", error);
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
  const relativePath = decodedPath === "/"
    ? "index.html"
    : decodedPath.endsWith("/")
      ? `${decodedPath.replace(/^[/\\]+|[/\\]+$/g, "")}/index.html`
      : decodedPath.replace(/^[/\\]+/, "");
  const isDownload = relativePath.startsWith("downloads/") || relativePath.startsWith(`downloads${sep}`);
  let filePath = resolve(ROOT, isDownload
    ? join("public", relativePath)
    : relativePath);
  const fromRoot = relative(ROOT, filePath);
  const [first, ...rest] = fromRoot.split(sep);
  const publicFile = !rest.length && PUBLIC_FILES.has(first);
  if (!fromRoot || fromRoot.startsWith(`..${sep}`) || fromRoot === ".." ||
      (first !== "index.html" && !PUBLIC_DIRECTORIES.has(first) && !publicFile)) {
    await sendNotFound(req, res);
    return;
  }
  try {
    let file;
    try {
      file = await stat(filePath);
    } catch (error) {
      if (decodedPath !== "/data/datasets.json" || (error.code !== "ENOENT" && error.code !== "ENOTDIR")) {
        throw error;
      }
      filePath = resolve(ROOT, "public", "data", "datasets.json");
      file = await stat(filePath);
    }
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
    await sendNotFound(req, res);
  }
}

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const redirect = SEO_REDIRECTS.get(requestUrl.pathname);
  if (redirect) {
    res.writeHead(308, { Location:`${redirect}${requestUrl.search}` });
    res.end();
    return;
  }
  if (requestUrl.pathname === "/api/configuration") {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      sendJson(res, 405, { error:"Method not allowed." });
      return;
    }
    await handleConfiguration(req, res);
    return;
  }
  const apiHandler = API_HANDLERS.get(requestUrl.pathname);
  if (apiHandler) {
    await handleApiFunction(req, res, apiHandler);
    return;
  }
  await handleStatic(req, res, requestUrl.pathname);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`DrillDeck local development server: http://127.0.0.1:${PORT}`);
  console.log(useGitHubStorage
    ? "Chat and leaderboard APIs use GitHub JSON storage."
    : "Chat and leaderboard APIs use local JSON storage in .local-data/.");
});
