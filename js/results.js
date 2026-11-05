import { formatTime } from "./timer.js";
import { selectRevisionQuestions } from "./practice.js";
import { analyzePerformance, MINIMUM_PERFORMANCE_SAMPLE } from "./performance-insights.js";

const $ = (id) => document.getElementById(id);
const safe = (value) => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[ch]));

export function renderResults({
  questions,
  answers,
  metrics,
  examName,
  submittedAt,
  onNewTest,
  onPracticeIncorrect,
  historyResults = [],
  mode = "exam"
}) {
  $("final-score").textContent = metrics.score.toFixed(2);
  $("score-out-of").textContent = `/ ${metrics.maximum}`;
  $("score-percentage").textContent = `${metrics.scorePercentage.toFixed(1)}% of maximum marks`;
  $("ring-percentage").textContent = `${Math.max(0, metrics.scorePercentage).toFixed(0)}%`;
  $("score-ring").style.setProperty("--ring", `${Math.max(0, Math.min(100, metrics.scorePercentage))}%`);
  $("result-exam-name").textContent = examName;
  $("result-time").textContent = formatTime(metrics.elapsedSeconds);
  $("result-date").textContent = submittedAt.toLocaleString();
  $("metric-correct").textContent = metrics.correct;
  $("metric-wrong").textContent = metrics.wrong;
  $("metric-unanswered").textContent = metrics.unanswered;
  $("metric-accuracy").textContent = `${metrics.accuracy.toFixed(1)}%`;
  $("metric-correct-sub").textContent = `+${metrics.correct.toFixed(2)} marks`;
  $("metric-wrong-sub").textContent = `−${metrics.negativeMarks.toFixed(2)} marks`;
  $("metric-attempt-rate").textContent = `${metrics.attemptRate.toFixed(1)}% attempt rate`;
  $("result-subtitle").textContent = metrics.autoSubmitted
    ? "Time expired. Your test was submitted automatically."
    : mode === "practice"
      ? "Practice complete. Review any answer or revise questions you missed."
      : mode === "revision"
        ? "Revision complete. Review these questions and retry them whenever you need."
        : "Your mock test has been evaluated.";

  const total = metrics.total || 1;
  $("distribution-bar").innerHTML = `
    <span class="dist-correct" style="width:${metrics.correct / total * 100}%"></span>
    <span class="dist-wrong" style="width:${metrics.wrong / total * 100}%"></span>
    <span class="dist-unanswered" style="width:${metrics.unanswered / total * 100}%"></span>`;
  $("distribution-legend").innerHTML = [
    ["Correct",metrics.correct,"answered"],["Incorrect",metrics.wrong,"unanswered"],["Unanswered",metrics.unanswered,"not-visited"]
  ].map(([name,count,cls]) => `<div><b>${count}</b><span><i class="legend-dot ${cls}"></i>${name}</span></div>`).join("");
  $("calculation-text").textContent = metrics.negativeMarks
    ? `${metrics.correct} − (${metrics.wrong} × 0.25) = ${metrics.score.toFixed(2)}`
    : `${metrics.correct} − 0 = ${metrics.score.toFixed(2)}`;
  $("time-available").textContent = mode === "exam" ? formatTime(metrics.durationSeconds) : "No time limit";
  $("time-taken").textContent = formatTime(metrics.elapsedSeconds);
  $("time-average").textContent = metrics.attempted ? `${formatTime(metrics.averageSeconds)} per attempted question` : "—";
  $("time-remaining").textContent = mode !== "exam"
    ? "—"
    : metrics.autoSubmitted ? "00:00:00 (time expired)" : formatTime(metrics.remainingSeconds);
  $("result-leaderboard").classList.toggle("hidden", mode !== "exam");

  const performance = analyzePerformance(historyResults.length
    ? historyResults
    : [{ questions, answers, metrics, submittedAt:submittedAt.toISOString(), paper:examName }]);
  const statusLabels = {
    strong:"Strong",
    improving:"Improving",
    revision:"Needs revision",
    weak:"Weak",
    insufficient:"Insufficient data"
  };
  $("subject-analysis").innerHTML = performance.subjects.map(item => {
    const pct = item.accuracy;
    const trend = item.trend === null
      ? ""
      : ` <span class="insight-trend ${item.trend >= 0 ? "positive" : "negative"}">${item.trend >= 0 ? "+" : ""}${item.trend.toFixed(0)} pp since prior test</span>`;
    return `<div class="insight-row">
      <div class="insight-row-heading"><strong>${safe(item.name)}</strong><span class="insight-status ${item.status}">${statusLabels[item.status]}</span></div>
      <div class="subject-track"><span style="width:${pct}%"></span></div>
      <div class="insight-row-detail"><span>${item.correct} correct · ${item.wrong} incorrect</span><span>${pct.toFixed(0)}% accuracy · ${item.attempted} attempted${trend}</span></div>
    </div>`;
  }).join("") || '<p class="empty-datasets">Complete questions to see subject insights.</p>';

  $("topic-analysis").innerHTML = performance.topics.map(item =>
    `<div class="insight-row">
      <div class="insight-row-heading"><strong>${safe(item.name)}</strong><span class="insight-status ${item.status}">${statusLabels[item.status]}</span></div>
      <div class="insight-topic-subject">${safe(item.subject)}</div>
      <div class="subject-track"><span style="width:${item.accuracy}%"></span></div>
      <div class="insight-row-detail"><span>${item.correct} correct · ${item.wrong} incorrect</span><span>${item.accuracy.toFixed(0)}% accuracy · ${item.attempted} attempted</span></div>
    </div>`
  ).join("") || '<p class="empty-datasets">Topic insights will appear after you answer questions.</p>';

  const focusSubject = performance.subjects.find(item => ["weak", "revision", "improving"].includes(item.status));
  const focusTopics = focusSubject
    ? performance.topics.filter(item =>
      item.subject === focusSubject.name && ["weak", "revision", "improving"].includes(item.status)
    ).slice(0, 2)
    : [];
  $("recommendations").innerHTML = focusSubject
    ? `<strong>Recommended next activity</strong><p>Practise 25 questions on ${safe(focusSubject.name)}${focusTopics.length ? `, focusing on ${focusTopics.map(item => safe(item.name)).join(" and ")}` : ""}.</p>`
    : performance.subjects.some(item => item.status === "insufficient")
      ? `<strong>Recommended next activity</strong><p>Answer at least ${MINIMUM_PERFORMANCE_SAMPLE} questions in each subject or topic to get reliable preparation insights.</p>`
      : '<strong>Preparation insights</strong><p>Keep practising to build a reliable picture of your strengths and focus areas.</p>';

  $("progress-summary").innerHTML = [
    ["Correct", performance.totalCorrect],
    ["Incorrect", performance.totalWrong],
    ["Average time per attempted question", performance.totalAttempted ? formatTime(performance.averageSeconds) : "—"]
  ].map(([label, value]) => `<div class="progress-stat"><span>${safe(label)}</span><strong>${safe(value)}</strong></div>`).join("");
  $("test-progress-list").innerHTML = performance.tests.length
    ? performance.tests.map(test => {
      const change = test.change === null ? "First recorded test" : `${test.change >= 0 ? "+" : ""}${test.change.toFixed(0)} percentage points`;
      return `<div class="test-progress-row">
        <div><strong>${safe(test.name)}</strong><small>${test.submittedAt ? safe(new Date(test.submittedAt).toLocaleDateString()) : "Date unavailable"} · ${test.attempted} attempted</small></div>
        <span>${test.accuracy.toFixed(0)}%<small>${safe(change)}</small></span>
      </div>`;
    }).join("")
    : '<p class="empty-datasets">Complete an attempted question to begin tracking improvement.</p>';
  $("repeated-topic-list").innerHTML = performance.repeatedIncorrectTopics.length
    ? performance.repeatedIncorrectTopics.slice(0, 5).map(item =>
      `<div class="repeated-topic-row"><strong>${safe(item.name)}</strong><span>${safe(item.subject)} · incorrect ${item.wrong} times</span></div>`
    ).join("")
    : '<p class="empty-datasets">No topic has multiple incorrect answers yet.</p>';
  $("repeated-incorrect-list").innerHTML = performance.repeatedIncorrect.length
    ? performance.repeatedIncorrect.map(item =>
      `<div class="repeated-incorrect-row"><strong>${safe(item.question)}</strong><span>${safe(item.subject)} · ${safe(item.topic)} · incorrect ${item.count} times</span></div>`
    ).join("")
    : '<p class="empty-datasets">No questions have been answered incorrectly more than once yet.</p>';

  const revisionQuestions = selectRevisionQuestions(questions, answers);
  $("review-total").textContent = `${questions.length} questions`;
  renderAnswerReview(questions, answers, "all");
  $("review-filters").querySelectorAll("[data-filter]").forEach(button => {
    button.addEventListener("click", () => {
      $("review-filters").querySelectorAll("[data-filter]").forEach(b => b.classList.toggle("active", b === button));
      renderAnswerReview(questions, answers, button.dataset.filter);
    });
  });
  $("retake-button").onclick = onNewTest;
  $("new-test-button").onclick = onNewTest;
  const revisionButton = $("wrong-revision-button");
  revisionButton.classList.toggle("hidden", !revisionQuestions.length || !onPracticeIncorrect);
  revisionButton.onclick = onPracticeIncorrect
    ? () => onPracticeIncorrect(revisionQuestions)
    : null;
}

