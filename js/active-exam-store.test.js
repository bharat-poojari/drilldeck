import test from "node:test";
import assert from "node:assert/strict";
import { createActiveExamStore } from "./active-exam-store.js";

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem:key => values.has(key) ? values.get(key) : null,
    setItem:(key, value) => values.set(key, value),
    removeItem:key => values.delete(key)
  };
}

function makeSnapshot() {
  return {
    version:1,
    testId:"test-1",
    returnView:"setup",
    startedAt:Date.now() - 15000,
    durationSeconds:600,
    currentIndex:0,
    questions:[{
      id:"question-1",
      question:"Sample question?",
      correctAnswer:"A",
      options:{ A:"One", B:"Two", C:"Three", D:"Four" },
      subject:"General Knowledge"
    }],
    answers:[{ selected:"B", visited:true, review:false }],
    context:{
      paper:"General Knowledge",
      paperId:"general-knowledge",
      subjects:["General Knowledge"],
      categories:["History"],
      datasets:["history.json"],
      topics:["Ancient"],
      difficulty:"Mixed"
    }
  };
}

test("active exam snapshots persist and can be cleared", () => {
  const store = createActiveExamStore(createMemoryStorage());
  const snapshot = makeSnapshot();
  store.save(snapshot);
  assert.deepEqual(store.load(), snapshot);
  store.clear();
  assert.equal(store.load(), null);
});

test("invalid active exam snapshots are rejected", () => {
  const storage = createMemoryStorage();
  const store = createActiveExamStore(storage);
  assert.throws(() => store.save({ ...makeSnapshot(), currentIndex:1 }), /unsupported format/);
  storage.setItem("drilldeck.active-exam.v1", JSON.stringify({ version:1 }));
  assert.throws(() => store.load(), /could not be loaded/);
});

test("storage errors are surfaced to the caller", () => {
  const store = createActiveExamStore({
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("quota exceeded"); },
    removeItem() { throw new Error("blocked"); }
  });
  assert.throws(() => store.load(), /could not be read: blocked/);
  assert.throws(() => store.save(makeSnapshot()), /could not be autosaved: quota exceeded/);
  assert.throws(() => store.clear(), /could not be cleared: blocked/);
});
