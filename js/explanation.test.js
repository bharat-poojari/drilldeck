import test from "node:test";
import assert from "node:assert/strict";
import { renderQuestionExplanation } from "./explanation.js";

test("question explanations include supplied distractor notes, facts, and safe sources", () => {
  const html = renderQuestionExplanation({
    correctAnswer:"A",
    explanation:"<script>not markup</script>",
    optionExplanations:{ A:"Correct", B:"A distractor", D:"Another distractor", E:"Ignore this" },
    importantFacts:["Remember this"],
    source:"https://example.com/reference"
  });

  assert.match(html, /&lt;script&gt;not markup&lt;\/script&gt;/);
  assert.match(html, /Why the other options are incorrect/);
  assert.match(html, /A distractor/);
  assert.doesNotMatch(html, />Correct<\/li>/);
  assert.doesNotMatch(html, /Ignore this/);
  assert.match(html, /Important facts to remember/);
  assert.match(html, /href="https:\/\/example\.com\/reference"/);
});

test("question explanations accept one important fact and show a useful fallback", () => {
  assert.match(renderQuestionExplanation({ importantFact:"Extra fact" }), /Extra fact/);
  assert.match(renderQuestionExplanation({}), /No explanation is available/);
});
