import { getAccount, getSessionAccountId } from "../lib/server/accounts.js";
import { readJsonFile, updateJsonFile } from "../lib/server/github-json.js";
import { handleApiError, HttpError, readJsonBody, requireSameOrigin, sendJson } from "../lib/server/http.js";

const SCORES_FILE = "accounts.json";
const EMPTY_SCORES = { users: [], scores: [] };
const MAX_SCORES = 1000;

function validateScore(input) {
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
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length > 60 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new HttpError(400, "Leaderboard name must be 60 characters or fewer.");
  }
  return {
    id,
    score: Math.round(scoreValue * 100) / 100,
    maximum,
    scorePercentage: Math.round(percentageValue * 100) / 100,
    paper: input.paper,
    subjects: [...new Set(input.subjects)],
    guestName: name || "Guest"
  };
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

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      throw new HttpError(405, "Method not allowed.");
    }
    requireSameOrigin(req);
    const body = readJsonBody(req);
    const values = validateScore(body);
    const accountId = getSessionAccountId(req);
    const account = accountId ? await getAccount(accountId) : null;
    if (accountId && !account) throw new HttpError(401, "Sign in again before publishing this score.");

    const score = {
      id: values.id,
      name: account ? account.name : values.guestName,
      score: values.score,
      maximum: values.maximum,
      scorePercentage: values.scorePercentage,
      paper: values.paper,
      subjects: values.subjects,
      createdAt: new Date().toISOString(),
      accountId
    };
    let savedScore = score;

    await updateJsonFile(SCORES_FILE, EMPTY_SCORES, data => {
      if (!data || !Array.isArray(data.scores) || !Array.isArray(data.users)) {
        throw new Error("GitHub account storage must contain users and scores arrays.");
      }
      const existing = data.scores.find(item => item.id === score.id);
      if (existing) {
        if ((existing.accountId || null) !== accountId) {
          throw new HttpError(409, "This score submission was already used.");
        }
        savedScore = existing;
        return data;
      }
      data.scores.push(score);
      data.scores = sortScores(data.scores).slice(0, MAX_SCORES);
      if (accountId) {
        const owner = data.users.find(user => user.id === accountId);
        if (!owner) throw new HttpError(401, "Sign in again before saving this score to your account.");
        if (!Array.isArray(owner.history)) owner.history = [];
        if (!owner.history.some(item => item.id === score.id)) {
          const { id, name, ...historyEntry } = score;
          owner.history.unshift({ id, ...historyEntry });
          owner.history = owner.history.slice(0, 100);
        }
      }
      return data;
    });

    sendJson(res, 201, { score: publicScore(savedScore) });
  } catch (error) {
    handleApiError(res, error);
  }
}
