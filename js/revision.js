const STORAGE_KEY = "drilldeck.revision-sets.v1";
const FORMAT_VERSION = 1;
const REVIEW_INTERVALS_DAYS = [1, 3, 7, 14, 30];

const questionKey = question => {
  if (typeof question.id === "string" && question.id) return question.id;
  if (typeof question.id === "number") return String(question.id);
  return `text:${String(question.question || "").toLocaleLowerCase().replace(/\s+/g, " ").trim()}`;
};

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateRevisionData(data) {
  if (!isRecord(data) || data.version !== FORMAT_VERSION ||
      !Array.isArray(data.masteredIds) ||
      !data.masteredIds.every(id => typeof id === "string" && id.trim()) ||
      !Array.isArray(data.sets) ||
      !data.sets.every(set => isRecord(set) &&
        typeof set.id === "string" && set.id.trim() &&
        typeof set.name === "string" && set.name.trim() &&
        Array.isArray(set.questionIds) && set.questionIds.length > 0 &&
        set.questionIds.every(id => typeof id === "string" && id.trim()) &&
        typeof set.createdAt === "string" && Number.isFinite(Date.parse(set.createdAt)))) {
    throw new Error("Saved revision sets have an invalid format.");
  }
  return {
    version:FORMAT_VERSION,
    masteredIds:[...new Set(data.masteredIds)],
    sets:data.sets.map(set => ({
      ...set,
      questionIds:[...new Set(set.questionIds)]
    }))
  };
}

export function createRevisionSetStore(storage) {
  function read() {
    let raw;
    try {
      raw = storage.getItem(STORAGE_KEY);
    } catch (error) {
      throw new Error(`Revision sets could not be read: ${error.message}`);
    }
    if (raw === null) return { version:FORMAT_VERSION, masteredIds:[], sets:[] };
    try {
      return validateRevisionData(JSON.parse(raw));
    } catch (error) {
      throw new Error(`Revision sets could not be loaded: ${error.message}`);
    }
  }

  function write(data) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(validateRevisionData(data)));
    } catch (error) {
      throw new Error(`Revision sets could not be saved: ${error.message}`);
    }
  }

  return {
    getData:read,
    markMastered(ids, mastered = true) {
      const questionIds = Array.isArray(ids) ? ids : [ids];
      if (!questionIds.length || !questionIds.every(id => typeof id === "string" && id.trim())) {
        throw new Error("A question ID is required.");
      }
      const data = read();
      const masteredIds = new Set(data.masteredIds);
      for (const id of questionIds) {
        if (mastered) masteredIds.add(id);
        else masteredIds.delete(id);
      }
      data.masteredIds = [...masteredIds];
      write(data);
      return mastered;
    },
    createSet(name, questionIds) {
      const normalizedName = typeof name === "string" ? name.trim() : "";
      if (!normalizedName || normalizedName.length > 60) {
        throw new Error("Enter a revision set name of 1–60 characters.");
      }
      if (!Array.isArray(questionIds)) throw new Error("Select at least one question for this revision set.");
      const ids = [...new Set(questionIds.filter(id => typeof id === "string" && id.trim()))];
      if (!ids.length) throw new Error("Select at least one question for this revision set.");
      const data = read();
      if (data.sets.some(set => set.name.localeCompare(normalizedName, undefined, { sensitivity:"accent" }) === 0)) {
        throw new Error("A revision set with this name already exists.");
      }
      const id = globalThis.crypto?.randomUUID
        ? globalThis.crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      const set = { id, name:normalizedName, questionIds:ids, createdAt:new Date().toISOString() };
      data.sets.push(set);
      write(data);
      return set;
    },
    deleteSet(id) {
      const data = read();
      const next = data.sets.filter(set => set.id !== id);
      if (next.length === data.sets.length) throw new Error("The revision set could not be found.");
      data.sets = next;
      write(data);
    }
  };
}

