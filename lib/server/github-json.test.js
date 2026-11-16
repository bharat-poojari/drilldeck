import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configureLocalJsonStorage, readJsonFile, updateJsonFile } from "./github-json.js";

test("GitHub JSON storage rejects an inaccessible repository instead of treating it as empty", async () => {
  const previousEnvironment = {
    token:process.env.EXAMDESK_GITHUB_TOKEN,
    owner:process.env.EXAMDESK_GITHUB_OWNER,
    repo:process.env.EXAMDESK_GITHUB_REPO,
    branch:process.env.EXAMDESK_GITHUB_BRANCH
  };
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, {
    EXAMDESK_GITHUB_TOKEN:"test-token",
    EXAMDESK_GITHUB_OWNER:"test-owner",
    EXAMDESK_GITHUB_REPO:"test-storage",
    EXAMDESK_GITHUB_BRANCH:"test-branch"
  });
  globalThis.fetch = async () => ({ ok:false, status:404 });

  try {
    await assert.rejects(readJsonFile("accounts.json", { scores:[] }), error => {
      assert.equal(error.status, 503);
      assert.match(error.publicMessage, /repository, branch, and token permissions/);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment("EXAMDESK_GITHUB_TOKEN", previousEnvironment.token);
    restoreEnvironment("EXAMDESK_GITHUB_OWNER", previousEnvironment.owner);
    restoreEnvironment("EXAMDESK_GITHUB_REPO", previousEnvironment.repo);
    restoreEnvironment("EXAMDESK_GITHUB_BRANCH", previousEnvironment.branch);
  }
});

test("a missing file in an accessible GitHub repository uses its empty fallback", async () => {
  const previousEnvironment = {
    token:process.env.EXAMDESK_GITHUB_TOKEN,
    owner:process.env.EXAMDESK_GITHUB_OWNER,
    repo:process.env.EXAMDESK_GITHUB_REPO,
    branch:process.env.EXAMDESK_GITHUB_BRANCH
  };
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, {
    EXAMDESK_GITHUB_TOKEN:"test-token",
    EXAMDESK_GITHUB_OWNER:"test-owner",
    EXAMDESK_GITHUB_REPO:"test-storage",
    EXAMDESK_GITHUB_BRANCH:"test-branch"
  });
  globalThis.fetch = async url => {
    if (url.endsWith("/repos/test-owner/test-storage")) {
      return { ok:true, status:200, json:async () => ({}) };
    }
    if (url.endsWith("/branches/test-branch")) {
      return { ok:true, status:200, json:async () => ({}) };
    }
    return { ok:false, status:404 };
  };

  try {
    assert.deepEqual(await readJsonFile("accounts.json", { scores:[] }), {
      data:{ scores:[] },
      sha:null
    });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment("EXAMDESK_GITHUB_TOKEN", previousEnvironment.token);
    restoreEnvironment("EXAMDESK_GITHUB_OWNER", previousEnvironment.owner);
    restoreEnvironment("EXAMDESK_GITHUB_REPO", previousEnvironment.repo);
    restoreEnvironment("EXAMDESK_GITHUB_BRANCH", previousEnvironment.branch);
  }
});

test("local JSON storage creates defaults, persists concurrent updates, and rejects unsafe paths", async () => {
  const storageDirectory = await mkdtemp(join(tmpdir(), "drilldeck-json-storage-"));
  configureLocalJsonStorage(storageDirectory);

  try {
    const fallback = { messages: [] };
    const initial = await readJsonFile("chat-messages.json", fallback);
    assert.deepEqual(initial, { data: { messages: [] }, sha: null });
    initial.data.messages.push({ message: "only changed in memory" });
    assert.deepEqual(await readJsonFile("chat-messages.json", fallback), { data: { messages: [] }, sha: null });

    await Promise.all(Array.from({ length: 25 }, (_, index) =>
      updateJsonFile("nested/scores.json", { scores: [] }, data => {
        data.scores.push(index);
        return data;
      })
    ));
    const saved = await readJsonFile("nested/scores.json", { scores: [] });
    assert.deepEqual(saved.data.scores.sort((left, right) => left - right), Array.from({ length: 25 }, (_, index) => index));
    assert.equal(saved.sha, null);
    assert.equal(JSON.parse(await readFile(join(storageDirectory, "nested", "scores.json"), "utf8")).scores.length, 25);
    await assert.rejects(readJsonFile("../outside.json", {}), /storage path is invalid/);

    await writeFile(join(storageDirectory, "invalid.json"), "{", "utf8");
    await assert.rejects(readJsonFile("invalid.json", {}), /contains invalid JSON/);
  } finally {
    await rm(storageDirectory, { recursive: true, force: true });
  }
});

function restoreEnvironment(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
