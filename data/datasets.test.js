import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const dataRoot = new URL("./", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("datasets.json", dataRoot), "utf8"));

test("all indexed datasets are valid JSON question banks", async () => {
  await Promise.all(manifest.datasets.map(async relativePath => {
    const datasetUrl = new URL(relativePath.split("/").map(encodeURIComponent).join("/"), dataRoot);
    let dataset;
    try {
      dataset = JSON.parse(await readFile(datasetUrl, "utf8"));
    } catch (error) {
      throw new Error(`Invalid question dataset "${relativePath}": ${error.message}`, { cause: error });
    }
    assert.ok(
      Array.isArray(dataset?.questions) && dataset.questions.length > 0,
      `Question dataset "${relativePath}" must contain a non-empty questions array.`
    );
  }));
});
