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
