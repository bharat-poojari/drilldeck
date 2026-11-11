import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { validateTestConfiguration, validateTestConfigurationInput } from "../lib/server/test-configuration.js";
import { handleApiError, HttpError, readJsonBody, requireSameOrigin, sendJson } from "../lib/server/http.js";

const DATA_ROOT = resolve(process.cwd(), "data");
const PUBLIC_DATA_ROOT = resolve(process.cwd(), "public", "data");

async function readDatasetManifest() {
  for (const dataRoot of [DATA_ROOT, PUBLIC_DATA_ROOT]) {
    try {
      return JSON.parse(await readFile(resolve(dataRoot, "datasets.json"), "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  throw new HttpError(503, "The question bank index is missing. Run npm run build before starting the server.");
}

async function readQuestionBankConfiguration(input) {
  const manifest = await readDatasetManifest();
  const datasetIds = validateTestConfigurationInput(input).datasets;
  const datasetFiles = {};
  for (const id of datasetIds) {
    if (!manifest.datasets.includes(id) || id.includes("\\") || isAbsolute(id)) {
      throw new HttpError(400, "A selected subcategory is not available.");
    }
    const filePath = resolve(DATA_ROOT, id);
    const pathFromRoot = relative(DATA_ROOT, filePath);
    if (!pathFromRoot || pathFromRoot.startsWith(`..${sep}`) || pathFromRoot === "..") {
      throw new HttpError(400, "A selected subcategory is not available.");
    }
    datasetFiles[id] = JSON.parse(await readFile(filePath, "utf8"));
  }
  return validateTestConfiguration(input, manifest, datasetFiles);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      throw new HttpError(405, "Method not allowed.");
    }
    requireSameOrigin(req);
    const configuration = await readQuestionBankConfiguration(readJsonBody(req));
    return sendJson(res, 200, { configuration });
  } catch (error) {
    handleApiError(res, error);
  }
}
