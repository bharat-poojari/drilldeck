import test from "node:test";
import assert from "node:assert/strict";
import { createBookmarkStore, selectRevisionQuestions } from "./practice.js";
import { calculateResults } from "./scoring.js";

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem:key => data.has(key) ? data.get(key) : null,
    setItem:(key, value) => data.set(key, value)
  };
}

test("revision selection includes wrong and marked answers exactly once", () => {
  const questions = [
    { id:"Q1", correctAnswer:"A" },
    { id:"Q2", correctAnswer:"B" },
    { id:"Q3", correctAnswer:"C" },
    { id:"Q4", correctAnswer:"D" }
  ];
  const answers = [
    { selected:"B", review:false },
    { selected:"B", review:true },
    { selected:null, review:true },
    { selected:"D", review:false }
  ];

  assert.deepEqual(selectRevisionQuestions(questions, answers).map(question => question.id), ["Q1", "Q2", "Q3"]);
});

test("question bookmarks persist, toggle, and deduplicate", () => {
  const storage = createMemoryStorage();
  const bookmarks = createBookmarkStore(storage);

  assert.equal(bookmarks.toggle("Q1"), true);
  assert.equal(bookmarks.toggle("Q2"), true);
  assert.equal(bookmarks.toggle("Q1"), false);
  assert.deepEqual(bookmarks.getIds(), ["Q2"]);
  assert.equal(createBookmarkStore(storage).has("Q2"), true);
});

test("practice scoring does not apply the exam penalty", () => {
  const questions = [{
    subject:"Geography",
    topic:"Rivers",
    correctAnswer:"A"
  }, {
    subject:"Geography",
    topic:"Rivers",
    correctAnswer:"B"
  }];
  const answers = [{ selected:"A" }, { selected:"C" }];
  const results = calculateResults(questions, answers, 0, 60, false, { negativeMarking:false });

  assert.equal(results.correct, 1);
  assert.equal(results.wrong, 1);
  assert.equal(results.negativeMarks, 0);
  assert.equal(results.score, 1);
});