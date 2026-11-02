const STORAGE_KEY = "drilldeck.local-data.v1";
const FORMAT = "drilldeck-local-data";
const VERSION = 1;

const isFiniteNumber = value => typeof value === "number" && Number.isFinite(value);
const isStringArray = value => Array.isArray(value) && value.every(item => typeof item === "string");
const isBreakdown = value => Array.isArray(value) && value.every(item =>
  item && typeof item.name === "string" &&
  ["total", "correct", "wrong", "unanswered"].every(key => isFiniteNumber(item[key]))
);
const isLeaderboardState = value => value && typeof value === "object" && !Array.isArray(value) &&
  typeof value.consented === "boolean" &&
  typeof value.published === "boolean" &&
  typeof value.name === "string";

function isResultRecord(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return false;
  const numericFields = [
    "total", "correct", "wrong", "unanswered", "attempted", "negativeMarks", "score",
    "maximum", "scorePercentage", "accuracy", "attemptRate", "correctPercentage",
    "wrongPercentage", "durationSeconds", "elapsedSeconds", "remainingSeconds", "averageSeconds"
  ];
  return typeof result.id === "string" && result.id.length > 0 &&
    typeof result.testId === "string" && result.testId.length > 0 &&
    typeof result.submittedAt === "string" && Number.isFinite(Date.parse(result.submittedAt)) &&
    (result.userId === null || typeof result.userId === "string") &&
    (result.guestId === null || typeof result.guestId === "string") &&
    typeof result.paperId === "string" &&
    typeof result.paper === "string" &&
    typeof result.examName === "string" &&
    isStringArray(result.selectedCategories) &&
    isStringArray(result.selectedDatasets) &&
    isStringArray(result.selectedTopics) &&
    typeof result.difficulty === "string" &&
    isFiniteNumber(result.totalQuestions) && result.totalQuestions > 0 && result.totalQuestions <= 1000 &&
    isFiniteNumber(result.correctAnswers) && isFiniteNumber(result.incorrectAnswers) &&
    isFiniteNumber(result.unansweredQuestions) && isFiniteNumber(result.totalScore) &&
    isFiniteNumber(result.accuracyPercentage) && isFiniteNumber(result.timeTakenSeconds) &&
    Array.isArray(result.questions) && result.questions.length === result.totalQuestions &&
    result.questions.every(question => question && typeof question === "object" &&
      typeof question.question === "string" &&
      ["A", "B", "C", "D"].includes(question.correctAnswer) &&
      question.options && ["A", "B", "C", "D"].every(key => typeof question.options[key] === "string")) &&
    Array.isArray(result.answers) && result.answers.length === result.totalQuestions &&
    result.answers.every(answer => answer && (answer.selected === null ||
      ["A", "B", "C", "D"].includes(answer.selected))) &&
    result.metrics && typeof result.metrics === "object" &&
    numericFields.every(key => isFiniteNumber(result.metrics[key])) &&
    typeof result.metrics.autoSubmitted === "boolean" &&
    (result.leaderboard === undefined || isLeaderboardState(result.leaderboard)) &&
    isBreakdown(result.metrics.subjects) && isBreakdown(result.metrics.topics);
}

function validateData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      data.version !== VERSION ||
      (data.guestId !== null && typeof data.guestId !== "string") ||
      !Array.isArray(data.results) ||
      !data.results.every(isResultRecord)) {
    throw new Error("The saved local data is invalid or uses an unsupported format.");
  }
  return { version: VERSION, guestId: data.guestId, results: data.results };
}

export function createResultsStore(storage) {
  function read() {
    let raw;
    try {
      raw = storage.getItem(STORAGE_KEY);
    } catch (error) {
      throw new Error(`Local results could not be read: ${error.message}`);
    }
    if (raw === null) return { version: VERSION, guestId: null, results: [] };
    try {
      return validateData(JSON.parse(raw));
    } catch (error) {
      throw new Error(`Local results could not be loaded: ${error.message}`);
    }
  }

  function write(data) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(validateData(data)));
    } catch (error) {
      throw new Error(`Local results could not be saved: ${error.message}`);
    }
  }

  return {
    getData: read,
    ensureGuestId() {
      const data = read();
      if (data.guestId) return data.guestId;
      const guestId = globalThis.crypto?.randomUUID
        ? globalThis.crypto.randomUUID()
        : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, character => {
          const value = Math.floor(Math.random() * 16);
          return (character === "x" ? value : (value & 3) | 8).toString(16);
        });
      data.guestId = guestId;
      write(data);
      return guestId;
    },
    saveResult(result) {
      if (!isResultRecord(result)) throw new Error("The submitted result is incomplete and could not be saved.");
      const data = read();
      if (data.results.some(item => item.id === result.id)) return data;
      data.results.unshift(result);
      write(data);
      return data;
    },
    updateLeaderboard(id, leaderboard) {
      if (!isLeaderboardState(leaderboard)) throw new Error("The leaderboard status is invalid.");
      const data = read();
      const result = data.results.find(item => item.id === id);
      if (!result) throw new Error("The saved result could not be found.");
      result.leaderboard = leaderboard;
      write(data);
      return result;
    },
    exportData() {
      return JSON.stringify({ format: FORMAT, ...read() }, null, 2);
    },
    importData(json) {
      let imported;
      try {
        imported = JSON.parse(json);
      } catch {
        throw new Error("The selected file is not valid JSON.");
      }
      if (!imported || imported.format !== FORMAT) {
        throw new Error("This file is not a DrillDeck local-data backup.");
      }
      const restored = validateData(imported);
      const data = read();
      const knownIds = new Set(data.results.map(item => item.id));
      data.results = [...data.results, ...restored.results.filter(item => {
        if (knownIds.has(item.id)) return false;
        knownIds.add(item.id);
        return true;
      })];
      if (!data.guestId) data.guestId = restored.guestId;
      write(data);
      return data;
    }
  };
}

export { isResultRecord };