function renderAnswerReview(questions, answers, filter) {
  const list = $("answer-review-list");
  const entries = questions.map((q,i) => {
    const selected = answers[i].selected;
    const status = !selected ? "unanswered" : selected === q.correctAnswer ? "correct" : "wrong";
    return { q, selected, status, index:i };
  }).filter(item => filter === "all" || item.status === filter);
  if (!entries.length) {
    list.innerHTML = `<div class="empty-review">No questions in this category.</div>`;
    return;
  }
  list.innerHTML = entries.map(({q,selected,status,index}) => {
    const label = status === "correct" ? "Correct" : status === "wrong" ? "Incorrect" : "Unanswered";
    const options = ["A","B","C","D"].map(key => {
      const classes = ["review-option"];
      if (key === q.correctAnswer) classes.push("correct-option");
      if (key === selected && selected !== q.correctAnswer) classes.push("user-wrong");
      const note = key === q.correctAnswer ? " · Correct answer" : key === selected ? " · Your answer" : "";
      return `<div class="${classes.join(" ")}">${key}. ${safe(q.options[key])}${note}</div>`;
    }).join("");
    const selectedLabel = selected ? `${selected}. ${safe(q.options[selected])}` : "Not attempted";
    const sourceUrl = typeof q.source === "string" && /^https?:\/\//i.test(q.source) ? q.source : "";
    return `<details class="review-question">
      <summary><span class="review-q-number">${index+1}</span><span class="review-q-title">${safe(q.question)}</span><span class="review-status ${status}">${label}</span><span class="review-chevron">⌄</span></summary>
      <div class="review-body"><div class="review-options">${options}</div>
        <div class="review-explanation"><strong>Your answer: ${selectedLabel}</strong>${safe(q.explanation || "No explanation provided in the question bank.")}</div>
        ${sourceUrl ? `<div class="review-source">Source: <a href="${safe(sourceUrl)}" target="_blank" rel="noopener noreferrer">${safe(sourceUrl)}</a></div>` : ""}
      </div>
    </details>`;
  }).join("");
}
