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

function validateDataset(data, dataset) {
  if (!data || !Array.isArray(data.questions)) {
    throw new Error(`${dataset.path} must contain a questions array.`);
  }
  const seen = new Set();
  const errors = [];
  data.questions.forEach((question, index) => {
    const label = `${dataset.title}, question ${index + 1}`;
    if (!question || typeof question !== "object") {
      errors.push(`${label} is not an object.`);
      return;
    }
    for (const field of REQUIRED_FIELDS) {
      if (question[field] === undefined || question[field] === null || question[field] === "") {
        errors.push(`${label} is missing ${field}.`);
      }
    }
    if (question.id) {
      if (seen.has(question.id)) errors.push(`${dataset.title} has duplicate question ID ${question.id}.`);
      seen.add(question.id);
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
  });
  if (errors.length) {
    throw new Error(`Dataset validation failed:\n${errors.slice(0,8).join("\n")}${errors.length > 8 ? `\n…and ${errors.length - 8} more issue(s).` : ""}`);
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

  const datasets = await Promise.all(index.datasets.map(async relativePath => {
    const dataset = getDatasetLocation(relativePath);
    const fileUrl = new URL(relativePath.split("/").map(encodeURIComponent).join("/"), rootUrl);
    const response = await fetch(fileUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load ${dataset.path} (${response.status}).`);
    const data = await response.json();
    validateDataset(data, dataset);
    return {
      ...dataset,
      questions: data.questions.map(question => ({
        ...question,
        id: `${dataset.id}#${question.id}`,
        subject: dataset.subject,
        topic: question.topic || question.chapter || dataset.title,
        paper: dataset.paper,
        datasetId: dataset.id,
        datasetTitle: dataset.title,
        subcategory: dataset.subcategory
      }))
    };
  }));
  return { exam: "Karnataka State-Level", datasets, questions: datasets.flatMap(dataset => dataset.questions) };
}

export function filterQuestions(questions, filters) {
  const selectedCategories = new Set(filters.categories);
  const selectedDatasets = new Set(filters.datasets);
  return questions.filter(question =>
    question.paper === filters.paper &&
    selectedCategories.has(question.subject) &&
    selectedDatasets.has(question.datasetId) &&
    (filters.topic === "all" || question.topic === filters.topic) &&
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
