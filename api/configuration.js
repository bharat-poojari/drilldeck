import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { validateTestConfiguration, validateTestConfigurationInput } from "../lib/server/test-configuration.js";
import { handleApiError, HttpError, readJsonBody, requireSameOrigin, sendJson } from "../lib/server/http.js";

const DATA_ROOT = resolve(process.cwd(), "data");

async function readQuestionBankConfiguration(input) {
  const manifest = JSON.parse(await readFile(resolve(DATA_ROOT, "datasets.json"), "utf8"));
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
