import test from "node:test";
import assert from "node:assert/strict";
import { renderResults } from "./results.js";
import { analyzePerformance } from "./performance-insights.js";

function createDocument() {
  const nodes = new Map();
  return {
    getElementById(id) {
      if (!nodes.has(id)) {
        const classes = new Set();
        nodes.set(id, {
          textContent:"",
          innerHTML:"",
          style:{ setProperty() {} },
          classList:{
            toggle(name, enabled) {
              if (enabled) classes.add(name);
              else classes.delete(name);
            },
            contains(name) {
              return classes.has(name);
            }
          },
          querySelectorAll() {
            return [];
          },
          onclick:null
        });
      }
      return nodes.get(id);
    }
  };
}

function renderTestResults(onPracticeIncorrect) {
  const questions = [
    { question:"First?", correctAnswer:"A", options:{ A:"One", B:"Two", C:"Three", D:"Four" } },
    { question:"Second?", correctAnswer:"B", options:{ A:"One", B:"Two", C:"Three", D:"Four" } }
  ];
  const metrics = {
    score:0, maximum:2, scorePercentage:0, accuracy:0, correct:0, wrong:1,
    unanswered:1, negativeMarks:0, attempted:1, attemptRate:50, durationSeconds:0,
    elapsedSeconds:30, averageSeconds:30, remainingSeconds:0, autoSubmitted:false,
    subjects:[], topics:[]
  };
  renderResults({
    questions,
    answers:[{ selected:"B", review:false }, { selected:null, review:true }],
    metrics,
    examName:"Practice",
    submittedAt:new Date("2026-11-04T00:00:00Z"),
    onNewTest() {},
    onPracticeIncorrect,
    mode:"practice"
  });
  return { questions, revisionButton:document.getElementById("wrong-revision-button") };
}

test("results expose revision practice with incorrect and review-marked questions", () => {
  const previousDocument = globalThis.document;
  const mockDocument = createDocument();
  globalThis.document = mockDocument;
  try {
    let revisionQuestions;
    const { questions, revisionButton } = renderTestResults(found => {
      revisionQuestions = found;
    });

    assert.equal(revisionButton.classList.contains("hidden"), false);
    revisionButton.onclick();
    assert.deepEqual(revisionQuestions, questions);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test("results hide revision practice when no revision handler is available", () => {
  const previousDocument = globalThis.document;
  const mockDocument = createDocument();
  globalThis.document = mockDocument;
  try {
    const { revisionButton } = renderTestResults();
    assert.equal(revisionButton.classList.contains("hidden"), true);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

function makeAttempt({ id, submittedAt, answers, subject = "Geography", topics = ["Landforms"] }) {
  const questions = answers.map((_, index) => ({
    id:id === undefined ? undefined : `Q${index}`,
    question:`Question ${index}`,
    subject,
    topic:topics[index] || topics[0],
    correctAnswer:"A"
  }));
  const correct = answers.filter(answer => answer.selected === "A").length;
  const wrong = answers.filter(answer => answer.selected && answer.selected !== "A").length;
  return {
    id,
    submittedAt,
    paper:"General Knowledge",
    questions,
    answers,
    metrics:{ elapsedSeconds:answers.length * 20 },
    correct,
    wrong
  };
}

test("performance labels require three attempted answers", () => {
  const twoAttempts = makeAttempt({
    answers:[{ selected:"B" }, { selected:"B" }]
  });
  const weakAttempts = makeAttempt({
    answers:[{ selected:"B" }, { selected:"B" }, { selected:"A" }]
  });

  assert.equal(analyzePerformance([twoAttempts]).subjects[0].status, "insufficient");
  assert.equal(analyzePerformance([twoAttempts]).topics[0].status, "insufficient");
  assert.equal(analyzePerformance([weakAttempts]).subjects[0].status, "weak");
});

test("performance tracks improvement, average time, and repeated incorrect questions", () => {
  const previous = makeAttempt({
    id:"first",
    submittedAt:"2026-11-01T10:00:00.000Z",
    answers:[{ selected:"B" }, { selected:"B" }, { selected:"B" }, { selected:"A" }]
  });
  const latest = makeAttempt({
    id:"second",
    submittedAt:"2026-11-02T10:00:00.000Z",
    answers:[{ selected:"A" }, { selected:"A" }, { selected:"A" }, { selected:"B" }]
  });
  latest.questions[3].id = previous.questions[0].id;
  latest.questions[3].question = previous.questions[0].question;

  const insights = analyzePerformance([latest, previous]);

  assert.equal(insights.subjects[0].status, "improving");
  assert.equal(insights.subjects[0].trend, 50);
  assert.equal(insights.tests[0].change, 50);
  assert.equal(insights.averageSeconds, 20);
  assert.equal(insights.repeatedIncorrectTopics[0].wrong, 4);
  assert.equal(insights.repeatedIncorrect[0].count, 2);
});

test("high accuracy is strong and unanswered questions do not satisfy the sample threshold", () => {
  const attempt = makeAttempt({
    answers:[{ selected:"A" }, { selected:"A" }, { selected:"A" }, { selected:null }]
  });

  const insights = analyzePerformance([attempt]);

  assert.equal(insights.subjects[0].status, "strong");
  assert.equal(insights.subjects[0].attempted, 3);
  assert.equal(insights.subjects[0].total, 4);
});
