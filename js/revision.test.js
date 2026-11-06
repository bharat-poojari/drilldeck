import test from "node:test";
import assert from "node:assert/strict";
import {
  createRevisionSetStore,
  filterRevisionItems,
  getRevisionItems,
  getRevisionReviewInterval
} from "./revision.js";

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem:key => values.has(key) ? values.get(key) : null,
    setItem:(key, value) => values.set(key, value)
  };
}

function makeResult({ date, answers }) {
  const questions = answers.map((_, index) => ({
    id:`Q${index + 1}`,
    question:`Question ${index + 1}?`,
    correctAnswer:"A",
    subject:index === 0 ? "Geography" : "History",
    topic:index === 0 ? "Rivers" : "Ancient History",
    options:{ A:"Right", B:"Wrong", C:"Other", D:"Another" },
    explanation:"Because it is correct."
  }));
  return {
    submittedAt:date,
    questions,
    answers
  };
}

test("revision questions track bookmarks, incorrect, unanswered, and difficult categories", () => {
  const result = makeResult({
    date:"2026-11-04T10:00:00.000Z",
    answers:[
      { selected:"B", review:true },
      { selected:null, review:false }
    ]
  });
  const items = getRevisionItems([result], {
    bookmarkedIds:["Q1"],
    now:new Date("2026-11-04T12:00:00.000Z")
  });

  assert.equal(filterRevisionItems(items, { category:"bookmarked" }).length, 1);
  assert.equal(filterRevisionItems(items, { category:"incorrect" }).length, 1);
  assert.equal(filterRevisionItems(items, { category:"unattempted" }).length, 1);
  assert.equal(filterRevisionItems(items, { category:"difficult" }).length, 1);
  assert.equal(items[0].due, false);
  assert.equal(items[0].nextReviewAt, "2026-11-05T10:00:00.000Z");
});

test("spaced repetition shortens incorrect intervals and lengthens repeated correct intervals", () => {
  const results = [
    { submittedAt:"2026-11-01T10:00:00.000Z", questions:[{ id:"Q1", question:"Question?", correctAnswer:"A" }], answers:[{ selected:"B" }] },
    { submittedAt:"2026-11-02T10:00:00.000Z", questions:[{ id:"Q1", question:"Question?", correctAnswer:"A" }], answers:[{ selected:"A" }] },
    { submittedAt:"2026-11-03T10:00:00.000Z", questions:[{ id:"Q1", question:"Question?", correctAnswer:"A" }], answers:[{ selected:"A" }] }
  ];

  const [item] = getRevisionItems(results, { now:new Date("2026-11-04T10:00:00.000Z") });

  assert.equal(item.incorrectCount, 1);
  assert.equal(item.correctStreak, 2);
  assert.equal(item.nextReviewAt, "2026-11-06T10:00:00.000Z");
  assert.equal(item.due, false);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(getRevisionReviewInterval), [1, 3, 7, 14, 30, 30]);
});

test("revision filtering supports subject, topic, search, collection, and sort order", () => {
  const results = [
    makeResult({
      date:"2026-11-01T10:00:00.000Z",
      answers:[{ selected:"B" }, { selected:"A" }]
    }),
    makeResult({
      date:"2026-11-03T10:00:00.000Z",
      answers:[{ selected:"B" }, { selected:"B" }]
    }),
    {
      submittedAt:"2026-11-04T10:00:00.000Z",
      questions:[{
        id:"Q2",
        question:"Question 2?",
        correctAnswer:"A",
        subject:"History",
        topic:"Ancient History",
        options:{ A:"Right", B:"Wrong", C:"Other", D:"Another" }
      }],
      answers:[{ selected:"A" }]
    }
  ];
  const items = getRevisionItems(results, { bookmarkedIds:["Q2"], now:new Date("2026-11-04T10:00:00.000Z") });

  assert.equal(filterRevisionItems(items, { subject:"Geography", topic:"Rivers", search:"question 1" }).length, 1);
  assert.equal(filterRevisionItems(items, { category:"incorrect", sort:"incorrect" })[0].id, "Q1");
  assert.equal(filterRevisionItems(items, { category:"bookmarked" })[0].id, "Q2");
  assert.equal(filterRevisionItems(items, { sort:"recent" })[0].id, "Q2");
});

test("revision sets persist, validate names, and support mastering questions", () => {
  const storage = createMemoryStorage();
  const store = createRevisionSetStore(storage);
  const set = store.createSet("Geography review", ["Q1", "Q2", "Q1"]);

  assert.deepEqual(set.questionIds, ["Q1", "Q2"]);
  store.markMastered(["Q1", "Q2"]);
  assert.deepEqual(createRevisionSetStore(storage).getData().masteredIds, ["Q1", "Q2"]);
  store.markMastered("Q1", false);
  store.deleteSet(set.id);
  assert.deepEqual(store.getData().masteredIds, ["Q2"]);
  assert.throws(() => store.createSet("   ", ["Q1"]), /set name/);
  assert.throws(() => store.createSet("Empty set", []), /at least one question/);
});

test("bookmarked questions are listed even when they have no saved test attempt", () => {
  const question = {
    id:"Q1",
    question:"Fresh question?",
    correctAnswer:"A",
    subject:"Science",
    topic:"Biology"
  };
  const [item] = getRevisionItems([], {
    bookmarkedIds:["Q1"],
    questionBank:[question]
  });

  assert.equal(item.bookmarked, true);
  assert.equal(item.lastOutcome, "unattempted");
  assert.equal(filterRevisionItems([item], { category:"bookmarked" }).length, 1);
});
