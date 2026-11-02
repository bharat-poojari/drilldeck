import { loadQuestionBank, filterQuestions, selectRandomQuestions } from "./questions.js";
import { createExamState, getQuestionStatus, answerQuestion, visitQuestion, toggleReview, clearAnswer } from "./exam.js";
import { createTimer, formatTime } from "./timer.js";
import { calculateResults } from "./scoring.js";
import { renderResults } from "./results.js";
import { getCurrentAccount, initializeAccounts, initializeCommunityChat, managePublishedScore, publishScore } from "./accounts.js";
import { createResultsStore } from "./results-store.js";

const $ = id => document.getElementById(id);
const views = { setup:$("setup-view"), exam:$("exam-view"), result:$("result-view") };
const resultsStore = createResultsStore({
  getItem:key => window.localStorage.getItem(key),
  setItem:(key, value) => window.localStorage.setItem(key, value)
});
let bank = null;
let examState = null;
let timer = null;
let durationSeconds = 0;
let examStartedAt = null;
let submitInProgress = false;
let examContext = null;
let examTestId = null;
let toastTimeout = null;
let currentSetupStep = 1;
const setupStepTitles = ["Choose your paper","Choose question datasets","Set test preferences","Review and start"];

function showView(name) {
  Object.entries(views).forEach(([key, node]) => node.classList.toggle("hidden", key !== name));
  window.scrollTo({ top:0, behavior:"instant" });
}
function toast(message) {
  const node = $("toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => node.classList.remove("show"), 2600);
}
function getSelectedCount() {
  return Number($("count-input").value);
}
function renderCheckboxOptions(container, name, values, allLabel) {
  const options = [...new Set(values)].sort((a,b)=>a.localeCompare(b));
  container.innerHTML = options.length
    ? `<label class="selection-option selection-all"><input type="checkbox" data-select-all checked><span>${escapeHtml(allLabel)}</span></label>
      ${options.map(value => `<label class="selection-option"><input type="checkbox" name="${name}" value="${escapeHtml(value)}" checked><span>${escapeHtml(value)}</span></label>`).join("")}`
    : '<p class="empty-datasets">No options available.</p>';
}
function checkedValues(container, name) {
  return [...container.querySelectorAll(`input[name="${name}"]:checked`)].map(input=>input.value);
}
function syncSelectAll(container) {
  const all = container.querySelector("[data-select-all]");
  const options = [...container.querySelectorAll('input[type="checkbox"][name]')];
  if (!all) return;
  all.checked = options.length > 0 && options.every(option=>option.checked);
  all.indeterminate = !all.checked && options.some(option=>option.checked);
}
function handleSelectionChange(container, callback) {
  container.addEventListener("change", event => {
    if (event.target.matches("[data-select-all]")) {
      container.querySelectorAll('input[type="checkbox"][name]').forEach(option=>option.checked=event.target.checked);
    }
    syncSelectAll(container);
    callback();
  });
}
function showSetupStep(step) {
  currentSetupStep = step;
  document.querySelectorAll("[data-setup-step]").forEach(section =>
    section.classList.toggle("hidden", Number(section.dataset.setupStep) !== step)
  );
  $("setup-step-label").textContent = `STEP ${String(step).padStart(2,"0")} OF 04`;
  $("setup-step-title").textContent = setupStepTitles[step-1];
  $("setup-error").textContent = "";
  $("setup-panel").scrollIntoView({ behavior:"smooth", block:"start" });
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[ch]));
}
function createId() {
  return globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, character => {
      const value = Math.floor(Math.random() * 16);
      return (character === "x" ? value : (value & 3) | 8).toString(16);
    });
}
function setResultUrl(id) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("result", id);
  else url.searchParams.delete("result");
  window.history.replaceState({}, "", url);
}
function renderLocalHistory() {
  const container = $("local-test-history");
  const status = $("local-data-status");
  try {
    const { results } = resultsStore.getData();
    if (status.classList.contains("error-message")) status.textContent = "";
    status.classList.remove("error-message");
    if (!results.length) {
      container.innerHTML = '<p class="empty-datasets">Your completed tests will appear here. Results stay on this device unless you export a backup.</p>';
      return;
    }
    container.innerHTML = `<ol class="score-list">${results.map(result => {
      const canManage = result.userId === null
        ? Boolean(result.guestId)
        : getCurrentAccount()?.id === result.userId;
      const controls = result.leaderboard?.published
        ? `<div class="local-score-controls">
            ${canManage
              ? `<label class="sr-only" for="public-name-${escapeHtml(result.id)}">Public display name</label>
                 <input id="public-name-${escapeHtml(result.id)}" data-public-name type="text" maxlength="60" value="${escapeHtml(result.leaderboard.name)}">
                 <button class="button button-outline" type="button" data-score-action="rename" data-result-id="${escapeHtml(result.id)}">Save name</button>
                 <button class="button button-outline" type="button" data-score-action="remove" data-result-id="${escapeHtml(result.id)}">Remove from leaderboard</button>`
              : '<span class="field-help">Sign in to manage this published score.</span>'}
          </div>`
        : "";
      return `
      <li class="score-entry local-history-entry">
        <div class="local-result-details">
          <span class="local-result-date">${escapeHtml(new Date(result.submittedAt).toLocaleString())}</span>
          <span class="score-name">${escapeHtml(result.paper)}<small>${escapeHtml(result.selectedCategories.join(", "))} · ${result.totalQuestions} questions</small></span>
        </div>
        <button class="button button-outline local-result-open" type="button" data-result-id="${escapeHtml(result.id)}" aria-label="Open result from ${escapeHtml(new Date(result.submittedAt).toLocaleDateString())}">${escapeHtml(result.totalScore.toFixed(2))} / ${escapeHtml(result.metrics.maximum.toFixed(2))}<span>Open</span></button>
        ${controls}
      </li>`;
    }).join("")}</ol>`;
  } catch (error) {
    container.innerHTML = '<p class="empty-datasets">Saved test history could not be loaded.</p>';
    status.textContent = error.message;
    status.classList.add("error-message");
  }
}
function showSavedResult(id) {
  try {
    const result = resultsStore.getData().results.find(item => item.id === id);
    if (!result) {
      $("local-data-status").textContent = "That saved result was not found on this device. Import the backup that contains it.";
      $("local-data-status").classList.add("error-message");
      showView("setup");
      return;
    }
    renderResults({
      questions:result.questions,
      answers:result.answers,
      metrics:result.metrics,
      examName:result.examName,
      submittedAt:new Date(result.submittedAt),
      onNewTest:resetToSetup
    });
    $("local-save-status").textContent = "This result is saved on this device. Export a backup to move it to another browser.";
    $("score-publish-status").textContent = "Viewing a saved local result. This result is not republished.";
    $("retry-publish").classList.add("hidden");
    setResultUrl(result.id);
    showView("result");
  } catch (error) {
    $("local-data-status").textContent = `Saved result could not be opened: ${error.message}`;
    $("local-data-status").classList.add("error-message");
    showView("setup");
  }
}
function restoreResultFromUrl() {
  const id = new URL(window.location.href).searchParams.get("result");
  if (id) showSavedResult(id);
}
function downloadLocalData() {
  try {
    const backup = resultsStore.exportData();
    const url = URL.createObjectURL(new Blob([backup], { type:"application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `drilldeck-results-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    $("local-data-status").textContent = "Your local results backup has been downloaded.";
    $("local-data-status").classList.remove("error-message");
  } catch (error) {
    $("local-data-status").textContent = `Backup could not be exported: ${error.message}`;
    $("local-data-status").classList.add("error-message");
  }
}
async function importLocalData(file) {
  try {
    const restored = resultsStore.importData(await file.text());
    $("local-data-status").textContent = `Imported ${restored.results.length} saved test${restored.results.length === 1 ? "" : "s"}. Existing results were kept.`;
    $("local-data-status").classList.remove("error-message");
    renderLocalHistory();
  } catch (error) {
    $("local-data-status").textContent = `Backup could not be imported: ${error.message}`;
    $("local-data-status").classList.add("error-message");
  }
}
function selectedCategories() {
  return checkedValues($("category-options"), "category");
}
function selectedDatasets() {
  return [...$("dataset-options").querySelectorAll('input[name="dataset"]:checked')].map(input => input.value);
}
function currentFilters() {
  return {
    paper:$("paper-select").value,
    categories:selectedCategories(),
    datasets:selectedDatasets(),
    topics:checkedValues($("topic-options"), "topic"),
    difficulty:$("difficulty-select").value,
  };
}
function updateAvailability() {
  if (!bank) return;
  const matches = filterQuestions(bank.questions, currentFilters()).length;
  const requested = getSelectedCount();
  $("availability-note").textContent = `${matches} matching question${matches===1?"":"s"} available · ${requested} requested`;
  $("availability-note").style.color = matches < requested ? "var(--red)" : "var(--muted)";
  $("start-button").disabled = !Number.isInteger(requested) || requested < 1 || matches < requested;
}
function renderDatasets() {
  const categories = new Set(selectedCategories());
  const datasets = bank.datasets.filter(dataset =>
    dataset.paper === $("paper-select").value && categories.has(dataset.subject)
  );
  $("dataset-options").innerHTML = datasets.length
    ? `<label class="selection-option dataset-select-all"><input type="checkbox" data-select-all checked><span>Select all datasets</span></label>
      ${datasets.map(dataset => `
        <label class="dataset-option">
          <input type="checkbox" name="dataset" value="${escapeHtml(dataset.id)}" checked>
          <span><strong>${escapeHtml(dataset.title)}</strong><small>${escapeHtml([dataset.subject, dataset.subcategory].filter(Boolean).join(" / "))} · ${dataset.questions.length} questions</small></span>
        </label>`).join("")}`
    : '<p class="empty-datasets">No question datasets found for this selection yet.</p>';
  $("dataset-options").scrollTop = 0;
  updateTopics();
}
function updateTopics() {
  const datasetIds = new Set(selectedDatasets());
  const topics = bank.questions.filter(question => datasetIds.has(question.datasetId)).map(question => question.topic);
  renderCheckboxOptions($("topic-options"), "topic", topics, "All subcategories");
  updateAvailability();
}
async function initialize() {
  try {
    bank = await loadQuestionBank();
    $("bank-count").textContent = bank.questions.length.toLocaleString();
    updatePaperOptions();
  } catch (error) {
    $("bank-count").textContent = "Error";
    $("availability-note").textContent = "Question bank could not be loaded.";
    $("setup-error").textContent = `${error.message} Rebuild the dataset index with "npm run build" after adding JSON files, and run the site through a local web server or Vercel.`;
    $("start-button").disabled = true;
  }
}

function updatePaperOptions() {
  const paper = $("paper-select").value;
  const subjects = [...new Set(bank.datasets.filter(dataset=>dataset.paper===paper).map(dataset=>dataset.subject))];
  $("category-label").textContent = paper === "general-knowledge" ? "General Knowledge category" : "Choose subjects";
  renderCheckboxOptions($("category-options"), "category", subjects,
    paper === "general-knowledge" ? "All General Knowledge" : "All subjects");
  renderDatasets();
}

function startExam(event) {
  event.preventDefault();
  $("setup-error").textContent = "";
  if (!bank || currentSetupStep !== 4) return;
  const count = getSelectedCount();
  if (!Number.isInteger(count) || count < 1 || count > 1000) {
    $("setup-error").textContent = "Enter a question count between 1 and 1,000.";
    return;
  }
  const duration = Number($("duration-input").value);
  if (!Number.isInteger(duration) || duration < 1 || duration > 600) {
    $("setup-error").textContent = "Enter a duration between 1 and 600 minutes.";
    return;
  }
  const matching = filterQuestions(bank.questions, currentFilters());
  if (matching.length < count) {
    $("setup-error").textContent = `Only ${matching.length} matching questions are available. Select fewer questions or broaden the filters.`;
    return;
  }
  try {
    const selected = selectRandomQuestions(matching, count);
    examState = createExamState(selected);
    examTestId = createId();
    const filters = currentFilters();
    examContext = {
      paper:$("paper-select").value === "general-knowledge"
        ? "General Knowledge"
        : "General Kannada, English & Computer Knowledge",
      subjects:[...new Set(selected.map(question => question.subject))],
      paperId:filters.paper,
      categories:filters.categories,
      datasets:filters.datasets,
      topics:filters.topics,
      difficulty:filters.difficulty
    };
    durationSeconds = duration * 60;
    examStartedAt = Date.now();
    submitInProgress = false;
    $("exam-title").textContent = `${examContext.paper} Mock Test`;
    $("exam-total").textContent = count;
    $("exam-max").textContent = count;
    $("timer-box").classList.remove("warning","critical");
    showView("exam");
    visitQuestion(examState, 0);
    renderQuestion();
    timer = createTimer({
      durationSeconds,
      onTick: updateTimer,
      onExpire: () => finalizeExam(true)
    });
    timer.start();
  } catch (error) {
    $("setup-error").textContent = error.message;
  }
}

function updateTimer(remaining) {
  $("timer-display").textContent = formatTime(remaining);
  $("timer-box").classList.toggle("warning", remaining <= 300 && remaining > 60);
  $("timer-box").classList.toggle("critical", remaining <= 60);
  if (remaining === 300 || remaining === 60) toast(remaining === 300 ? "Five minutes remaining." : "One minute remaining.");
}

function renderQuestion() {
  if (!examState || examState.submitted) return;
  const index = examState.currentIndex;
  const q = examState.questions[index];
  const answer = examState.answers[index];
  $("current-number").textContent = String(index+1).padStart(2,"0");
  $("current-subject").textContent = q.subject.toUpperCase();
  $("question-topic").textContent = q.topic || q.chapter || "General";
  $("question-difficulty").textContent = q.difficulty || "Mixed";
  $("question-text").textContent = q.question;
  $("progress-fill").style.width = `${(index+1)/examState.questions.length*100}%`;
  $("options-list").innerHTML = ["A","B","C","D"].map(key => `
    <label class="option-item ${answer.selected===key?"selected":""}">
      <input type="radio" name="question-answer" value="${key}" ${answer.selected===key?"checked":""}>
      <span class="option-letter">${key}</span><span class="option-text">${escapeHtml(q.options[key])}</span>
    </label>`).join("");
  $("options-list").querySelectorAll('input[name="question-answer"]').forEach(input => {
    input.addEventListener("change", () => {
      answerQuestion(examState,index,input.value);
      renderQuestion();
    });
  });
  $("previous-button").disabled = index === 0;
  $("previous-button").style.opacity = index === 0 ? ".45" : "1";
  $("next-button").textContent = index === examState.questions.length-1 ? "Save & Finish →" : "Save & Next →";
  $("review-button").classList.toggle("active",answer.review);
  $("review-button").textContent = answer.review ? "★ Remove review" : "☆ Mark for review";
  renderPalette();
  updatePaletteSummary();
}
function renderPalette() {
  $("question-palette").innerHTML = examState.answers.map((answer,index) => {
    const status = getQuestionStatus(answer);
    return `<button type="button" class="palette-number ${status} ${index===examState.currentIndex?"current":""}" data-index="${index}" aria-label="Go to question ${index+1}, ${status}" aria-current="${index===examState.currentIndex?"step":"false"}">${index+1}</button>`;
  }).join("");
}
function updatePaletteSummary() {
  const answers = examState.answers;
  $("answered-count").textContent = answers.filter(a=>a.selected).length;
  $("unanswered-count").textContent = answers.filter(a=>!a.selected).length;
  $("review-count").textContent = answers.filter(a=>a.review).length;
  $("palette-position").textContent = `Question ${examState.currentIndex+1} of ${answers.length}`;
}
function moveTo(index) {
  visitQuestion(examState,index);
  renderQuestion();
}
function openSubmitModal() {
  if (!examState || examState.submitted) return;
  const answers = examState.answers;
  const answered = answers.filter(a=>a.selected).length;
  const unanswered = answers.length-answered;
  const review = answers.filter(a=>a.review).length;
  $("modal-answered").textContent = answered;
  $("modal-unanswered").textContent = unanswered;
  $("modal-review").textContent = review;
  $("modal-warning").textContent = unanswered
    ? `You have ${unanswered} unanswered question${unanswered===1?"":"s"}. Marked-for-review questions may also contain saved answers. You can return to the test or submit now.`
    : "All questions have an answer. Confirm when you are ready to finish.";
  $("submit-modal").classList.remove("hidden");
  $("modal-confirm").focus();
}
function closeSubmitModal() {
  $("submit-modal").classList.add("hidden");
}
async function finalizeExam(autoSubmitted = false) {
  if (!examState || examState.submitted || submitInProgress) return;
  submitInProgress = true;
  examState.submitted = true;
  closeSubmitModal();
  if (timer) timer.stop();
  const elapsed = autoSubmitted ? durationSeconds : Math.min(durationSeconds, Math.floor((Date.now()-examStartedAt)/1000));
  const metrics = calculateResults(examState.questions,examState.answers,durationSeconds,elapsed,autoSubmitted);
  const submittedAt = new Date();
  const submissionId = createId();
  const account = getCurrentAccount();
  const publishConsent = $("publish-score-consent").checked;
  const displayName = $("leaderboard-name").value.trim();
  const result = {
    id:submissionId,
    testId:examTestId,
    userId:account?.id || null,
    guestId:null,
    paperId:examContext.paperId,
    paper:examContext.paper,
    examName:$("exam-title").textContent,
    selectedCategories:examContext.categories,
    selectedDatasets:examContext.datasets,
    selectedTopics:examContext.topics,
    difficulty:examContext.difficulty,
    totalQuestions:metrics.total,
    correctAnswers:metrics.correct,
    incorrectAnswers:metrics.wrong,
    unansweredQuestions:metrics.unanswered,
    totalScore:metrics.score,
    accuracyPercentage:metrics.accuracy,
    timeTakenSeconds:metrics.elapsedSeconds,
    submittedAt:submittedAt.toISOString(),
    leaderboard:{ consented:publishConsent, published:false, name:displayName },
    metrics,
    questions:examState.questions,
    answers:examState.answers.map(answer => ({ selected:answer.selected }))
  };
  let localSaved = false;
  try {
    if (!result.userId) result.guestId = resultsStore.ensureGuestId();
    resultsStore.saveResult(result);
    localSaved = true;
    setResultUrl(result.id);
    renderLocalHistory();
  } catch (error) {
    $("local-save-status").textContent = `This result could not be saved locally: ${error.message}`;
    $("local-save-status").classList.add("error-message");
  }
  renderResults({
    questions:examState.questions,
    answers:examState.answers,
    metrics,
    examName:$("exam-title").textContent,
    submittedAt,
    onNewTest:resetToSetup
  });
  $("local-save-status").textContent = localSaved
    ? "Saved on this device. Export a backup to keep a copy or move your history to another browser."
    : $("local-save-status").textContent;
  $("local-save-status").classList.toggle("error-message", !localSaved);
  showView("result");
  if (!publishConsent) {
    $("score-publish-status").textContent = "Private result. Saved in My Test History on this device; nothing was published.";
    $("score-publish-status").classList.remove("error-message");
    $("retry-publish").classList.add("hidden");
    submitInProgress = false;
    return;
  }
  $("score-publish-status").textContent = "You opted in to publish this result. Publishing now…";
  const published = await publishScore({
    id:submissionId,
    score:metrics.score,
    maximum:metrics.maximum,
    scorePercentage:metrics.scorePercentage,
    paper:examContext.paper,
    subjects:examContext.subjects,
    ownerKey:result.userId ? null : result.guestId
  });
  if (published) {
    try {
      resultsStore.updateLeaderboard(submissionId, {
        consented:true,
        published:true,
        name:published.name
      });
      renderLocalHistory();
      $("local-save-status").textContent = "Saved on this device. You can rename or remove its public leaderboard entry from My Test History.";
    } catch (error) {
      $("local-data-status").textContent = `The published score could not be linked to local history: ${error.message}`;
      $("local-data-status").classList.add("error-message");
    }
  }
  submitInProgress = false;
}
function resetToSetup() {
  if (timer) timer.stop();
  timer = null;
  examState = null;
  examTestId = null;
  $("publish-score-consent").checked = false;
  closeSubmitModal();
  setResultUrl(null);
  showSetupStep(1);
  showView("setup");
  updateAvailability();
}

$("setup-form").addEventListener("submit",startExam);
$("paper-select").addEventListener("change",updatePaperOptions);
handleSelectionChange($("category-options"),renderDatasets);
handleSelectionChange($("dataset-options"),updateTopics);
handleSelectionChange($("topic-options"),updateAvailability);
document.querySelectorAll("[data-next-step]").forEach(button=>button.addEventListener("click",()=>{
  const nextStep = Number(button.dataset.nextStep);
  $("setup-error").textContent = "";
  if (nextStep === 2 && !selectedCategories().length) {
    $("setup-error").textContent = "Choose at least one category or subject.";
    return;
  }
  if (nextStep === 3 && !selectedDatasets().length) {
    $("setup-error").textContent = "Choose at least one question dataset.";
    return;
  }
  if (nextStep === 4) {
    const count = getSelectedCount();
    const duration = Number($("duration-input").value);
    if (!Number.isInteger(count) || count < 1 || count > 1000) {
      $("setup-error").textContent = "Enter a question count between 1 and 1,000.";
      return;
    }
    if (!Number.isInteger(duration) || duration < 1 || duration > 600) {
      $("setup-error").textContent = "Enter a duration between 1 and 600 minutes.";
      return;
    }
    const matches = filterQuestions(bank.questions,currentFilters()).length;
    if (matches < count) {
      $("setup-error").textContent = `Only ${matches} matching questions are available. Select fewer questions or broaden the filters.`;
      return;
    }
  }
  showSetupStep(nextStep);
}));
document.querySelectorAll("[data-previous-step]").forEach(button=>button.addEventListener("click",()=>{
  showSetupStep(Number(button.dataset.previousStep));
}));
["difficulty-select","count-input","duration-input"].forEach(id=>$(id).addEventListener("input",updateAvailability));
$("previous-button").addEventListener("click",()=>{if(examState.currentIndex>0)moveTo(examState.currentIndex-1)});
$("next-button").addEventListener("click",()=>{
  if(examState.currentIndex<examState.questions.length-1) moveTo(examState.currentIndex+1);
  else openSubmitModal();
});
$("review-button").addEventListener("click",()=>{toggleReview(examState,examState.currentIndex);renderQuestion()});
$("clear-button").addEventListener("click",()=>{clearAnswer(examState,examState.currentIndex);renderQuestion();toast("Response cleared.")});
$("question-palette").addEventListener("click",event=>{
  const button=event.target.closest("[data-index]");
  if(button) moveTo(Number(button.dataset.index));
});
$("palette-review-filter").addEventListener("click",()=>{
  const next=examState.answers.findIndex((a,i)=>i>examState.currentIndex&&a.review);
  const first=examState.answers.findIndex(a=>a.review);
  const target=next>=0?next:first;
  if(target>=0)moveTo(target);else toast("No questions marked for review.");
});
["submit-top","submit-side"].forEach(id=>$(id).addEventListener("click",openSubmitModal));
$("modal-close").addEventListener("click",closeSubmitModal);
$("modal-return").addEventListener("click",closeSubmitModal);
$("submit-modal").addEventListener("click",event=>{if(event.target===$("submit-modal"))closeSubmitModal()});
$("modal-confirm").addEventListener("click",()=>{
  if(window.confirm("Final confirmation: submit this test and lock all answers?")) finalizeExam(false);
});
$("palette-toggle").addEventListener("click",()=>{
  const panel=$("palette-toggle").closest(".palette-panel");
  const collapsed=panel.classList.toggle("collapsed");
  $("palette-toggle").setAttribute("aria-expanded",String(!collapsed));
  $("palette-toggle").textContent=collapsed?"⌄":"⌃";
});
$("print-button").addEventListener("click",()=>window.print());
$("local-test-history").addEventListener("click", event => {
  const actionButton = event.target.closest("[data-score-action]");
  if (actionButton) {
    const result = resultsStore.getData().results.find(item => item.id === actionButton.dataset.resultId);
    if (!result?.leaderboard?.published) return;
    const action = actionButton.dataset.scoreAction;
    const nameInput = actionButton.closest(".local-history-entry").querySelector("[data-public-name]");
    if (action === "remove" && !window.confirm("Remove this score from the public leaderboard? Your private test history will remain saved.")) return;
    actionButton.disabled = true;
    managePublishedScore({
      id:result.id,
      action,
      name:nameInput?.value.trim(),
      ownerKey:result.userId ? null : result.guestId
    }).then(score => {
      resultsStore.updateLeaderboard(result.id, {
        consented:true,
        published:action !== "remove",
        name:action === "remove" ? result.leaderboard.name : score.name
      });
      renderLocalHistory();
      $("local-data-status").textContent = action === "remove"
        ? "The score was removed from the public leaderboard. Your private result remains saved."
        : "The public display name was updated.";
      $("local-data-status").classList.remove("error-message");
    }).catch(error => {
      $("local-data-status").textContent = `The public score could not be updated: ${error.message}`;
      $("local-data-status").classList.add("error-message");
      actionButton.disabled = false;
    });
    return;
  }
  const button = event.target.closest("[data-result-id]");
  if (button) showSavedResult(button.dataset.resultId);
});
$("export-local-data").addEventListener("click",downloadLocalData);
$("import-local-data").addEventListener("click",()=>$("local-data-file").click());
$("local-data-file").addEventListener("change",event=>{
  const [file] = event.target.files;
  if (file) importLocalData(file);
  event.target.value = "";
});
$("theme-toggle").addEventListener("click",()=>{
  document.body.classList.toggle("dark");
  $("theme-toggle").setAttribute("aria-pressed",String(document.body.classList.contains("dark")));
});
$("brand-home").addEventListener("click",event=>{
  if(!views.exam.classList.contains("hidden")){event.preventDefault();toast("Submit or finish the current test before leaving.");}
});
document.addEventListener("keydown",event=>{
  if(views.exam.classList.contains("hidden")||!examState||examState.submitted||!$("submit-modal").classList.contains("hidden"))return;
  if(event.altKey||event.ctrlKey||event.metaKey)return;
  if(event.key==="ArrowLeft"&&examState.currentIndex>0)moveTo(examState.currentIndex-1);
  if(event.key==="ArrowRight"&&examState.currentIndex<examState.questions.length-1)moveTo(examState.currentIndex+1);
  if(["a","b","c","d","A","B","C","D"].includes(event.key)){
    const key=event.key.toUpperCase();
    answerQuestion(examState,examState.currentIndex,key);
    renderQuestion();
  }
});
window.addEventListener("beforeunload",event=>{
  if(examState&&!examState.submitted){event.preventDefault();event.returnValue="Your active test will be lost if you leave this page.";}
});

initialize();
renderLocalHistory();
restoreResultFromUrl();
initializeCommunityChat();
initializeAccounts().catch(error => {
  $("account-message").textContent = `Account and leaderboard service is unavailable: ${error.message}`;
  $("account-message").classList.add("error-message");
}).finally(renderLocalHistory);
window.addEventListener("popstate",restoreResultFromUrl);
