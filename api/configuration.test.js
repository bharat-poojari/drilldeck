import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import handler from "./configuration.js";

test("configuration endpoint validates a real dataset before exam creation", async () => {
  const manifest = JSON.parse(await readFile(resolve("data", "datasets.json"), "utf8"));
  const datasetId = manifest.datasets.find(id => id.startsWith("General_Knowledge/"));
  assert.ok(datasetId, "a General Knowledge dataset should be indexed");
  const dataset = JSON.parse(await readFile(resolve("data", datasetId), "utf8"));
  const question = dataset.questions.find(item =>
    item && item.id !== undefined && item.difficulty && item.question && item.correctAnswer &&
    item.options && ["A", "B", "C", "D"].every(key => item.options[key])
  );
  assert.ok(question, "the dataset should contain a usable question");

  const configuration = {
    paper:"general-knowledge",
    categories:[humanize(datasetId.split("/")[1])],
    datasets:[datasetId],
    topics:[question.topic || question.chapter || humanize(datasetId.split("/").pop().replace(/\.json$/i, ""))],
    topicsByDataset:{
      [datasetId]:[question.topic || question.chapter || humanize(datasetId.split("/").pop().replace(/\.json$/i, ""))]
    },
    difficulty:"Mixed",
    questionCount:1,
    durationMinutes:30,
    markingScheme:{ correct:1, incorrect:-0.25, unanswered:0 }
  };
  const response = await callHandler({
    method:"POST",
    headers:{ origin:"https://drilldeck.example", host:"drilldeck.example" },
    body:configuration
  });
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.configuration.availableQuestions >= 1, true);
  assert.equal(body.configuration.maximumScore, configuration.questionCount);

  const invalid = await callHandler({
    method:"POST",
    headers:{ origin:"https://drilldeck.example", host:"drilldeck.example" },
    body:{ ...configuration, questionCount:1000 }
  });
  assert.equal(invalid.statusCode, 400);
});

function humanize(value) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b[a-z]/g, character => character.toUpperCase())
    .replace(/\s*\(/g, " (");
}

async function callHandler(request) {
  const response = {
    statusCode:0,
    headers:{},
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = body; }
  };
  await handler(request, response);
  return response;
}
