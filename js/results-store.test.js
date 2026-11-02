import test from "node:test";
import assert from "node:assert/strict";
import { createResultsStore } from "./results-store.js";

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem:key => values.has(key) ? values.get(key) : null,
    setItem:(key, value) => values.set(key, value)
  };
}

function makeResult(id) {
  const metrics = {
    total:1, correct:1, wrong:0, unanswered:0, attempted:1, negativeMarks:0,
    score:1, maximum:1, scorePercentage:100, accuracy:100, attemptRate:100,
    correctPercentage:100, wrongPercentage:0, durationSeconds:60, elapsedSeconds:30,
    remainingSeconds:30, averageSeconds:30, autoSubmitted:false,
    subjects:[{ name:"General Knowledge", total:1, correct:1, wrong:0, unanswered:0 }],
    topics:[{ name:"History", total:1, correct:1, wrong:0, unanswered:0 }]
  };
  return {
    id, testId:`test-${id}`, userId:null, guestId:"guest-1", paperId:"general-knowledge",
    paper:"General Knowledge", examName:"General Knowledge Mock Test",
    selectedCategories:["History"], selectedDatasets:["history.json"], selectedTopics:["Ancient"],
    difficulty:"Easy", totalQuestions:1, correctAnswers:1, incorrectAnswers:0,
    unansweredQuestions:0, totalScore:1, accuracyPercentage:100, timeTakenSeconds:30,
    submittedAt:"2026-11-02T09:00:00.000Z", metrics,
    questions:[{
      question:"Sample question?", correctAnswer:"A",
      options:{ A:"One", B:"Two", C:"Three", D:"Four" }
    }],
    answers:[{ selected:"A" }]
  };
}

test("guest identifier and submitted results persist in local storage", () => {
  const store = createResultsStore(createMemoryStorage());
  const guestId = store.ensureGuestId();
  assert.equal(store.ensureGuestId(), guestId);
  store.saveResult(makeResult("result-1"));
  assert.equal(store.getData().guestId, guestId);
  assert.equal(store.getData().results[0].id, "result-1");
});

test("saving the same submission ID does not create duplicate history entries", () => {
  const store = createResultsStore(createMemoryStorage());
  store.saveResult(makeResult("result-1"));
  store.saveResult(makeResult("result-1"));
  assert.equal(store.getData().results.length, 1);
});

test("private results persist without leaderboard consent and publication status can change", () => {
  const store = createResultsStore(createMemoryStorage());
  const result = makeResult("result-private");
  result.leaderboard = { consented:false, published:false, name:"" };
  store.saveResult(result);
  assert.deepEqual(store.getData().results[0].leaderboard, {
    consented:false, published:false, name:""
  });
  store.updateLeaderboard("result-private", {
    consented:true, published:true, name:"Practice student"
  });
  assert.deepEqual(store.getData().results[0].leaderboard, {
    consented:true, published:true, name:"Practice student"
  });
});

test("JSON export and import restore results without replacing local history", () => {
  const source = createResultsStore(createMemoryStorage());
  const sourceGuestId = source.ensureGuestId();
  source.saveResult(makeResult("result-exported"));
  const destination = createResultsStore(createMemoryStorage());
  destination.saveResult(makeResult("result-local"));
  const restored = destination.importData(source.exportData());
  assert.deepEqual(restored.results.map(result => result.id), ["result-local", "result-exported"]);
  assert.equal(restored.guestId, sourceGuestId);
});

test("import rejects malformed backups and result records", () => {
  const store = createResultsStore(createMemoryStorage());
  assert.throws(() => store.importData("{"), /valid JSON/);
  assert.throws(() => store.importData(JSON.stringify({
    format:"drilldeck-local-data", version:1, guestId:null, results:[{ id:"bad" }]
  })), /invalid or uses an unsupported format/);
});
