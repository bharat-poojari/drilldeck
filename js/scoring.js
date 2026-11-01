export function calculateResults(questions, answers, durationSeconds, elapsedSeconds, autoSubmitted = false) {
  let correct = 0, wrong = 0, unanswered = 0;
  const subjectMap = new Map();
  const topicMap = new Map();

  questions.forEach((q, index) => {
    const selected = answers[index].selected;
    const status = !selected ? "unanswered" : selected === q.correctAnswer ? "correct" : "wrong";
    if (status === "correct") correct++;
    else if (status === "wrong") wrong++;
    else unanswered++;

    const add = (map, key) => {
      if (!map.has(key)) map.set(key, { name: key, total: 0, correct: 0, wrong: 0, unanswered: 0 });
      const item = map.get(key);
      item.total++;
      item[status]++;
    };
    add(subjectMap, q.subject || "Uncategorised");
    add(topicMap, q.topic || "Uncategorised");
  });

  const attempted = correct + wrong;
  const negativeMarks = wrong * 0.25;
  const score = correct - negativeMarks;
  const accuracy = attempted ? correct / attempted * 100 : 0;
  const attemptRate = questions.length ? attempted / questions.length * 100 : 0;
  return {
    total: questions.length, correct, wrong, unanswered, attempted, negativeMarks, score,
    maximum: questions.length, scorePercentage: questions.length ? score / questions.length * 100 : 0,
    accuracy, attemptRate, correctPercentage: questions.length ? correct / questions.length * 100 : 0,
    wrongPercentage: questions.length ? wrong / questions.length * 100 : 0,
    durationSeconds, elapsedSeconds, remainingSeconds: Math.max(0, durationSeconds - elapsedSeconds),
    averageSeconds: attempted ? elapsedSeconds / attempted : 0,
    subjects: [...subjectMap.values()].sort((a,b) => (b.correct / b.total) - (a.correct / a.total)),
    topics: [...topicMap.values()],
    autoSubmitted
  };
}
