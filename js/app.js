import { loadQuestionBank, filterQuestions, selectRandomQuestions } from "./questions.js";
import { createExamState, getQuestionStatus, answerQuestion, visitQuestion, toggleReview, clearAnswer } from "./exam.js";
import { createTimer, formatTime } from "./timer.js";
import { calculateResults } from "./scoring.js";
import { renderResults } from "./results.js";
import { initializeAccounts, initializeCommunityChat, publishScore } from "./accounts.js";

const $ = id => document.getElementById(id);
const views = { setup:$("setup-view"), exam:$("exam-view"), result:$("result-view") };
let bank = null;
let examState = null;
let timer = null;
let durationSeconds = 0;
let examStartedAt = null;
let submitInProgress = false;
let examContext = null;
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
    examContext = {
      paper:$("paper-select").value === "general-knowledge"
        ? "General Knowledge"
        : "General Kannada, English & Computer Knowledge",
      subjects:[...new Set(selected.map(question => question.subject))]
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
  renderResults({
    questions:examState.questions,
    answers:examState.answers,
    metrics,
    examName:$("exam-title").textContent,
    submittedAt:new Date(),
    onNewTest:resetToSetup
  });
  showView("result");
  await publishScore({
    score:metrics.score,
    maximum:metrics.maximum,
    scorePercentage:metrics.scorePercentage,
    paper:examContext.paper,
    subjects:examContext.subjects
  });
  submitInProgress = false;
}
function resetToSetup() {
  if (timer) timer.stop();
  timer = null;
  examState = null;
  closeSubmitModal();
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
initializeCommunityChat();
initializeAccounts().catch(error => {
  $("account-message").textContent = `Account and leaderboard service is unavailable: ${error.message}`;
  $("account-message").classList.add("error-message");
});
