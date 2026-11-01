import { formatTime } from "./timer.js";

const $ = (id) => document.getElementById(id);
const safe = (value) => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[ch]));

export function renderResults({ questions, answers, metrics, examName, submittedAt, onNewTest }) {
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
    : "Your mock test has been evaluated.";

  const total = metrics.total || 1;
  $("distribution-bar").innerHTML = `
    <span class="dist-correct" style="width:${metrics.correct / total * 100}%"></span>
    <span class="dist-wrong" style="width:${metrics.wrong / total * 100}%"></span>
    <span class="dist-unanswered" style="width:${metrics.unanswered / total * 100}%"></span>`;
  $("distribution-legend").innerHTML = [
    ["Correct",metrics.correct,"answered"],["Incorrect",metrics.wrong,"unanswered"],["Unanswered",metrics.unanswered,"not-visited"]
  ].map(([name,count,cls]) => `<div><b>${count}</b><span><i class="legend-dot ${cls}"></i>${name}</span></div>`).join("");
  $("calculation-text").textContent = `${metrics.correct} − (${metrics.wrong} × 0.25) = ${metrics.score.toFixed(2)}`;
  $("time-available").textContent = formatTime(metrics.durationSeconds);
  $("time-taken").textContent = formatTime(metrics.elapsedSeconds);
  $("time-average").textContent = metrics.attempted ? `${formatTime(metrics.averageSeconds)} per attempted question` : "—";
  $("time-remaining").textContent = metrics.autoSubmitted ? "00:00:00 (time expired)" : formatTime(metrics.remainingSeconds);

  $("subject-analysis").innerHTML = metrics.subjects.map(item => {
    const pct = item.total ? item.correct / item.total * 100 : 0;
    return `<div class="subject-row"><span class="subject-name">${safe(item.name)}</span><div class="subject-track"><span style="width:${pct}%"></span></div><span class="subject-score">${item.correct}/${item.total} · ${pct.toFixed(0)}%</span></div>`;
  }).join("");

  const strongest = metrics.subjects[0];
  const weakest = [...metrics.subjects].sort((a,b) => (a.correct/a.total) - (b.correct/b.total))[0];
  const weakTopics = metrics.topics.filter(t => t.wrong > 0).sort((a,b) => b.wrong-a.wrong).slice(0,3);
  let insight = "";
  if (strongest) insight += `<strong>Strongest subject:</strong> ${safe(strongest.name)} (${Math.round(strongest.correct/strongest.total*100)}% correct). `;
  if (weakest) insight += `<strong>Focus area:</strong> ${safe(weakest.name)} (${Math.round(weakest.correct/weakest.total*100)}% correct). `;
  if (weakTopics.length) insight += `<strong>Topics to revisit:</strong> ${weakTopics.map(t => `${safe(t.name)} (${t.wrong} incorrect)`).join(", ")}.`;
  if (!insight) insight = "Complete more questions to generate subject and topic insights.";
  $("recommendations").innerHTML = insight;

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
