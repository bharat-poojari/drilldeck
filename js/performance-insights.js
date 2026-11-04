export const MINIMUM_PERFORMANCE_SAMPLE = 3;

const questionStatus = (question, answer) => {
  if (!answer?.selected) return "unanswered";
  return answer.selected === question.correctAnswer ? "correct" : "wrong";
};

function createStats(name, subject = null, topic = null) {
  return { name, subject, topic, total:0, attempted:0, correct:0, wrong:0, unanswered:0, accuracy:0, status:"insufficient", trend:null };
}

function classify(stats) {
  if (stats.attempted < MINIMUM_PERFORMANCE_SAMPLE) return "insufficient";
  if (stats.accuracy >= 80) return "strong";
  if (stats.trend !== null && stats.trend >= 10) return "improving";
  if (stats.accuracy < 50) return "weak";
  return "revision";
}

function updateAccuracy(stats) {
  stats.accuracy = stats.attempted ? stats.correct / stats.attempted * 100 : 0;
  stats.status = classify(stats);
}

function addAnswer(stats, status) {
  stats.total++;
  stats[status]++;
  if (status !== "unanswered") stats.attempted++;
}

function questionKey(question) {
  if ((typeof question.id === "string" && question.id.length > 0) || typeof question.id === "number") {
    return `id:${question.id}`;
  }
  return `text:${String(question.question || "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()}`;
}

export function analyzePerformance(results = []) {
  const subjects = new Map();
  const topics = new Map();
  const repeatedIncorrect = new Map();
  const tests = [];
  let totalCorrect = 0;
  let totalWrong = 0;
  let totalUnanswered = 0;
  let totalAttempted = 0;
  let elapsedSeconds = 0;

  const orderedResults = results
    .map((result, index) => ({ result, index }))
    .sort((a, b) => {
      const timeDifference = Date.parse(a.result.submittedAt || "") - Date.parse(b.result.submittedAt || "");
      return (Number.isFinite(timeDifference) ? timeDifference : 0) || a.index - b.index;
    });

  for (const { result } of orderedResults) {
    const questions = Array.isArray(result.questions) ? result.questions : [];
    const answers = Array.isArray(result.answers) ? result.answers : [];
    const testSubjects = new Map();
    let correct = 0;
    let wrong = 0;
    let unanswered = 0;

    questions.forEach((question, index) => {
      const answer = answers[index];
      const status = questionStatus(question, answer);
      const subject = question.subject || result.paper || "Uncategorised";
      const topic = question.topic || question.chapter || "Uncategorised";
      const topicKey = `${subject}\u0000${topic}`;
      if (!subjects.has(subject)) subjects.set(subject, createStats(subject));
      if (!topics.has(topicKey)) topics.set(topicKey, createStats(topic, subject, topic));
      if (!testSubjects.has(subject)) testSubjects.set(subject, { attempted:0, correct:0 });
      addAnswer(subjects.get(subject), status);
      addAnswer(topics.get(topicKey), status);
      if (status === "correct") {
        correct++;
        testSubjects.get(subject).correct++;
        testSubjects.get(subject).attempted++;
      } else if (status === "wrong") {
        wrong++;
        testSubjects.get(subject).attempted++;
        const key = questionKey(question);
        if (!repeatedIncorrect.has(key)) {
          repeatedIncorrect.set(key, {
            question:question.question || "Question text unavailable",
            subject,
            topic,
            count:0
          });
        }
        repeatedIncorrect.get(key).count++;
      } else {
        unanswered++;
      }
    });

    const attempted = correct + wrong;
    totalCorrect += correct;
    totalWrong += wrong;
    totalUnanswered += unanswered;
    totalAttempted += attempted;
    if (attempted) {
      elapsedSeconds += Number.isFinite(result.metrics?.elapsedSeconds)
        ? result.metrics.elapsedSeconds
        : Number.isFinite(result.timeTakenSeconds) ? result.timeTakenSeconds : 0;
    }

    for (const [subject, stats] of testSubjects) {
      if (!subjects.has(subject)) subjects.set(subject, createStats(subject));
      const history = subjects.get(subject);
      if (!history.testHistory) history.testHistory = [];
      history.testHistory.push(stats);
    }

    if (attempted) {
      tests.push({
        id:result.id || "",
        name:result.paper || result.examName || "Practice test",
        submittedAt:result.submittedAt || "",
        attempted,
        correct,
        wrong,
        unanswered,
        accuracy:correct / attempted * 100
      });
    }
  }

  for (const stats of subjects.values()) {
    const history = (stats.testHistory || []).filter(item => item.attempted >= MINIMUM_PERFORMANCE_SAMPLE);
    if (history.length > 1) {
      const previous = history[history.length - 2];
      const latest = history[history.length - 1];
      stats.trend = (latest.correct / latest.attempted - previous.correct / previous.attempted) * 100;
    }
    updateAccuracy(stats);
    delete stats.testHistory;
  }

  for (const stats of topics.values()) {
    updateAccuracy(stats);
  }

  tests.forEach((test, index) => {
    test.change = index ? test.accuracy - tests[index - 1].accuracy : null;
  });

  const orderedSubjects = [...subjects.values()].sort((a, b) =>
    (a.accuracy - b.accuracy) || b.attempted - a.attempted || a.name.localeCompare(b.name)
  );
  const orderedTopics = [...topics.values()].sort((a, b) =>
    (a.accuracy - b.accuracy) || b.attempted - a.attempted || a.name.localeCompare(b.name)
  );

  return {
    subjects:orderedSubjects,
    topics:orderedTopics,
    tests:tests.slice(-5).reverse(),
    repeatedIncorrectTopics:orderedTopics
      .filter(item => item.wrong >= 2)
      .sort((a, b) => b.wrong - a.wrong),
    repeatedIncorrect:[...repeatedIncorrect.values()]
      .filter(item => item.count > 1)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    totalCorrect,
    totalWrong,
    totalUnanswered,
    totalAttempted,
    averageSeconds:totalAttempted ? elapsedSeconds / totalAttempted : 0
  };
}
