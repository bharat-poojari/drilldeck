import test from "node:test";
import assert from "node:assert/strict";
import { validateTestConfiguration } from "./test-configuration.js";

const firstDataset = "General_Knowledge/HISTORY/Indian_History.json";
const secondDataset = "General_Knowledge/GEOGRAPHY/Indian_Geography.json";
const manifest = { datasets:[firstDataset, secondDataset] };
const datasetFiles = {
  [firstDataset]: {
    questions:[
      makeQuestion("Q001", "Preamble", "Easy"),
      makeQuestion("Q002", "Fundamental Rights", "Hard"),
      makeQuestion("Q003", "Fundamental Duties", "Medium")
    ]
  },
  [secondDataset]: {
    questions:[makeQuestion("Q004", "Physical Geography", "Easy")]
  }
};

function makeQuestion(id, topic, difficulty) {
  return {
    id,
    topic,
    difficulty,
    question:`Question ${id}`,
    correctAnswer:"A",
    options:{ A:"One", B:"Two", C:"Three", D:"Four" }
  };
}

function makeConfiguration(overrides = {}) {
  return {
    paper:"general-knowledge",
    categories:["History"],
    datasets:[firstDataset],
    topics:["Preamble", "Fundamental Rights"],
    topicsByDataset:{ [firstDataset]:["Preamble", "Fundamental Rights"] },
    difficulty:"Mixed",
    questionCount:2,
    durationMinutes:30,
    markingScheme:{ correct:1, incorrect:-0.25, unanswered:0 },
    ...overrides
  };
}

test("validates the final configuration against question-bank data", () => {
  const result = validateTestConfiguration(makeConfiguration({
    categories:["History", "Geography"],
    datasets:[firstDataset, secondDataset],
    topics:["Preamble", "Fundamental Rights", "Physical Geography"],
    topicsByDataset:{
      [firstDataset]:["Preamble", "Fundamental Rights"],
      [secondDataset]:["Physical Geography"]
    }
  }), manifest, datasetFiles);
  assert.equal(result.availableQuestions, 3);
  assert.equal(result.maximumScore, 2);
  assert.equal(result.durationMinutes, 30);
});

test("validates combined datasets stored under descriptive subject folders", () => {
  const datasets = [
    ["General_Kannada_English_Computer_Knowledge/General Kannada/Grammar.json", "Kannada"],
    ["General_Kannada_English_Computer_Knowledge/General English/Articles.json", "English"],
    ["General_Kannada_English_Computer_Knowledge/Computer Knowledge/Hardware.json", "Computer"]
  ];
  const combinedManifest = { datasets:datasets.map(([id]) => id) };
  const combinedFiles = Object.fromEntries(datasets.map(([id], index) => [
    id,
    { questions:[makeQuestion(`Q00${index + 1}`, `Topic ${index + 1}`, "Easy")] }
  ]));
  const result = validateTestConfiguration({
    ...makeConfiguration(),
    paper:"combined",
    categories:datasets.map(([, subject]) => subject),
    datasets:datasets.map(([id]) => id),
    topics:datasets.map((_, index) => `Topic ${index + 1}`),
    topicsByDataset:Object.fromEntries(datasets.map(([id], index) => [id, [`Topic ${index + 1}`]])),
    questionCount:3
  }, combinedManifest, combinedFiles);

  assert.equal(result.availableQuestions, 3);
  assert.deepEqual(result.categories, ["Kannada", "English", "Computer"]);
});

test("validates a complete precompiled Paper-II question set", () => {
  const precompiledId = "Pre-compiled_paper/paper-2_16-nov.json";
  const questions = Array.from({ length:100 }, (_, index) =>
    makeQuestion(`Q${String(index + 1).padStart(3, "0")}`, `Topic ${index + 1}`, "Easy")
  );
  const result = validateTestConfiguration({
    ...makeConfiguration(),
    paper:"combined",
    categories:["Pre-compiled Paper"],
    datasets:[precompiledId],
    topics:questions.map(question => question.topic),
    topicsByDataset:{ [precompiledId]:questions.map(question => question.topic) },
    questionCount:100,
    durationMinutes:120
  }, { datasets:[precompiledId] }, { [precompiledId]:{ questions } });

  assert.equal(result.availableQuestions, 100);
  assert.equal(result.maximumScore, 100);
  assert.equal(result.durationMinutes, 120);
});

test("rejects unavailable topics, insufficient questions, and invalid settings", () => {
  assert.throws(
    () => validateTestConfiguration(makeConfiguration({ topics:["Unknown topic"] }), manifest, datasetFiles),
    /selected topics do not match/
  );
  assert.throws(
    () => validateTestConfiguration(makeConfiguration({ questionCount:4 }), manifest, datasetFiles),
    /Only 2 questions match/
  );
  assert.throws(
    () => validateTestConfiguration(makeConfiguration({
      markingScheme:{ correct:2, incorrect:-0.25, unanswered:0 }
    }), manifest, datasetFiles),
    /marking scheme is invalid/
  );
  assert.throws(
    () => validateTestConfiguration(makeConfiguration({ durationMinutes:0 }), manifest, datasetFiles),
    /Duration must be between/
  );
});
