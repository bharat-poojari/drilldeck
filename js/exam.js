export function createExamState(questions) {
  return {
    questions,
    answers: questions.map(() => ({ selected: null, visited: false, review: false })),
    currentIndex: 0,
    submitted: false
  };
}

export function getQuestionStatus(item, isCurrent = false) {
  if (item.review) return "review";
  if (item.selected) return "answered";
  if (item.visited) return "unanswered";
  return "not-visited";
}

export function answerQuestion(state, index, answer) {
  if (state.submitted || !state.answers[index]) return;
  state.answers[index].selected = answer;
}

export function visitQuestion(state, index) {
  if (state.submitted || index < 0 || index >= state.questions.length) return;
  state.currentIndex = index;
  state.answers[index].visited = true;
}

export function toggleReview(state, index) {
  if (state.submitted || !state.answers[index]) return;
  state.answers[index].review = !state.answers[index].review;
}

export function clearAnswer(state, index) {
  if (state.submitted || !state.answers[index]) return;
  state.answers[index].selected = null;
}
