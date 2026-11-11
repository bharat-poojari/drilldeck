import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";

const API_ROOT = "https://api.github.com";
const MAX_WRITE_ATTEMPTS = 4;
const localWriteQueues = new Map();
let localStorageDirectory = null;

export function configureLocalJsonStorage(directory) {
  if (!isAbsolute(directory)) {
    throw new TypeError("The local JSON storage directory must be an absolute path.");
  }
  localStorageDirectory = resolve(directory);
}

function getConfiguration() {
  const token = process.env.EXAMDESK_GITHUB_TOKEN || process.env.drilldeck_GITHUB_TOKEN;
  const owner = process.env.EXAMDESK_GITHUB_OWNER || process.env.drilldeck_GITHUB_OWNER;
  const repo = process.env.EXAMDESK_GITHUB_REPO || process.env.drilldeck_GITHUB_REPO;
  const branch = process.env.EXAMDESK_GITHUB_BRANCH || process.env.drilldeck_GITHUB_BRANCH;
  if (!token || !owner || !repo) {
    throw new Error("Missing required GitHub storage configuration.");
  }
  return {
    token,
    owner,
    repo,
    branch: branch || "main"
  };
}

async function githubRequest(path, options = {}) {
  const config = getConfiguration();
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) {
    if (response.status === 409 || response.status === 422) {
      const error = new Error("GitHub JSON file changed during an update.");
      error.conflict = true;
      throw error;
    }
    throw new Error(`GitHub storage request failed (${response.status}).`);
  }
  return response.status === 204 ? null : response.json();
}

function getFileUrl(filePath, branch) {
  const config = getConfiguration();
  const owner = encodeURIComponent(config.owner);
  const repo = encodeURIComponent(config.repo);
  const file = filePath.split("/").map(encodeURIComponent).join("/");
  return `/repos/${owner}/${repo}/contents/${file}?ref=${encodeURIComponent(branch)}`;
}

function getLocalFilePath(filePath) {
  if (typeof filePath !== "string" || !filePath ||
      filePath.split(/[\\/]/).some(segment => !segment || segment === "." || segment === "..")) {
    throw new TypeError("The local JSON storage path is invalid.");
  }
  const resolvedPath = resolve(localStorageDirectory, ...filePath.split(/[\\/]/));
  const pathFromRoot = relative(localStorageDirectory, resolvedPath);
  if (!pathFromRoot || pathFromRoot.startsWith(`..${sep}`) || pathFromRoot === ".." || isAbsolute(pathFromRoot)) {
    throw new TypeError("The local JSON storage path is invalid.");
  }
  return resolvedPath;
}

async function readLocalJsonFile(filePath, fallback) {
  let contents;
  try {
    contents = await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return { data: structuredClone(fallback), sha: null };
    throw error;
  }
  try {
    return { data: JSON.parse(contents), sha: null };
  } catch {
    throw new Error(`Local JSON storage file "${relative(localStorageDirectory, filePath)}" contains invalid JSON.`);
  }
}

export async function readJsonFile(filePath, fallback) {
  if (localStorageDirectory) {
    return readLocalJsonFile(getLocalFilePath(filePath), fallback);
  }

  const config = getConfiguration();
  let file;
  try {
    file = await githubRequest(getFileUrl(filePath, config.branch));
  } catch (error) {
    if (error.message.includes("(404)")) return { data: structuredClone(fallback), sha: null };
    throw error;
  }
  if (!file || typeof file.content !== "string" || file.encoding !== "base64") {
    throw new Error(`GitHub storage file "${filePath}" is not available as base64 JSON.`);
  }
  try {
    return {
      data: JSON.parse(Buffer.from(file.content, "base64").toString("utf8")),
      sha: file.sha
    };
  } catch {
    throw new Error(`GitHub storage file "${filePath}" contains invalid JSON.`);
  }
}

export async function updateJsonFile(filePath, fallback, mutate) {
  if (localStorageDirectory) {
    const localFilePath = getLocalFilePath(filePath);
    const previousWrite = localWriteQueues.get(localFilePath) || Promise.resolve();
    let releaseWrite;
    const currentWrite = new Promise(resolveWrite => {
      releaseWrite = resolveWrite;
    });
    localWriteQueues.set(localFilePath, currentWrite);
    await previousWrite;
    try {
      const current = await readLocalJsonFile(localFilePath, fallback);
      const next = await mutate(structuredClone(current.data));
      await mkdir(dirname(localFilePath), { recursive: true });
      const temporaryPath = resolve(dirname(localFilePath), `.${basename(localFilePath)}.${randomUUID()}.tmp`);
      await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
      try {
        await rename(temporaryPath, localFilePath);
      } catch (error) {
        try {
          await unlink(temporaryPath);
        } catch (cleanupError) {
          if (cleanupError.code !== "ENOENT") throw cleanupError;
        }
        throw error;
      }
      return next;
    } finally {
      releaseWrite();
      if (localWriteQueues.get(localFilePath) === currentWrite) {
        localWriteQueues.delete(localFilePath);
      }
    }
  }

  const config = getConfiguration();
  let lastConflict;
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const current = await readJsonFile(filePath, fallback);
    const next = await mutate(structuredClone(current.data));
    const body = {
      message: `Update DrillDeck ${filePath}`,
      content: Buffer.from(`${JSON.stringify(next, null, 2)}\n`, "utf8").toString("base64"),
      branch: config.branch
    };
    if (current.sha) body.sha = current.sha;
    try {
      await githubRequest(getFileUrl(filePath, config.branch).split("?")[0], {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      return next;
    } catch (error) {
      if (!error.conflict) throw error;
      lastConflict = error;
    }
  }
  throw lastConflict || new Error("Could not save GitHub JSON file after repeated concurrent updates.");
}
