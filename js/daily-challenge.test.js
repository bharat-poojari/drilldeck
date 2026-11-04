import test from "node:test";
import assert from "node:assert/strict";
import { selectQuestionOfTheDay } from "./daily-challenge.js";

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
