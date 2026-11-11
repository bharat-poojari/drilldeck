import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configureLocalJsonStorage, readJsonFile, updateJsonFile } from "./github-json.js";

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
