const STORAGE_KEY = "drilldeck.active-exam.v1";
const VERSION = 1;
const ANSWER_KEYS = ["A", "B", "C", "D"];

function isStringArray(value) {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

function isQuestion(question) {
  return question && typeof question === "object" && !Array.isArray(question) &&
    typeof question.question === "string" && question.question.length > 0 &&
    ANSWER_KEYS.includes(question.correctAnswer) &&
    question.options && typeof question.options === "object" &&
    ANSWER_KEYS.every(key => typeof question.options[key] === "string") &&
    typeof question.subject === "string";
}

function isChallenge(challenge) {
  return challenge === null || (challenge && typeof challenge === "object" &&
    ["daily-drill", "question-of-day", "karnataka", "current-affairs"].includes(challenge.type) &&
    typeof challenge.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(challenge.date));
}

function isSnapshot(snapshot) {
  return snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) &&
    snapshot.version === VERSION &&
    typeof snapshot.testId === "string" && snapshot.testId.length > 0 &&
    (snapshot.returnView === "setup" || snapshot.returnView === "quick-test") &&
    Number.isFinite(snapshot.startedAt) &&
    Number.isInteger(snapshot.durationSeconds) && snapshot.durationSeconds >= 60 &&
    snapshot.durationSeconds <= 36000 &&
    Number.isInteger(snapshot.currentIndex) &&
    Array.isArray(snapshot.questions) && snapshot.questions.length > 0 &&
    snapshot.questions.length <= 1000 && snapshot.questions.every(isQuestion) &&
    Array.isArray(snapshot.answers) && snapshot.answers.length === snapshot.questions.length &&
    snapshot.answers.every(answer => answer && typeof answer === "object" &&
      (answer.selected === null || ANSWER_KEYS.includes(answer.selected)) &&
      typeof answer.visited === "boolean" && typeof answer.review === "boolean") &&
    snapshot.currentIndex >= 0 && snapshot.currentIndex < snapshot.questions.length &&
    snapshot.context && typeof snapshot.context === "object" &&
    typeof snapshot.context.paper === "string" &&
    typeof snapshot.context.paperId === "string" &&
    isStringArray(snapshot.context.subjects) &&
    isStringArray(snapshot.context.categories) &&
    isStringArray(snapshot.context.datasets) &&
    isStringArray(snapshot.context.topics) &&
    typeof snapshot.context.difficulty === "string" &&
    (snapshot.challenge === undefined || isChallenge(snapshot.challenge));
}

function validateSnapshot(snapshot) {
  if (!isSnapshot(snapshot)) {
    throw new Error("The saved test is invalid or uses an unsupported format.");
  }
  return snapshot;
}

export function createActiveExamStore(storage) {
  return {
    load() {
      let raw;
      try {
        raw = storage.getItem(STORAGE_KEY);
      } catch (error) {
        throw new Error(`The saved test could not be read: ${error.message}`);
      }
      if (raw === null) return null;
      try {
        return validateSnapshot(JSON.parse(raw));
      } catch (error) {
        throw new Error(`The saved test could not be loaded: ${error.message}`);
      }
    },
    save(snapshot) {
      const validated = validateSnapshot(snapshot);
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(validated));
      } catch (error) {
        throw new Error(`The test could not be autosaved: ${error.message}`);
      }
    },
    clear() {
      try {
        storage.removeItem(STORAGE_KEY);
      } catch (error) {
        throw new Error(`The saved test could not be cleared: ${error.message}`);
      }
    }
  };
}
