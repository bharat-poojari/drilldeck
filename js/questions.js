const REQUIRED_FIELDS = ["id","difficulty","question","options","correctAnswer"];
const SECOND_PAPER_SUBJECTS = new Map([
  ["kannada", "Kannada"],
  ["english", "English"],
  ["computer", "Computer"]
]);

function humanize(value) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b[a-z]/g, character => character.toUpperCase())
    .replace(/\s*\(/g, " (");
}

function getDatasetLocation(relativePath) {
  const parts = relativePath.split("/").filter(Boolean);
  const normalize = value => value.toLowerCase().replace(/[_\s-]+/g, "");
  const first = normalize(parts[0] || "");
  const isGeneralKnowledge = first === "generalknowledge";
  const isCombinedPaper = first === "generalkannadaenglishcomputerknowledge";
  let paper;
  let category;
  let contentStart;

  if (isGeneralKnowledge) {
    paper = "general-knowledge";
    category = parts[1];
    contentStart = 2;
  } else if (isCombinedPaper) {
    paper = "combined";
    category = parts[1];
    contentStart = 2;
  } else if (SECOND_PAPER_SUBJECTS.has(first)) {
    paper = "combined";
    category = parts[0];
    contentStart = 1;
  } else {
    throw new Error(`Unsupported dataset path "${relativePath}". Place files under General_Knowledge/<category>/ or Kannada, English, or Computer folders.`);
  }

  if (!category || !relativePath.toLowerCase().endsWith(".json")) {
    throw new Error(`Dataset "${relativePath}" must be a JSON file inside a subject folder.`);
  }

  const subject = isGeneralKnowledge ? humanize(category) : SECOND_PAPER_SUBJECTS.get(normalize(category));
  if (!subject) throw new Error(`Unsupported subject folder "${category}" in "${relativePath}".`);
  const folders = parts.slice(contentStart, -1);
  const filename = parts[parts.length - 1].replace(/\.json$/i, "");
  return {
    id: relativePath,
    path: relativePath,
    paper,
    subject,
    subcategory: folders.map(humanize).join(" / "),
    title: humanize(filename)
  };
}

export function createQuestionId(dataset, sourceId, occurrence = 1) {
  return [dataset.id, dataset.subject, String(sourceId).trim(), String(occurrence)]
    .map(value => encodeURIComponent(value))
    .join("#");
}

export function validateDataset(data, dataset) {
  if (!data || !Array.isArray(data.questions)) {
    throw new Error(`${dataset.path} must contain a questions array.`);
  }
  const seen = new Map();
  const duplicateIds = new Set();
  const invalidQuestions = [];
  const validQuestions = [];
  data.questions.forEach((question, index) => {
    const label = `${dataset.title}, question ${index + 1}`;
    const errors = [];
    if (!question || typeof question !== "object") {
      invalidQuestions.push({ index, errors: [`${label} is not an object.`] });
      return;
    }
    for (const field of REQUIRED_FIELDS) {
      if (question[field] === undefined || question[field] === null || question[field] === "") {
        errors.push(`${label} is missing ${field}.`);
      }
    }
    if (typeof question.id !== "string" && typeof question.id !== "number") {
      errors.push(`${label} must have a non-empty string or number ID.`);
    } else if (!String(question.id).trim()) {
      errors.push(`${label} must have a non-empty string or number ID.`);
    }
    if (!question.options || typeof question.options !== "object" ||
        !["A","B","C","D"].every(key => typeof question.options[key] === "string" && question.options[key].trim())) {
      errors.push(`${label} must have four non-empty A–D options.`);
    }
    if (question.correctAnswer && !["A","B","C","D"].includes(question.correctAnswer)) {
      errors.push(`${label} has an invalid correctAnswer.`);
    }
    if (question.difficulty && !["Easy","Medium","Hard"].includes(question.difficulty)) {
      errors.push(`${label} has an unsupported difficulty.`);
    }
    if (errors.length) {
      invalidQuestions.push({ index, id: question.id, errors });
      return;
    }

    validQuestions.push(question);
    const sourceId = String(question.id).trim();
    const occurrences = (seen.get(sourceId) || 0) + 1;
    seen.set(sourceId, occurrences);
    if (occurrences > 1) duplicateIds.add(sourceId);
  });
  return { questions: validQuestions, duplicateIds: [...duplicateIds], invalidQuestions };
}

