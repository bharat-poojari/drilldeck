import test from "node:test";
import assert from "node:assert/strict";
import { createQuestionId, filterQuestions, selectRandomQuestions, shuffleAnswerOptions, validateDataset } from "./questions.js";
import { calculateResults } from "./scoring.js";

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
    correctAnswer: "A",
    topic: "Sample topic",
    explanation: "Option A is correct.",
    source: "Sample reference"
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
    {
      questions: [makeQuestion("Q178"), makeQuestion("Q178")],
      duplicateIds: ["Q178"],
      duplicateQuestions: [{ firstId: "Q178", duplicateId: "Q178", question: "sample question?" }],
      invalidQuestions: []
    }
  );
});

test("repeated prompts are normalized and reported without dropping either question", () => {
  const first = makeQuestion("Q001");
  const second = { ...makeQuestion("Q002"), question: "  SAMPLE   QUESTION? " };
  const result = validateDataset({ questions: [first, second] }, dataset);

  assert.equal(result.questions.length, 2);
  assert.deepEqual(result.duplicateQuestions, [
    { firstId: "Q001", duplicateId: "Q002", question: "sample question?" }
  ]);
});

test("question numbering gaps are valid", () => {
  const secondQuestion = { ...makeQuestion("Q025"), question: "Another sample question?" };
  assert.deepEqual(
    validateDataset({ questions: [makeQuestion("Q023"), secondQuestion] }, dataset),
    { questions: [makeQuestion("Q023"), secondQuestion], duplicateIds: [], duplicateQuestions: [], invalidQuestions: [] }
  );
});

test("missing and unusable IDs remain validation errors", () => {
  const result = validateDataset({ questions: [makeQuestion("  ")] }, dataset);
  assert.equal(result.questions.length, 0);
  assert.equal(result.invalidQuestions.length, 1);
  assert.match(result.invalidQuestions[0].errors.join(" "), /must have a non-empty string or number ID/);
});

test("explanation, source and topic or chapter are required", () => {
  const question = makeQuestion("Q028");
  delete question.explanation;
  delete question.source;
  delete question.topic;
  const result = validateDataset({ questions: [question] }, dataset);

  assert.equal(result.questions.length, 0);
  assert.match(result.invalidQuestions[0].errors.join(" "), /missing explanation/);
  assert.match(result.invalidQuestions[0].errors.join(" "), /missing source/);
  assert.match(result.invalidQuestions[0].errors.join(" "), /must have a topic or chapter/);
});

test("incomplete options and invalid answer references are rejected", () => {
  const question = makeQuestion("Q029");
  question.options.D = " ";
  question.correctAnswer = "E";
  const result = validateDataset({ questions: [question] }, dataset);

  assert.equal(result.questions.length, 0);
  assert.match(result.invalidQuestions[0].errors.join(" "), /four non-empty A–D options/);
  assert.match(result.invalidQuestions[0].errors.join(" "), /invalid correctAnswer/);
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

test("shuffled answer options remap the correct answer without mutating the question bank", () => {
  const original = makeQuestion("Q026");
  const shuffled = shuffleAnswerOptions(original, () => 0);

  assert.deepEqual(shuffled.options, { A: "Two", B: "Three", C: "Four", D: "One" });
  assert.equal(shuffled.correctAnswer, "D");
  assert.equal(original.correctAnswer, "A");
  assert.deepEqual(original.options, { A: "One", B: "Two", C: "Three", D: "Four" });
});

test("scoring recognizes the remapped correct option", () => {
  const question = shuffleAnswerOptions(makeQuestion("Q027"), () => 0);
  const result = calculateResults([question], [{ selected: question.correctAnswer }], 60, 30);

  assert.equal(result.correct, 1);
  assert.equal(result.wrong, 0);
  assert.equal(result.score, 1);
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

test("question filters enforce the selected difficulty", () => {
  const questions = ["Easy", "Medium", "Hard"].map((difficulty, index) => ({
    id:`Q00${index + 1}`,
    paper:"general-knowledge",
    subject:"Current Affairs",
    datasetId:dataset.id,
    topic:"Government",
    difficulty
  }));
  const filtered = filterQuestions(questions, {
    paper:"general-knowledge",
    categories:["Current Affairs"],
    datasets:[dataset.id],
    topics:["Government"],
    difficulty:"Hard"
  });
  assert.deepEqual(filtered.map(question => question.difficulty), ["Hard"]);
});
