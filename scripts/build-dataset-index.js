import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

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

const manifestPath = join(dataRoot, "datasets.json");
await writeFile(manifestPath, `${JSON.stringify({ datasets }, null, 2)}\n`, "utf8");

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await Promise.all([
  "index.html",
  "css",
  "js",
  "data",
  "exams",
  "mock-tests",
  "subjects",
  "assets",
  "browserconfig.xml",
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
console.log(`Indexed ${datasets.length} question dataset(s) and assembled ${relative(projectRoot, outputRoot)}.`);
