import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { validateDataset } from "../js/questions.js";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const dataRoot = join(projectRoot, "data");
const outputRoot = join(projectRoot, "public");
const allowedRootFolders = new Set([
  "General_Knowledge",
  "General_Kannada_English_Computer_Knowledge",
  "Kannada",
  "English",
  "Computer"
]);
const optionalEmptyDatasets = new Set([
  "General_Knowledge/CURRENT AFFAIRS/today_current_affair.json",
  "General_Knowledge/CURRENT AFFAIRS/permanent_current_affairs.json"
]);

async function findJsonFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return findJsonFiles(fullPath);
    if (entry.isFile() && /\.json$/i.test(entry.name) && entry.name.toLowerCase() !== "questions.json") {
      return [relative(dataRoot, fullPath).split(sep).join("/")];
    }
    return [];
  }));
  return nested.flat();
}

const rootEntries = await readdir(dataRoot, { withFileTypes: true });
const roots = rootEntries.filter(entry => entry.isDirectory() && allowedRootFolders.has(entry.name));
const datasets = (await Promise.all(roots.map(entry => findJsonFiles(join(dataRoot, entry.name)))))
  .flat()
  .sort((left, right) => left.localeCompare(right));

if (!datasets.length) throw new Error("No JSON question datasets found under supported data folders.");

const includeDataset = await Promise.all(datasets.map(async relativePath => {
  const filePath = join(dataRoot, relativePath);
  let data;
  try {
    const contents = await readFile(filePath, "utf8");
    if (!contents.trim()) {
      console.warn(`Skipping empty question dataset "${relativePath}".`);
      return false;
    }
    data = JSON.parse(contents);
  } catch (error) {
    throw new Error(`Invalid JSON in question dataset "${relativePath}": ${error.message}`, { cause: error });
  }
  if (!data || !Array.isArray(data.questions)) {
    throw new Error(`Question dataset "${relativePath}" must contain a questions array.`);
  }
  if (!data.questions.length && optionalEmptyDatasets.has(relativePath)) return false;
  if (!data.questions.length) {
    throw new Error(`Question dataset "${relativePath}" must contain a non-empty questions array.`);
  }
  const validation = validateDataset(data, { path: relativePath, title: relativePath });
  if (validation.invalidQuestions.length) {
    const issues = validation.invalidQuestions.slice(0, 5)
      .flatMap(question => question.errors)
      .join(" ");
    throw new Error(
      `Question dataset "${relativePath}" has ${validation.invalidQuestions.length} invalid question(s). ${issues}`
    );
  }
  if (validation.duplicateIds.length || validation.duplicateQuestions.length) {
    const samples = validation.duplicateQuestions.slice(0, 3)
      .map(({ firstId, duplicateId }) => `${firstId}/${duplicateId}`)
      .join(", ");
    console.warn(
      `Question dataset "${relativePath}" contains ${validation.duplicateIds.length} duplicate ID(s) ` +
      `and ${validation.duplicateQuestions.length} repeated prompt(s).` +
      (samples ? ` Sample repeated-prompt ID pairs: ${samples}.` : "")
    );
  }
  return true;
}));
const indexedDatasets = datasets.filter((_, index) => includeDataset[index]);

const manifestPath = join(dataRoot, "datasets.json");
await writeFile(manifestPath, `${JSON.stringify({ datasets: indexedDatasets }, null, 2)}\n`, "utf8");

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await Promise.all([
  "index.html",
  "about",
  "css",
  "js",
  "data",
  "exams",
  "mock-tests",
  "subjects",
  "assets",
  "browserconfig.xml",
  "404.html",
  "robots.txt",
  "sitemap.xml",
  "site.webmanifest",
  "favicon.ico",
  "googlef225cee30a4b6859.html"
].map(entry =>
  cp(join(projectRoot, entry), join(outputRoot, entry), {
    recursive: true,
    filter: source =>
      !source.toLowerCase().endsWith(join("data", "questions.json").toLowerCase()) &&
      !source.toLowerCase().endsWith(".test.js")
  })
));
console.log(`Indexed ${indexedDatasets.length} question dataset(s) and assembled ${relative(projectRoot, outputRoot)}.`);
