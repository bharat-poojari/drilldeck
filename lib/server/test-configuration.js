import { HttpError } from "./http.js";

const PAPERS = new Set(["general-knowledge", "combined"]);
const DIFFICULTIES = new Set(["Easy", "Medium", "Hard", "Mixed"]);
const MARKING_SCHEME = { correct:1, incorrect:-0.25, unanswered:0 };
const MAX_LIST_ITEMS = 2000;
const COMBINED_SUBJECTS = new Map([
  ["kannada", "Kannada"],
  ["generalkannada", "Kannada"],
  ["english", "English"],
  ["generalenglish", "English"],
  ["computer", "Computer"],
  ["computerknowledge", "Computer"]
]);

function isStringList(value, { min = 1, max = MAX_LIST_ITEMS } = {}) {
  return Array.isArray(value) && value.length >= min && value.length <= max &&
    value.every(item => typeof item === "string" && item.trim() && item.length <= 200);
}

function humanize(value) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b[a-z]/g, character => character.toUpperCase())
    .replace(/\s*\(/g, " (");
}

function getDatasetInfo(id) {
  const parts = id.split("/");
  const root = parts[0].toLowerCase().replace(/[_\s-]+/g, "");
  const generalKnowledge = root === "generalknowledge";
  const combinedRoot = root === "generalkannadaenglishcomputerknowledge";
  const precompiledPaper = root === "precompiledpaper";
  if ((!generalKnowledge && !combinedRoot && !precompiledPaper &&
       !["kannada", "english", "computer"].includes(root)) ||
      parts.length < 2 || !id.toLowerCase().endsWith(".json") || parts.some(part => !part || part === "." || part === "..")) {
    throw new HttpError(400, "A selected subcategory is invalid.");
  }
  const category = generalKnowledge || combinedRoot
    ? parts[1]
    : precompiledPaper
      ? "Pre-compiled Paper"
      : parts[0];
  const normalizedCategory = category.toLowerCase().replace(/[_\s-]+/g, "");
  return {
    paper:generalKnowledge ? "general-knowledge" : "combined",
    subject:generalKnowledge
      ? humanize(category)
      : precompiledPaper
        ? "Pre-compiled Paper"
        : (COMBINED_SUBJECTS.get(normalizedCategory) || humanize(category))
  };
}

function getDatasetTitle(id) {
  const filename = id.split("/").pop().replace(/\.json$/i, "");
  return humanize(filename);
}

function isUsableQuestion(question) {
  return question && typeof question === "object" &&
    ["id", "difficulty", "question", "correctAnswer"].every(key =>
      question[key] !== undefined && question[key] !== null && question[key] !== ""
    ) &&
    question.options && ["A", "B", "C", "D"].every(key =>
      typeof question.options[key] === "string" && question.options[key].trim()
    ) &&
    (!question.difficulty || ["Easy", "Medium", "Hard"].includes(question.difficulty)) &&
    ["A", "B", "C", "D"].includes(question.correctAnswer);
}

export function validateTestConfigurationInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new HttpError(400, "Test configuration must be an object.");
  }
  if (!PAPERS.has(input.paper)) throw new HttpError(400, "Choose a valid exam paper.");
  if (!isStringList(input.categories) || !isStringList(input.datasets) ||
      !isStringList(input.topics) || !input.topicsByDataset ||
      typeof input.topicsByDataset !== "object" || Array.isArray(input.topicsByDataset)) {
    throw new HttpError(400, "Select at least one category, subcategory, and topic.");
  }
  if (new Set(input.datasets).size !== input.datasets.length ||
      new Set(input.categories).size !== input.categories.length ||
      new Set(input.topics).size !== input.topics.length) {
    throw new HttpError(400, "Remove duplicate categories, datasets, or topics.");
  }
  if (!DIFFICULTIES.has(input.difficulty)) {
    throw new HttpError(400, "Choose a valid difficulty.");
  }
  if (!Number.isInteger(input.questionCount) || input.questionCount < 1 || input.questionCount > 1000) {
    throw new HttpError(400, "Question count must be between 1 and 1,000.");
  }
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 1 || input.durationMinutes > 600) {
    throw new HttpError(400, "Duration must be between 1 and 600 minutes.");
  }
  if (!input.markingScheme || input.markingScheme.correct !== MARKING_SCHEME.correct ||
      input.markingScheme.incorrect !== MARKING_SCHEME.incorrect ||
      input.markingScheme.unanswered !== MARKING_SCHEME.unanswered) {
    throw new HttpError(400, "The marking scheme is invalid.");
  }
  return input;
}

export function validateTestConfiguration(input, manifest, datasetFiles) {
  validateTestConfigurationInput(input);
  if (!manifest || !Array.isArray(manifest.datasets) || !datasetFiles ||
      typeof datasetFiles !== "object" || Array.isArray(datasetFiles)) {
    throw new Error("The server question bank is unavailable or invalid.");
  }
  if (input.datasets.some(id => !manifest.datasets.includes(id) || !Object.hasOwn(datasetFiles, id))) {
    throw new HttpError(400, "A selected subcategory is not available.");
  }

  const selectedDatasetInfo = input.datasets.map(getDatasetInfo);
  if (selectedDatasetInfo.some(dataset => dataset.paper !== input.paper)) {
    throw new HttpError(400, "Selected subcategories do not belong to the chosen paper.");
  }
  if (selectedDatasetInfo.some(dataset => !input.categories.includes(dataset.subject))) {
    throw new HttpError(400, "A selected category does not match the chosen datasets.");
  }

  const allTopics = new Set();
  const configuredTopics = new Set();
  if (Object.keys(input.topicsByDataset).some(id => !input.datasets.includes(id))) {
    throw new HttpError(400, "Topic selections must match the selected subcategories.");
  }
  input.datasets.forEach(id => {
    const topics = input.topicsByDataset[id];
    if (!isStringList(topics, { max:2000 })) {
      throw new HttpError(400, "Select at least one topic in every selected subcategory.");
    }
    topics.forEach(topic => configuredTopics.add(topic));
  });
  if (configuredTopics.size !== input.topics.length ||
      input.topics.some(topic => !configuredTopics.has(topic))) {
    throw new HttpError(400, "The selected topics do not match the selected subcategories.");
  }
  const matchingQuestions = [];
  input.datasets.forEach((id, index) => {
    const data = datasetFiles[id];
    if (!data || !Array.isArray(data.questions)) {
      throw new Error(`Question subcategory "${id}" is invalid.`);
    }
    const { subject } = selectedDatasetInfo[index];
    const title = getDatasetTitle(id);
    data.questions.filter(isUsableQuestion).forEach(question => {
      const topic = question.topic || question.chapter || title;
      allTopics.add(topic);
      if (input.categories.includes(subject) && input.topicsByDataset[id].includes(topic) &&
          (input.difficulty === "Mixed" || question.difficulty === input.difficulty)) {
        matchingQuestions.push(question);
      }
    });
  });
  if (input.topics.some(topic => !allTopics.has(topic))) {
    throw new HttpError(400, "A selected topic is not available in the chosen datasets.");
  }
  if (matchingQuestions.length < input.questionCount) {
    throw new HttpError(400, `Only ${matchingQuestions.length} questions match this configuration.`);
  }
  return {
    paper:input.paper,
    categories:input.categories,
    datasets:input.datasets,
    topics:input.topics,
    difficulty:input.difficulty,
    questionCount:input.questionCount,
    durationMinutes:input.durationMinutes,
    markingScheme:MARKING_SCHEME,
    availableQuestions:matchingQuestions.length,
    maximumScore:input.questionCount
  };
}
