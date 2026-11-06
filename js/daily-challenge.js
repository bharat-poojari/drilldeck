const DAY_MS = 86400000;
const DRILL_COUNTS = {
  generalKnowledge:10,
  karnataka:5,
  science:5,
  currentAffairs:5
};
const SPECIAL_CHALLENGE_COUNTS = {
  karnataka:10,
  "current-affairs":10
};

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date, amount) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() + amount);
  return result;
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededShuffle(items, seed) {
  const shuffled = [...items];
  let state = stableHash(seed) || 1;
  for (let index = shuffled.length - 1; index > 0; index--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const target = state % (index + 1);
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

function datasetPath(question) {
  return `${question.datasetId || ""} ${question.datasetTitle || ""}`.toLowerCase();
}

function isCurrentAffairs(question) {
  return /current[\s_-]*affairs/.test(datasetPath(question)) || question.subject === "Current Affairs";
}

function isScience(question) {
  return /general[\s_-]*science/.test(datasetPath(question)) || question.subject === "General Science";
}

function isKarnataka(question) {
  return /karnataka/.test(datasetPath(question));
}

function isGeneralKnowledge(question) {
  return question.paper === "general-knowledge" &&
    !isCurrentAffairs(question) &&
    !isScience(question) &&
    !isKarnataka(question);
}

function selectFromPool(pool, count, dateKey, challengeType) {
  if (pool.length < count) {
    throw new Error(`This challenge needs ${count} questions, but only ${pool.length} matching questions are available.`);
  }
  return seededShuffle(pool, `${dateKey}:${challengeType}`).slice(0, count);
}

export function selectQuestionOfTheDay(questions, date = new Date()) {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error("No questions are available for today's challenge.");
  }
  const dayNumber = Math.floor(Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  ) / 86400000);
  return questions[((dayNumber % questions.length) + questions.length) % questions.length];
}

export function selectDailyFacts(questions, date = new Date()) {
  if (!Array.isArray(questions)) throw new Error("The question bank is unavailable for today's facts.");
  const dateKey = localDateKey(date);
  const isConstitution = question =>
    /constitution|fundamental rights|directive principles|article \d+|indian polity/i.test(
      `${datasetPath(question)} ${question.topic || ""} ${question.chapter || ""} ${question.question || ""}`
    );
  const groups = [
    ["Karnataka", questions.filter(question => isKarnataka(question) && !isCurrentAffairs(question))],
    ["Constitution", questions.filter(isConstitution)],
    ["Geography", questions.filter(question => /geography/.test(datasetPath(question)) && !isKarnataka(question))],
    ["Science", questions.filter(isScience)],
    ["Current Affairs", questions.filter(isCurrentAffairs)]
  ];
  return groups.map(([category, pool]) => ({
    category,
    question:pool.length
      ? seededShuffle(pool, `${dateKey}:fact:${category}`)[0]
      : null
  }));
}

export function selectDailyDrill(questions, date = new Date()) {
  if (!Array.isArray(questions)) throw new Error("The question bank is unavailable for today's drill.");
  const dateKey = localDateKey(date);
  const pools = {
    generalKnowledge:questions.filter(isGeneralKnowledge),
    karnataka:questions.filter(question => isKarnataka(question) && !isCurrentAffairs(question)),
    science:questions.filter(isScience),
    currentAffairs:questions.filter(isCurrentAffairs)
  };
  const groups = Object.entries(DRILL_COUNTS).map(([category, count]) => [
    category,
    selectFromPool(pools[category], count, dateKey, category)
  ]);
  return groups.flatMap(([, selected]) => selected);
}

export function selectSpecialChallenge(questions, type, date = new Date()) {
  if (!Object.hasOwn(SPECIAL_CHALLENGE_COUNTS, type)) {
    throw new Error("This daily challenge is not available.");
  }
  if (!Array.isArray(questions)) throw new Error("The question bank is unavailable for this challenge.");
  const pool = type === "karnataka"
    ? questions.filter(question => isKarnataka(question) && !isCurrentAffairs(question))
    : questions.filter(isCurrentAffairs);
  return selectFromPool(pool, SPECIAL_CHALLENGE_COUNTS[type], localDateKey(date), type);
}

export function getChallengeActivity(results = [], today = new Date()) {
  const completedDays = new Set();
  for (const result of results) {
    if (!["daily-drill", "question-of-day", "karnataka", "current-affairs"].includes(result.challengeType) ||
        typeof result.challengeDate !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(result.challengeDate)) continue;
    if (challengeMeetsCompletionThreshold(result)) completedDays.add(result.challengeDate);
  }

  const todayKey = localDateKey(today);
  const weekStart = addDays(today, -((today.getDay() + 6) % 7));
  const week = Array.from({ length:7 }, (_, index) => {
    const date = addDays(weekStart, index);
    const key = localDateKey(date);
    return {
      key,
      label:["M", "T", "W", "T", "F", "S", "S"][index],
      day:date.toLocaleDateString(undefined, { weekday:"long" }),
      completed:completedDays.has(key),
      today:key === todayKey
    };
  });

  const yesterdayKey = localDateKey(addDays(today, -1));
  let streak = 0;
  let streakDate = completedDays.has(todayKey) ? today : completedDays.has(yesterdayKey) ? addDays(today, -1) : null;
  while (streakDate && completedDays.has(localDateKey(streakDate))) {
    streak++;
    streakDate = addDays(streakDate, -1);
  }

  const monthDays = [...completedDays].filter(key => key.startsWith(todayKey.slice(0, 7))).length;
  return {
    week,
    weekCount:week.filter(day => day.completed).length,
    streak,
    monthDays,
    milestoneProgress:monthDays % 10 || (monthDays ? 10 : 0),
    nextMilestone:Math.ceil((monthDays + 1) / 10) * 10
  };
}

export function challengeMeetsCompletionThreshold(result) {
  const total = Number(result?.totalQuestions);
  const attempted = Number.isFinite(result?.metrics?.attempted)
    ? result.metrics.attempted
    : Number(result?.correctAnswers || 0) + Number(result?.incorrectAnswers || 0);
  return Number.isInteger(total) && total > 0 && attempted >= Math.ceil(total / 2);
}
