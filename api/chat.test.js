import test from "node:test";
import assert from "node:assert/strict";
import handler from "./chat.js";

test("chat messages persist using the EXAMDESK GitHub storage configuration", async () => {
  const previousEnvironment = {
    token: process.env.EXAMDESK_GITHUB_TOKEN,
    owner: process.env.EXAMDESK_GITHUB_OWNER,
    repo: process.env.EXAMDESK_GITHUB_REPO,
    branch: process.env.EXAMDESK_GITHUB_BRANCH,
    legacyToken: process.env.drilldeck_GITHUB_TOKEN,
    legacyOwner: process.env.drilldeck_GITHUB_OWNER,
    legacyRepo: process.env.drilldeck_GITHUB_REPO,
    legacyBranch: process.env.drilldeck_GITHUB_BRANCH
  };
  const originalFetch = globalThis.fetch;
  let storedContent = null;
  let writeRequest = null;

  Object.assign(process.env, {
    EXAMDESK_GITHUB_TOKEN: "test-token",
    EXAMDESK_GITHUB_OWNER: "test-owner",
    EXAMDESK_GITHUB_REPO: "test-storage",
    EXAMDESK_GITHUB_BRANCH: "test-branch"
  });
  delete process.env.drilldeck_GITHUB_TOKEN;
  delete process.env.drilldeck_GITHUB_OWNER;
  delete process.env.drilldeck_GITHUB_REPO;
  delete process.env.drilldeck_GITHUB_BRANCH;

  globalThis.fetch = async (url, options) => {
    if (options.method === "PUT") {
      writeRequest = { url: String(url), options };
      storedContent = JSON.parse(Buffer.from(JSON.parse(options.body).content, "base64").toString("utf8"));
      return { ok: true, status: 201, json: async () => ({ sha: "test-sha" }) };
    }
    if (String(url).endsWith("/repos/test-owner/test-storage")) {
      return { ok: true, status: 200, json: async () => ({}) };
    }
    if (String(url).endsWith("/branches/test-branch")) {
      return { ok: true, status: 200, json: async () => ({}) };
    }
    if (!storedContent) return { ok: false, status: 404 };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        content: Buffer.from(JSON.stringify(storedContent)).toString("base64"),
        encoding: "base64",
        sha: "test-sha"
      })
    };
  };

  try {
    const postResponse = await callHandler({
      method: "POST",
      headers: { origin: "https://drilldeck.example", host: "drilldeck.example" },
      body: { name: "Guest tester", message: "Hello from shared chat" }
    });

    assert.equal(postResponse.statusCode, 201);
    assert.equal(storedContent.messages[0].message, "Hello from shared chat");
    assert.equal(writeRequest.url, "https://api.github.com/repos/test-owner/test-storage/contents/chat-messages.json");
    assert.equal(writeRequest.options.headers.Authorization, "Bearer test-token");
    assert.equal(JSON.parse(writeRequest.options.body).branch, "test-branch");

    const getResponse = await callHandler({ method: "GET", headers: {} });
    assert.equal(getResponse.statusCode, 200);
    assert.equal(JSON.parse(getResponse.body).messages[0].name, "Guest tester");
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment("EXAMDESK_GITHUB_TOKEN", previousEnvironment.token);
    restoreEnvironment("EXAMDESK_GITHUB_OWNER", previousEnvironment.owner);
    restoreEnvironment("EXAMDESK_GITHUB_REPO", previousEnvironment.repo);
    restoreEnvironment("EXAMDESK_GITHUB_BRANCH", previousEnvironment.branch);
    restoreEnvironment("drilldeck_GITHUB_TOKEN", previousEnvironment.legacyToken);
    restoreEnvironment("drilldeck_GITHUB_OWNER", previousEnvironment.legacyOwner);
    restoreEnvironment("drilldeck_GITHUB_REPO", previousEnvironment.legacyRepo);
    restoreEnvironment("drilldeck_GITHUB_BRANCH", previousEnvironment.legacyBranch);
  }
});

async function callHandler(request) {
  const response = {
    statusCode: 0,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = body; }
  };
  await handler(request, response);
  return response;
}

function restoreEnvironment(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
