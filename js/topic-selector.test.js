import test from "node:test";
import assert from "node:assert/strict";
import { createTopicSelection } from "./topic-selector.js";

test("search filters the complete topic list without changing selections", () => {
  const topics = createTopicSelection();
  topics.setGroups([
    { parent:"Indian Constitution", topics:["Preamble", "Fundamental Rights", "Fundamental Duties"] },
    { parent:"Indian History", topics:["Ancient Indian History", "Modern Indian History"] }
  ]);
  topics.setSelected("Fundamental Rights", false, "Indian Constitution");

  assert.deepEqual(topics.getGroups("Ancient Indian"), [
    { parent:"Indian History", topics:["Ancient Indian History"] }
  ]);
  assert.deepEqual(topics.getGroups("no matching topic"), []);
  assert.deepEqual(topics.getGroups("Constitution"), [
    { parent:"Indian Constitution", topics:["Fundamental Duties", "Fundamental Rights", "Preamble"] }
  ]);
  topics.setSelected("Fundamental Rights", false, "Indian Constitution");
  assert.deepEqual([...topics.getSelectedTopics()].sort(), [
    "Preamble", "Fundamental Duties", "Ancient Indian History", "Modern Indian History"
  ].sort());
});

test("group and global selection controls include topics hidden by search", () => {
  const topics = createTopicSelection();
  topics.setGroups([
    { parent:"Indian Constitution", topics:["Preamble", "Fundamental Rights"] },
    { parent:"Indian History", topics:["Ancient Indian History"] }
  ]);
  topics.clear();
  topics.setGroupSelected("Indian Constitution", true);
  assert.deepEqual([...topics.getSelectedTopics()].sort(), ["Preamble", "Fundamental Rights"].sort());

  topics.setGroups([
    { parent:"Indian Constitution", topics:["Preamble", "Fundamental Rights", "Fundamental Duties"] },
    { parent:"Indian History", topics:["Ancient Indian History"] }
  ]);
  assert.deepEqual([...topics.getSelectedTopics()].sort(), [
    "Preamble", "Fundamental Rights", "Fundamental Duties"
  ].sort());
  topics.selectAll();
  assert.equal(topics.selectedCount(), 4);
  topics.clear();
  assert.deepEqual(topics.getSelectedTopics(), []);
});

test("topics with the same label remain scoped to their subcategory", () => {
  const topics = createTopicSelection();
  topics.setGroups([
    { parent:"history.json", topics:["Foundations"] },
    { parent:"civics.json", topics:["Foundations"] }
  ]);
  topics.clear();
  topics.setSelected("Foundations", true, "history.json");
  assert.deepEqual(topics.getSelectedTopicsByGroup(), {
    "history.json":["Foundations"]
  });
  assert.equal(topics.selectedCount(), 1);
});
