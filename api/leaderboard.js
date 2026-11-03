import { createHash, timingSafeEqual } from "node:crypto";
import { readJsonFile, updateJsonFile } from "../lib/server/github-json.js";
import { handleApiError, HttpError, readJsonBody, requireSameOrigin, sendJson } from "../lib/server/http.js";

const SCORES_FILE = "accounts.json";
const EMPTY_SCORES = { scores: [] };
const MAX_SCORES = 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hashOwnerKey(ownerKey) {
  return createHash("sha256").update(ownerKey).digest("hex");
}

function validateDisplayName(value, required = false) {
  const name = typeof value === "string" ? value.trim() : "";
  if ((required && !name) || name.length > 60 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new HttpError(400, "Leaderboard name must be between 1 and 60 characters.");
  }
  return name;
}

function validateScore(input) {
  if (input.publishConsent !== true) {
    throw new HttpError(403, "Explicit consent is required to publish a score.");
  }
  const id = typeof input.id === "string" ? input.id : "";
  const scoreValue = Number(input.score);
  const maximum = Number(input.maximum);
  const percentageValue = Number(input.scorePercentage);
  if (!Number.isFinite(scoreValue) || !Number.isInteger(maximum) || maximum < 1 || maximum > 1000 ||
      scoreValue < -0.25 * maximum || scoreValue > maximum ||
      !Number.isFinite(percentageValue) || percentageValue < -25 || percentageValue > 100 ||
      Math.abs(percentageValue - scoreValue / maximum * 100) > 0.1) {
    throw new HttpError(400, "The submitted score is invalid.");
  }
  if (!["General Knowledge", "General Kannada, English & Computer Knowledge"].includes(input.paper)) {
    throw new HttpError(400, "Choose a valid exam paper.");
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new HttpError(400, "The score submission ID is invalid.");
  }
  if (!Array.isArray(input.subjects) || input.subjects.length < 1 || input.subjects.length > 3 ||
      input.subjects.some(subject => typeof subject !== "string" || !subject.trim() || subject.length > 80 || /[\u0000-\u001f\u007f]/.test(subject))) {
    throw new HttpError(400, "The selected subject list is invalid.");
  }
  return {
    id,
    score: Math.round(scoreValue * 100) / 100,
    maximum,
    scorePercentage: Math.round(percentageValue * 100) / 100,
    paper: input.paper,
    subjects: [...new Set(input.subjects)],
    name: validateDisplayName(input.name)
  };
}

function getScoreId(input) {
  if (typeof input.id !== "string" || !UUID_PATTERN.test(input.id)) {
    throw new HttpError(400, "The score submission ID is invalid.");
  }
  return input.id;
}

function canManageScore(score, ownerKey) {
  if (score.accountId || typeof score.ownerKeyHash !== "string" || !ownerKey) return false;
  const expected = Buffer.from(score.ownerKeyHash, "hex");
  const actual = Buffer.from(hashOwnerKey(ownerKey), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function sortScores(scores) {
  return scores.sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt) ||
    right.scorePercentage - left.scorePercentage ||
    right.score - left.score
  );
}

function publicScore(score, rank) {
  return {
    rank,
    id: score.id,
    name: score.name,
    score: score.score,
    maximum: score.maximum,
    scorePercentage: score.scorePercentage,
    paper: score.paper,
    subjects: score.subjects,
    createdAt: score.createdAt
  };
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const { data } = await readJsonFile(SCORES_FILE, EMPTY_SCORES);
      if (!data || !Array.isArray(data.scores)) throw new Error("GitHub leaderboard storage must contain a scores array.");
      const scores = sortScores(data.scores).slice(0, 100).map((score, index) => publicScore(score, index + 1));
      return sendJson(res, 200, { scores });
    }

    if (!["POST", "PATCH", "DELETE"].includes(req.method)) {
      res.setHeader("Allow", "GET, POST, PATCH, DELETE");
      throw new HttpError(405, "Method not allowed.");
    }
    requireSameOrigin(req);
    const body = readJsonBody(req);

    if (req.method === "PATCH" || req.method === "DELETE") {
      const id = getScoreId(body);
      const ownerKey = typeof body.ownerKey === "string" && UUID_PATTERN.test(body.ownerKey)
        ? body.ownerKey
        : null;
      const name = req.method === "PATCH" ? validateDisplayName(body.name, true) : null;
      let updatedScore = null;
      await updateJsonFile(SCORES_FILE, EMPTY_SCORES, data => {
        if (!data || !Array.isArray(data.scores)) {
          throw new Error("GitHub leaderboard storage must contain a scores array.");
        }
        const index = data.scores.findIndex(item => item.id === id);
        if (index < 0 || !canManageScore(data.scores[index], ownerKey)) {
          throw new HttpError(404, "This public score could not be found for this browser.");
        }
        if (req.method === "DELETE") {
          data.scores.splice(index, 1);
          return data;
        }
        data.scores[index].name = name;
        updatedScore = data.scores[index];
        return data;
      });
      return sendJson(res, 200, req.method === "DELETE"
        ? { removed: true }
        : { score: publicScore(updatedScore) });
    }

    const values = validateScore(body);
    const ownerKey = typeof body.ownerKey === "string" && UUID_PATTERN.test(body.ownerKey)
      ? body.ownerKey
      : null;
    if (!ownerKey) {
      throw new HttpError(400, "A valid browser key is required to manage this public score.");
    }

    const score = {
      id: values.id,
      name: values.name || "Guest",
      score: values.score,
      maximum: values.maximum,
      scorePercentage: values.scorePercentage,
      paper: values.paper,
      subjects: values.subjects,
      createdAt: new Date().toISOString(),
      ownerKeyHash:hashOwnerKey(ownerKey)
    };
    let savedScore = score;
    await updateJsonFile(SCORES_FILE, EMPTY_SCORES, data => {
      if (!data || !Array.isArray(data.scores)) {
        throw new Error("GitHub leaderboard storage must contain a scores array.");
      }
      const existing = data.scores.find(item => item.id === score.id);
      if (existing) {
        if (!canManageScore(existing, ownerKey)) {
          throw new HttpError(409, "This score submission was already used.");
        }
        savedScore = existing;
        return data;
      }
      data.scores.push(score);
      data.scores = sortScores(data.scores).slice(0, MAX_SCORES);
      return data;
    });

    sendJson(res, 201, { score: publicScore(savedScore) });
  } catch (error) {
    handleApiError(res, error);
  }
}
