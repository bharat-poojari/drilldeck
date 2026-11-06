import test from "node:test";
import assert from "node:assert/strict";
import {
  challengeMeetsCompletionThreshold,
  getChallengeActivity,
  selectDailyFacts,
  selectDailyDrill,
  selectQuestionOfTheDay,
  selectSpecialChallenge
} from "./daily-challenge.js";

test("the daily question is stable for a local date and advances on the next day", () => {
  const questions = [{ id:"one" }, { id:"two" }, { id:"three" }];
  const firstDay = new Date(2026, 10, 4, 0, 0);
  const firstQuestion = selectQuestionOfTheDay(questions, firstDay);
  assert.equal(firstQuestion, selectQuestionOfTheDay(questions, new Date(2026, 10, 4, 22, 0)));
  const firstIndex = questions.indexOf(firstQuestion);
  assert.equal(
    selectQuestionOfTheDay(questions, new Date(2026, 10, 5, 0, 0)),
    questions[(firstIndex + 1) % questions.length]
  );
});

test("daily question selection rejects an empty question bank", () => {
  assert.throws(() => selectQuestionOfTheDay([]), /No questions are available/);
});

test("daily facts select stable questions for each available learning category", () => {
  const questions = [
    { id:"karnataka", datasetId:"General_Knowledge/Karnataka_History.json", question:"Karnataka fact?" },
    { id:"constitution", datasetId:"General_Knowledge/Indian_Polity.json", topic:"Constitution", question:"A constitutional fact?" },
    { id:"geography", datasetId:"General_Knowledge/GEOGRAPHY/Earth.json", question:"A geography fact?" },
    { id:"science", datasetId:"General_Knowledge/GENERAL_SCIENCE/Biology.json", question:"A science fact?" },
    { id:"current", datasetId:"General_Knowledge/CURRENT AFFAIRS/National_Current_Affairs.json", question:"A current fact?" }
  ];

  const date = new Date(2026, 10, 4);
  const facts = selectDailyFacts(questions, date);
  assert.deepEqual(facts.map(fact => fact.category), [
    "Karnataka", "Constitution", "Geography", "Science", "Current Affairs"
  ]);
  assert.deepEqual(facts.map(fact => fact.question?.id), [
    "karnataka", "constitution", "geography", "science", "current"
  ]);
  assert.equal(new Set(facts.map(fact => fact.question?.id)).size, 5);
  assert.deepEqual(selectDailyFacts(questions, date), facts);
  assert.equal(selectDailyFacts([], date).every(fact => fact.question === null), true);
});

function makeQuestions(type, count) {
  const datasetId = {
    generalKnowledge:"General_Knowledge/HISTORY/Ancient.json",
    karnataka:"General_Knowledge/GEOGRAPHY/Karnataka_Geography.json",
    science:"General_Knowledge/GENERAL_SCIENCE/Biology.json",
    currentAffairs:"General_Knowledge/CURRENT AFFAIRS/National_Current_Affairs.json"
  }[type];
  return Array.from({ length:count }, (_, index) => ({
    id:`${type}-${index}`,
    paper:"general-knowledge",
    subject:"General Knowledge",
    datasetId,
    topic:`${type} topic`,
    correctAnswer:"A"
  }));
}

test("daily drill deterministically selects the requested subject mix", () => {
  const questions = [
    ...makeQuestions("generalKnowledge", 20),
    ...makeQuestions("karnataka", 10),
    ...makeQuestions("science", 10),
    ...makeQuestions("currentAffairs", 10)
  ];
  const date = new Date(2026, 10, 4);
  const drill = selectDailyDrill(questions, date);
  const secondSelection = selectDailyDrill(questions, date);

  assert.equal(drill.length, 25);
  assert.deepEqual(drill.map(question => question.id), secondSelection.map(question => question.id));
  assert.equal(new Set(drill.map(question => question.id)).size, 25);
  assert.equal(drill.filter(question => /HISTORY/.test(question.datasetId)).length, 10);
  assert.equal(drill.filter(question => /Karnataka/.test(question.datasetId)).length, 5);
  assert.equal(drill.filter(question => /GENERAL_SCIENCE/.test(question.datasetId)).length, 5);
  assert.equal(drill.filter(question => /CURRENT AFFAIRS/.test(question.datasetId)).length, 5);
});

test("special challenges are selected from their matching question pools", () => {
  const questions = [
    ...makeQuestions("karnataka", 12),
    ...makeQuestions("currentAffairs", 12)
  ];

  assert.equal(selectSpecialChallenge(questions, "karnataka").length, 10);
  assert.equal(selectSpecialChallenge(questions, "current-affairs").length, 10);
  assert.throws(() => selectSpecialChallenge(questions, "unknown"), /not available/);
  assert.throws(() => selectSpecialChallenge(questions.slice(0, 4), "karnataka"), /only 4 matching/);
});

test("weekly activity counts completed challenge days once and keeps learning thresholds", () => {
  const makeResult = (date, attempted, total = 10) => ({
    challengeType:"daily-drill",
    challengeDate:date,
    totalQuestions:total,
    metrics:{ attempted }
  });
  const results = [
    makeResult("2026-11-02", 5),
    makeResult("2026-11-02", 10),
    makeResult("2026-11-03", 5),
    makeResult("2026-11-04", 4)
  ];

  const activity = getChallengeActivity(results, new Date(2026, 10, 4));

  assert.equal(activity.weekCount, 2);
  assert.equal(activity.streak, 2);
  assert.equal(activity.monthDays, 2);
  assert.equal(activity.week[0].completed, true);
  assert.equal(activity.week[2].today, true);
  assert.equal(challengeMeetsCompletionThreshold(makeResult("2026-11-04", 5)), true);
  assert.equal(challengeMeetsCompletionThreshold(makeResult("2026-11-04", 4)), false);
});

test("monthly milestones advance by completed practice days", () => {
  const results = Array.from({ length:10 }, (_, index) => {
    const date = new Date(2026, 10, index + 1);
    return {
      challengeType:"question-of-day",
      challengeDate:`2026-11-${String(index + 1).padStart(2, "0")}`,
      totalQuestions:1,
      metrics:{ attempted:1 }
    };
  });

  const activity = getChallengeActivity(results, new Date(2026, 10, 10));

  assert.equal(activity.monthDays, 10);
  assert.equal(activity.milestoneProgress, 10);
  assert.equal(activity.nextMilestone, 20);
});
