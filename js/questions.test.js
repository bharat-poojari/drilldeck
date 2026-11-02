import test from "node:test";
import assert from "node:assert/strict";
import { createQuestionId, filterQuestions, selectRandomQuestions, validateDataset } from "./questions.js";

const dataset = {
  id: "General_Knowledge/Current_Affairs/Current_Economy.json",
  path: "General_Knowledge/Current_Affairs/Current_Economy.json",
  subject: "Current Affairs",
  title: "Current Economy"
};

function makeQuestion(id) {
  return {
    id,
    difficulty: "Easy",
    question: "Sample question?",
    options: { A: "One", B: "Two", C: "Three", D: "Four" },
    correctAnswer: "A"
  };
}

test("question IDs are namespaced by dataset and subject", () => {
  const otherDataset = {
    ...dataset,
    id: "General_Knowledge/Current_Affairs/Current_Environment.json",
    subject: "Current Affairs"
  };
  assert.notEqual(
    createQuestionId(dataset, "Q001"),
    createQuestionId(otherDataset, "Q001")
  );
  assert.notEqual(
    createQuestionId(dataset, "Q001"),
    createQuestionId({ ...dataset, subject: "General Knowledge" }, "Q001")
  );
});

test("reused IDs within a dataset receive distinct stable identities", () => {
  const first = createQuestionId(dataset, "Q178", 1);
  const second = createQuestionId(dataset, "Q178", 2);
  assert.notEqual(first, second);
  assert.equal(first, createQuestionId(dataset, "Q178", 1));
});

test("duplicate source IDs are reported without rejecting a dataset", () => {
  assert.deepEqual(
    validateDataset({ questions: [makeQuestion("Q178"), makeQuestion("Q178")] }, dataset),
    { questions: [makeQuestion("Q178"), makeQuestion("Q178")], duplicateIds: ["Q178"], invalidQuestions: [] }
  );
});

test("question numbering gaps are valid", () => {
  assert.deepEqual(
    validateDataset({ questions: [makeQuestion("Q023"), makeQuestion("Q025")] }, dataset),
    { questions: [makeQuestion("Q023"), makeQuestion("Q025")], duplicateIds: [], invalidQuestions: [] }
  );
});

test("missing and unusable IDs remain validation errors", () => {
  const result = validateDataset({ questions: [makeQuestion("  ")] }, dataset);
  assert.equal(result.questions.length, 0);
  assert.equal(result.invalidQuestions.length, 1);
  assert.match(result.invalidQuestions[0].errors.join(" "), /must have a non-empty string or number ID/);
});

test("invalid records are isolated so valid questions remain available", () => {
  const result = validateDataset({
    questions: [makeQuestion("Q023"), { ...makeQuestion("Q024"), correctAnswer: undefined }, makeQuestion("Q025")]
  }, dataset);
  assert.deepEqual(result.questions.map(question => question.id), ["Q023", "Q025"]);
  assert.equal(result.invalidQuestions.length, 1);
  assert.equal(result.invalidQuestions[0].index, 1);
});

test("selection fills from valid questions after malformed records are skipped", () => {
  const result = validateDataset({
    questions: [makeQuestion("Q023"), { ...makeQuestion("Q024"), correctAnswer: undefined }, makeQuestion("Q025")]
  }, dataset);
  const available = result.questions.map(question => ({ ...question, datasetId: dataset.id }));
  const selected = selectRandomQuestions(available, 2, () => 0);
  assert.equal(selected.length, 2);
  assert.deepEqual(new Set(selected.map(question => question.id)), new Set(["Q023", "Q025"]));
});

test("question filters accept multiple subcategories and preserve the all-subcategories option", () => {
  const questions = ["Government", "Economy", "History"].map((topic, index) => ({
    id: `Q00${index + 1}`,
    paper: "general-knowledge",
    subject: "Current Affairs",
    datasetId: dataset.id,
    topic,
    difficulty: "Easy"
  }));
  const baseFilters = {
    paper: "general-knowledge",
    categories: ["Current Affairs"],
    datasets: [dataset.id],
    difficulty: "Mixed"
  };
  assert.deepEqual(
    filterQuestions(questions, { ...baseFilters, topics: ["Government", "Economy"] }).map(question => question.topic),
    ["Government", "Economy"]
  );
  assert.equal(filterQuestions(questions, { ...baseFilters, topics: ["all"] }).length, 3);
});