async function loadDataset(relativePath, rootUrl) {
  let dataset;
  try {
    dataset = getDatasetLocation(relativePath);
    const fileUrl = new URL(relativePath.split("/").map(encodeURIComponent).join("/"), rootUrl);
    const response = await fetch(fileUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load ${dataset.path} (${response.status}).`);
    const data = await response.json();
    const validation = validateDataset(data, dataset);
    const warnings = [];
    if (validation.duplicateIds.length) {
      warnings.push(
        `${dataset.path} reuses question ID${validation.duplicateIds.length === 1 ? "" : "s"} ${validation.duplicateIds.join(", ")}. ` +
        "Each occurrence will receive a unique dataset-scoped ID."
      );
    }
    if (validation.invalidQuestions.length) {
      const skipped = validation.invalidQuestions.slice(0, 5).map(({ index, id, errors }) =>
        `question ${index + 1}${id ? ` (ID ${id})` : ""}: ${errors.join(" ")}`
      );
      warnings.push(
        `${dataset.path}: skipped ${validation.invalidQuestions.length} invalid question(s). ` +
        `${skipped.join(" ")}${validation.invalidQuestions.length > skipped.length ? " Further issues omitted." : ""}`
      );
    }
    warnings.forEach(warning => console.warn(warning));
    if (!validation.questions.length) throw new Error("No valid questions were found in this dataset.");

    const idOccurrences = new Map();
    const loadedDataset = {
      ...dataset,
      questions: validation.questions.map(question => {
        const sourceId = String(question.id).trim();
        const occurrence = (idOccurrences.get(sourceId) || 0) + 1;
        idOccurrences.set(sourceId, occurrence);
        return {
          ...question,
          id: createQuestionId(dataset, sourceId, occurrence),
          subject: dataset.subject,
          topic: question.topic || question.chapter || dataset.title,
          paper: dataset.paper,
          datasetId: dataset.id,
          datasetTitle: dataset.title,
          subcategory: dataset.subcategory
        };
      })
    };
    return { dataset: loadedDataset, warnings };
  } catch (error) {
    const warning = `Unable to load ${dataset ? dataset.path : relativePath}: ${error.message}`;
    console.error(warning);
    return { dataset: null, warnings: [warning] };
  }
}

export async function loadQuestionBank() {
  const rootUrl = new URL("../data/", import.meta.url);
  const indexUrl = new URL("datasets.json", rootUrl);
  const indexResponse = await fetch(indexUrl, { cache: "no-store" });
  if (!indexResponse.ok) throw new Error(`Could not load dataset index (${indexResponse.status}): ${indexUrl.pathname}`);
  const index = await indexResponse.json();
  if (!index || !Array.isArray(index.datasets) ||
      index.datasets.some(path => typeof path !== "string" || !path || path.startsWith("/") || path.includes("\\") || path.split("/").includes(".."))) {
    throw new Error("Dataset index must contain a datasets array of safe relative file paths.");
  }
  if (!index.datasets.length) throw new Error("No JSON question datasets were found under the data folder.");

  const results = await Promise.all(index.datasets.map(relativePath => loadDataset(relativePath, rootUrl)));
  const datasets = results.flatMap(result => result.dataset ? [result.dataset] : []);
  if (!datasets.length) throw new Error("No usable question datasets could be loaded. Check the dataset warnings for details.");
  return {
    exam: "Karnataka State-Level",
    datasets,
    questions: datasets.flatMap(dataset => dataset.questions),
    warnings: results.flatMap(result => result.warnings)
  };
}

export function filterQuestions(questions, filters) {
  const selectedCategories = new Set(filters.categories);
  const selectedDatasets = new Set(filters.datasets);
  const selectedTopics = new Set(Array.isArray(filters.topics) ? filters.topics : [filters.topic ?? "all"]);
  return questions.filter(question =>
    question.paper === filters.paper &&
    selectedCategories.has(question.subject) &&
    selectedDatasets.has(question.datasetId) &&
    (selectedTopics.has("all") || selectedTopics.has(question.topic)) &&
    (filters.difficulty === "Mixed" || question.difficulty === filters.difficulty)
  );
}

export function shuffledCopy(items, random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function selectRandomQuestions(questions, count, random = Math.random) {
  if (questions.length < count) {
    throw new Error(`Only ${questions.length} questions match these filters. Choose fewer questions or broaden your selection.`);
  }

  const grouped = new Map();
  questions.forEach(question => {
    if (!grouped.has(question.datasetId)) grouped.set(question.datasetId, []);
    grouped.get(question.datasetId).push(question);
  });
  const sources = shuffledCopy([...grouped.values()], random).map(items => shuffledCopy(items, random));
  const selected = [];

  if (count >= sources.length) {
    for (const source of sources) selected.push(source.pop());
  }
  while (selected.length < count) {
    const available = sources.filter(source => source.length);
    const source = available[Math.floor(random() * available.length)];
    selected.push(source.pop());
  }
  return shuffledCopy(selected, random);
}
