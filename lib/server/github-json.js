const API_ROOT = "https://api.github.com";
const MAX_WRITE_ATTEMPTS = 4;

function getConfiguration() {
  const { EXAMDESK_GITHUB_TOKEN, EXAMDESK_GITHUB_OWNER, EXAMDESK_GITHUB_REPO, EXAMDESK_GITHUB_BRANCH } = process.env;
  if (!EXAMDESK_GITHUB_TOKEN || !EXAMDESK_GITHUB_OWNER || !EXAMDESK_GITHUB_REPO) {
    throw new Error("Missing required GitHub storage configuration.");
  }
  return {
    token: EXAMDESK_GITHUB_TOKEN,
    owner: EXAMDESK_GITHUB_OWNER,
    repo: EXAMDESK_GITHUB_REPO,
    branch: EXAMDESK_GITHUB_BRANCH || "main"
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

export async function readJsonFile(filePath, fallback) {
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
  const config = getConfiguration();
  let lastConflict;
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const current = await readJsonFile(filePath, fallback);
    const next = await mutate(structuredClone(current.data));
    const body = {
      message: `Update ExamDesk ${filePath}`,
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