export function getRevisionItems(results = [], {
  bookmarkedIds = [],
  masteredIds = [],
  questionBank = [],
  now = new Date()
} = {}) {
  const items = new Map();
  const bookmarked = new Set(bookmarkedIds);
  const mastered = new Set(masteredIds);
  const orderedResults = results
    .map((result, index) => ({ result, index }))
    .sort((a, b) => {
      const first = Date.parse(a.result.submittedAt || "");
      const second = Date.parse(b.result.submittedAt || "");
      return (Number.isFinite(first) ? first : 0) - (Number.isFinite(second) ? second : 0) || a.index - b.index;
    });

  for (const { result } of orderedResults) {
    const questions = Array.isArray(result.questions) ? result.questions : [];
    const answers = Array.isArray(result.answers) ? result.answers : [];
    questions.forEach((question, index) => {
      const id = questionKey(question);
      const answer = answers[index];
      if (!answer) return;
      let item = items.get(id);
      if (!item) {
        item = {
          id,
          question,
          bookmarked:bookmarked.has(id),
          mastered:mastered.has(id),
          incorrectCount:0,
          correctStreak:0,
          difficult:false,
          unattempted:false,
          lastOutcome:"unattempted",
          lastAttemptedAt:null,
          nextReviewAt:null
        };
        items.set(id, item);
      }
      item.question = question;
      item.bookmarked = bookmarked.has(id);
      item.lastAttemptedAt = result.submittedAt || item.lastAttemptedAt;
      item.difficult ||= answer.review === true;
      if (!answer.selected) {
        item.lastOutcome = "unattempted";
        item.unattempted = true;
        return;
      }
      item.unattempted = false;
      if (answer.selected === question.correctAnswer) {
        item.lastOutcome = "correct";
        item.correctStreak++;
        const interval = REVIEW_INTERVALS_DAYS[Math.min(item.correctStreak - 1, REVIEW_INTERVALS_DAYS.length - 1)];
        const attemptedAt = Date.parse(result.submittedAt);
        item.nextReviewAt = Number.isFinite(attemptedAt)
          ? new Date(attemptedAt + interval * 86400000).toISOString()
          : null;
      } else {
        item.lastOutcome = "incorrect";
        item.incorrectCount++;
        item.correctStreak = 0;
        const attemptedAt = Date.parse(result.submittedAt);
        item.nextReviewAt = Number.isFinite(attemptedAt)
          ? new Date(attemptedAt + REVIEW_INTERVALS_DAYS[0] * 86400000).toISOString()
          : null;
      }
    });
  }

  for (const question of questionBank) {
    const id = questionKey(question);
    if (!bookmarked.has(id) || items.has(id)) continue;
    items.set(id, {
      id,
      question,
      bookmarked:true,
      mastered:mastered.has(id),
      incorrectCount:0,
      correctStreak:0,
      difficult:false,
      unattempted:true,
      lastOutcome:"unattempted",
      lastAttemptedAt:null,
      nextReviewAt:null
    });
  }

  return [...items.values()].map(item => ({
    ...item,
    subject:item.question.subject || "Uncategorised",
    topic:item.question.topic || item.question.chapter || "General",
    due:item.nextReviewAt !== null && Date.parse(item.nextReviewAt) <= now.getTime()
  }));
}

export function filterRevisionItems(items, {
  category = "all",
  subject = "all",
  topic = "all",
  search = "",
  sort = "recent",
  questionIds = null
} = {}) {
  const allowedIds = questionIds ? new Set(questionIds) : null;
  const normalizedSearch = search.trim().toLocaleLowerCase();
  return items.filter(item => {
    if (allowedIds && !allowedIds.has(item.id)) return false;
    if (subject !== "all" && item.subject !== subject) return false;
    if (topic !== "all" && item.topic !== topic) return false;
    if (normalizedSearch && !item.question.question.toLocaleLowerCase().includes(normalizedSearch)) return false;
    if (category === "bookmarked" && !item.bookmarked) return false;
    if (category === "incorrect" && (item.incorrectCount === 0 || item.mastered)) return false;
    if (category === "unattempted" && (!item.unattempted || item.mastered)) return false;
    if (category === "difficult" && (!item.difficult || item.mastered)) return false;
    if (!["all", "bookmarked", "incorrect", "unattempted", "difficult", "set"].includes(category)) return false;
    return true;
  }).sort((a, b) => {
    if (sort === "due") {
      return (a.nextReviewAt ? Date.parse(a.nextReviewAt) : Infinity) -
        (b.nextReviewAt ? Date.parse(b.nextReviewAt) : Infinity) ||
        (Date.parse(b.lastAttemptedAt || "") || 0) - (Date.parse(a.lastAttemptedAt || "") || 0);
    }
    if (sort === "incorrect") return b.incorrectCount - a.incorrectCount || compareRecent(a, b);
    return compareRecent(a, b);
  });
}

function compareRecent(a, b) {
  return (Date.parse(b.lastAttemptedAt || "") || 0) - (Date.parse(a.lastAttemptedAt || "") || 0);
}

export function getRevisionReviewInterval(correctStreak) {
  if (!Number.isInteger(correctStreak) || correctStreak < 1) {
    throw new Error("A positive correct-answer streak is required.");
  }
  return REVIEW_INTERVALS_DAYS[Math.min(correctStreak - 1, REVIEW_INTERVALS_DAYS.length - 1)];
}
