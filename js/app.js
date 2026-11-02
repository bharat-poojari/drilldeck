import { loadQuestionBank, filterQuestions, selectRandomQuestions } from "./questions.js";
import { createExamState, getQuestionStatus, answerQuestion, visitQuestion, toggleReview, clearAnswer } from "./exam.js";
import { createTimer, formatTime } from "./timer.js";
import { calculateResults } from "./scoring.js";
import { renderResults } from "./results.js";
import { getCurrentAccount, initializeAccounts, initializeCommunityChat, managePublishedScore, publishScore } from "./accounts.js";
import { createResultsStore } from "./results-store.js";
import { createTopicSelection } from "./topic-selector.js";

const $ = id => document.getElementById(id);
const views = { home:$("home-view"), "quick-test":$("quick-test-view"), setup:$("setup-view"), exam:$("exam-view"), result:$("result-view") };
const resultsStore = createResultsStore({
  getItem:key => window.localStorage.getItem(key),
  setItem:(key, value) => window.localStorage.setItem(key, value)
});
const topicSelection = createTopicSelection();
const openTopicGroups = new Set();
const knownSubcategories = new Set();
const selectedSubcategories = new Set();
let bank = null;
let examState = null;
let timer = null;
let durationSeconds = 0;
let examStartedAt = null;
let submitInProgress = false;
let examContext = null;
let examTestId = null;
let toastTimeout = null;
let configurationCheckInProgress = false;
let currentSetupStep = 1;
const setupStepTitles = ["Choose your paper","Choose subcategories & topics","Set test preferences","Privacy & start"];
const setupStepIcons = [
  '<svg viewBox="0 0 24 24" fill="none"><path d="M4 5.5h16M4 12h16M4 18.5h16M8 3v5M15 9.5v5M10 16v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  '<svg viewBox="0 0 24 24" fill="none"><path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m4.5 7.8 7.5 4.3 7.5-4.3M12 12.2V21" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.64 5.64l1.42 1.42m9.88 9.88 1.42 1.42m0-12.72-1.42 1.42m-9.88 9.88-1.42 1.42" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.8"/></svg>',
  '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3 19 6v5c0 4.6-2.9 7.8-7 10-4.1-2.2-7-5.4-7-10V6l7-3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m9 12 2 2 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
];

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
  $("setup-step-icon").innerHTML = setupStepIcons[step-1];
  $("setup-error").textContent = "";
  if (step === 4) renderConfigurationReview();
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
  return topicSelection.getGroups()
    .map(group => group.parent)
    .filter(id => selectedSubcategories.has(id));
}
function currentFilters() {
  const configuration = currentTestConfiguration();
  return {
    paper:configuration.paper,
    categories:configuration.categories,
    datasets:configuration.datasets,
    topics:configuration.topics,
    topicsByDataset:configuration.topicsByDataset,
    difficulty:configuration.difficulty
  };
}
function currentTestConfiguration() {
  return {
    paper:$("paper-select").value,
    categories:selectedCategories(),
    datasets:selectedDatasets(),
    topics:topicSelection.getSelectedTopics(),
    topicsByDataset:topicSelection.getSelectedTopicsByGroup(),
    difficulty:$("difficulty-select").value,
    questionCount:getSelectedCount(),
    durationMinutes:Number($("duration-input").value),
    markingScheme:{ correct:1, incorrect:-0.25, unanswered:0 }
  };
}
function getQuickTestConfiguration(type) {
  const paper = type === "gk" ? "general-knowledge" : "combined";
  const categories = type === "gk"
    ? [...new Set((bank?.datasets || []).filter(dataset => dataset.paper === paper).map(dataset => dataset.subject))]
    : [...document.querySelectorAll('input[name="quick-subject"]:checked')].map(input => input.value);
  const datasets = (bank?.datasets || []).filter(dataset =>
    dataset.paper === paper && categories.includes(dataset.subject)
  );
  const topicsByDataset = Object.fromEntries(datasets.map(dataset => [
    dataset.id,
    [...new Set(dataset.questions.map(question => question.topic).filter(Boolean))]
  ]));
  const topics = [...new Set(Object.values(topicsByDataset).flat())];
  return {
    paper,
    categories,
    datasets:datasets.map(dataset => dataset.id),
    topics,
    topicsByDataset,
    difficulty:"Mixed",
    questionCount:Number($(`quick-${type}-count`).value),
    durationMinutes:Number($(`quick-${type}-duration`).value),
    markingScheme:{ correct:1, incorrect:-0.25, unanswered:0 }
  };
}
function updateQuickAvailability(type) {
  const formType = type === "gk" ? "gk" : "combined";
  const configuration = getQuickTestConfiguration(formType);
  const validation = getConfigurationValidation(configuration);
  const status = $(`quick-${formType}-availability`);
  const button = document.querySelector(`[data-quick-submit="${formType}"]`);
  const marks = $(`quick-${formType}-marks`);
  marks.textContent = Number.isInteger(configuration.questionCount) && configuration.questionCount > 0
    ? String(configuration.questionCount)
    : "—";
  if (!bank) {
    status.textContent = "Question bank could not be loaded.";
    status.classList.add("error-message");
    button.disabled = true;
    return;
  }
  const missingSubjects = type === "combined"
    ? configuration.categories.filter(subject => !bank.datasets.some(dataset =>
      dataset.paper === "combined" && dataset.subject === subject
    ))
    : [];
  if (missingSubjects.length) {
    status.textContent = `No question sets are available for ${missingSubjects.join(", ")} yet.`;
    status.classList.add("error-message");
    button.disabled = true;
    return;
  }
  status.textContent = validation.valid
    ? `${validation.availableQuestions.toLocaleString()} questions available · ${configuration.questionCount} selected · ${configuration.questionCount} maximum marks`
    : validation.errors.join(" ");
  status.classList.toggle("error-message", !validation.valid);
  button.disabled = !validation.valid || configurationCheckInProgress;
}
function updateQuickTestAvailability() {
  updateQuickAvailability("gk");
  updateQuickAvailability("combined");
}
function getConfigurationValidation(configuration = currentTestConfiguration()) {
  const errors = [];
  if (!["general-knowledge", "combined"].includes(configuration.paper)) errors.push("Choose a valid exam paper.");
  if (!configuration.categories.length) errors.push("Choose at least one category or subject.");
  if (!configuration.datasets.length) errors.push("Choose at least one subcategory.");
  if (!configuration.topics.length) errors.push("Select at least one topic.");
  if (!["Easy", "Medium", "Hard", "Mixed"].includes(configuration.difficulty)) errors.push("Choose a valid difficulty.");
  if (!Number.isInteger(configuration.questionCount) || configuration.questionCount < 1 || configuration.questionCount > 1000) {
    errors.push("Enter a question count between 1 and 1,000.");
  }
  if (!Number.isInteger(configuration.durationMinutes) || configuration.durationMinutes < 1 || configuration.durationMinutes > 600) {
    errors.push("Enter a duration between 1 and 600 minutes.");
  }
  if (configuration.markingScheme.correct !== 1 ||
      configuration.markingScheme.incorrect !== -0.25 ||
      configuration.markingScheme.unanswered !== 0) {
    errors.push("The marking scheme is invalid.");
  }
  const availableQuestions = bank
    ? filterQuestions(bank.questions, configuration).length
    : 0;
  if (!errors.length && availableQuestions < configuration.questionCount) {
    errors.push(`Only ${availableQuestions} matching questions are available. Select fewer questions or broaden the filters.`);
  }
  return { valid:errors.length === 0, errors, availableQuestions };
}
function updateAvailability() {
  if (!bank) return;
  const configuration = currentTestConfiguration();
  const validation = getConfigurationValidation(configuration);
  $("availability-note").textContent = `${validation.availableQuestions} matching question${validation.availableQuestions===1?"":"s"} available · ${configuration.questionCount} requested`;
  $("availability-note").style.color = validation.valid ? "var(--muted)" : "var(--red)";
  $("start-button").disabled = !validation.valid || configurationCheckInProgress;
  if (currentSetupStep === 4) renderConfigurationReview(configuration, validation);
}
function renderDatasets() {
  updateTopics();
}
function updateTopics() {
  const categories = new Set(selectedCategories());
  const datasets = bank.datasets.filter(dataset =>
    dataset.paper === $("paper-select").value && categories.has(dataset.subject)
  );
  const availableIds = new Set(datasets.map(dataset => dataset.id));
  for (const id of selectedSubcategories) {
    if (!availableIds.has(id)) selectedSubcategories.delete(id);
  }
  datasets.forEach(dataset => {
    if (!knownSubcategories.has(dataset.id)) {
      selectedSubcategories.add(dataset.id);
      knownSubcategories.add(dataset.id);
    }
  });
  const groups = datasets.map(dataset => ({
    parent:dataset.id,
    topics:bank.questions
      .filter(question => question.datasetId === dataset.id)
      .map(question => question.topic)
  }));
  topicSelection.setGroups(groups);
  renderTopicGroups();
  updateAvailability();
}
function renderTopicGroups() {
  const container = $("topic-groups");
  const search = $("topic-search").value;
  const hasSearch = Boolean(search.trim());
  const groups = topicSelection.getGroups(search);
  const allGroups = topicSelection.getGroups();
  if (!hasSearch && groups.length && ![...openTopicGroups].some(parent => groups.some(group => group.parent === parent))) {
    openTopicGroups.add(groups[0].parent);
  }
  container.innerHTML = groups.length
    ? groups.map(group => {
      const allTopics = allGroups.find(item => item.parent === group.parent).topics;
      const dataset = bank.datasets.find(item => item.id === group.parent);
      const selectedCount = allTopics.filter(topic => topicSelection.isSelected(topic, group.parent)).length;
      const checked = selectedCount === allTopics.length;
      const indeterminate = selectedCount > 0 && !checked;
      const isOpen = hasSearch || openTopicGroups.has(group.parent);
      return `<details class="topic-group" data-topic-group-panel="${escapeHtml(group.parent)}" ${isOpen ? "open" : ""}>
        <summary>
          <span class="topic-group-title">${escapeHtml(dataset?.title || group.parent)}</span>
          <span class="topic-group-count">Subcategory · ${escapeHtml([dataset?.subject, dataset?.subcategory].filter(Boolean).join(" / "))} · ${allTopics.length} ${allTopics.length === 1 ? "topic" : "topics"}</span>
          <input type="checkbox" data-subcategory="${escapeHtml(group.parent)}" aria-label="Select all topics in ${escapeHtml(dataset?.title || group.parent)}" ${checked ? "checked" : ""} ${indeterminate ? "data-indeterminate" : ""}>
        </summary>
        <div class="topic-group-options"><p class="topic-group-label">Topics in this subcategory</p>${group.topics.map(topic => `
          <label class="selection-option topic-option">
            <input type="checkbox" data-topic-name="${escapeHtml(topic)}" data-topic-parent="${escapeHtml(group.parent)}" ${topicSelection.isSelected(topic, group.parent) ? "checked" : ""}>
            <span>${escapeHtml(topic)}</span>
          </label>`).join("")}
        </div>
      </details>`;
    }).join("")
    : `<p class="empty-datasets">${hasSearch
      ? `No topics match “${escapeHtml(search)}”. Try another search.`
      : "No subcategories available. Choose a category or subject in Step 1."}</p>`;
  container.querySelectorAll("[data-subcategory]").forEach(input => {
    input.indeterminate = input.hasAttribute("data-indeterminate");
  });
  $("topic-selected-count").textContent =
    `${topicSelection.selectedCount()} topic${topicSelection.selectedCount() === 1 ? "" : "s"} selected`;
  $("topic-select-all").disabled = allGroups.length === 0;
  $("topic-clear").disabled = topicSelection.selectedCount() === 0;
}
function syncTopicSelection() {
  $("topic-groups").querySelectorAll("[data-topic-name]").forEach(input => {
    input.checked = topicSelection.isSelected(input.dataset.topicName, input.dataset.topicParent);
  });
  $("topic-groups").querySelectorAll("[data-subcategory]").forEach(input => {
    const group = topicSelection.getGroups().find(item => item.parent === input.dataset.subcategory);
    if (!group) return;
    const selectedCount = group.topics.filter(topic => topicSelection.isSelected(topic, group.parent)).length;
    input.checked = selectedCount === group.topics.length;
    input.indeterminate = selectedCount > 0 && !input.checked;
    if (selectedCount) selectedSubcategories.add(group.parent);
    else selectedSubcategories.delete(group.parent);
  });
  $("topic-selected-count").textContent =
    `${topicSelection.selectedCount()} topic${topicSelection.selectedCount() === 1 ? "" : "s"} selected`;
  $("topic-clear").disabled = topicSelection.selectedCount() === 0;
  updateAvailability();
}
function renderConfigurationReview(configuration = currentTestConfiguration(), validation = getConfigurationValidation(configuration)) {
  const paperName = configuration.paper === "general-knowledge"
    ? "General Knowledge"
    : "General Kannada, English & Computer Knowledge";
  const selectedDatasets = bank
    ? bank.datasets.filter(dataset => configuration.datasets.includes(dataset.id))
    : [];
  $("review-paper").textContent = paperName;
  $("review-datasets").innerHTML = selectedDatasets.length
    ? selectedDatasets.map(dataset => `
      <li><strong>${escapeHtml(dataset.title)}</strong><small>${escapeHtml([dataset.subject, dataset.subcategory].filter(Boolean).join(" / "))}</small></li>`
    ).join("")
    : "<li>No datasets selected</li>";
  $("review-topics").innerHTML = configuration.topics.length
    ? configuration.topics.map(topic => `<span class="review-topic-chip">${escapeHtml(topic)}</span>`).join("")
    : '<span class="review-empty">No topics selected</span>';
  $("review-difficulty").textContent = configuration.difficulty;
  $("review-question-count").textContent = `${configuration.questionCount} questions`;
  $("review-duration").textContent = `${configuration.durationMinutes} minutes`;
  $("review-maximum-score").textContent = String(configuration.questionCount);
  $("review-marking-maximum").textContent = `${configuration.questionCount} marks`;
  const availability = $("review-availability");
  availability.textContent = validation.valid
    ? `${validation.availableQuestions.toLocaleString()} matching questions available. Your test will contain ${configuration.questionCount} questions.`
    : validation.errors.join(" ");
  availability.classList.toggle("error-message", !validation.valid);
  $("start-button").disabled = !validation.valid || configurationCheckInProgress;
}
async function initialize() {
  try {
    bank = await loadQuestionBank();
    $("bank-count").textContent = bank.questions.length.toLocaleString();
    updatePaperOptions();
    updateQuickTestAvailability();
  } catch (error) {
    $("bank-count").textContent = "Error";
    $("availability-note").textContent = "Question bank could not be loaded.";
    $("setup-error").textContent = `${error.message} Rebuild the dataset index with "npm run build" after adding JSON files, and run the site through a local web server or Vercel.`;
    $("start-button").disabled = true;
    updateQuickTestAvailability();
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

function closeMainMenu() {
  $("main-nav").classList.remove("is-open");
  $("menu-toggle").setAttribute("aria-expanded", "false");
  $("menu-toggle").setAttribute("aria-label", "Open navigation menu");
}

async function validateConfigurationOnServer(configuration) {
  const response = await fetch("/api/configuration", {
    method:"POST",
    credentials:"same-origin",
    cache:"no-store",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify(configuration)
  });
  if (response.status === 501) {
    throw new Error("This server does not provide the configuration API. Run the app with `vercel dev` or deploy it to Vercel before starting a test.");
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`The configuration service returned an invalid response (${response.status}).`);
  }
  if (!response.ok) throw new Error(data.error || `Configuration validation failed (${response.status}).`);
  if (!data.configuration || !Number.isInteger(data.configuration.availableQuestions)) {
    throw new Error("The configuration service returned incomplete validation data.");
  }
  return data.configuration;
}

async function startExam(event, configuration = currentTestConfiguration(), button = $("start-button"), errorNode = $("setup-error")) {
  event.preventDefault();
  errorNode.textContent = "";
  if (!bank) {
    errorNode.textContent = "The question bank is still loading. Please try again in a moment.";
    return;
  }
  if (button === $("start-button") && currentSetupStep !== 4) return;
  if (configurationCheckInProgress) return;
  const validation = getConfigurationValidation(configuration);
  if (!validation.valid) {
    errorNode.textContent = validation.errors.join(" ");
    return;
  }
  const originalButtonContent = button.innerHTML;
  configurationCheckInProgress = true;
  button.disabled = true;
  button.textContent = "Validating configuration…";
  try {
    const serverConfiguration = await validateConfigurationOnServer(configuration);
    if (serverConfiguration.availableQuestions !== validation.availableQuestions) {
      throw new Error("The question bank changed since this configuration was reviewed. Return to your settings and try again.");
    }
    const count = configuration.questionCount;
    const duration = configuration.durationMinutes;
    const matching = filterQuestions(bank.questions, configuration);
    const selected = selectRandomQuestions(matching, count);
    examState = createExamState(selected);
    examTestId = createId();
    examContext = {
      paper:configuration.paper === "general-knowledge"
        ? "General Knowledge"
        : "General Kannada, English & Computer Knowledge",
      subjects:[...new Set(selected.map(question => question.subject))],
      paperId:configuration.paper,
      categories:configuration.categories,
      datasets:configuration.datasets,
      topics:configuration.topics,
      difficulty:configuration.difficulty
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
    errorNode.textContent = error.message;
  } finally {
    configurationCheckInProgress = false;
    button.innerHTML = originalButtonContent;
    if (!views.exam.classList.contains("hidden")) return;
    if (button === $("start-button")) updateAvailability();
    else updateQuickTestAvailability();
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
$("quick-gk-form").addEventListener("submit",event =>
  startExam(event, getQuickTestConfiguration("gk"), document.querySelector('[data-quick-submit="gk"]'), $("quick-gk-error"))
);
$("quick-combined-form").addEventListener("submit",event =>
  startExam(event, getQuickTestConfiguration("combined"), document.querySelector('[data-quick-submit="combined"]'), $("quick-combined-error"))
);
["quick-gk-count","quick-gk-duration","quick-combined-count","quick-combined-duration"].forEach(id =>
  $(id).addEventListener("input", updateQuickTestAvailability)
);
$("quick-combined-form").addEventListener("change",event=>{
  if(event.target.matches('input[name="quick-subject"]')) updateQuickAvailability("combined");
});
$("paper-select").addEventListener("change",updatePaperOptions);
handleSelectionChange($("category-options"),renderDatasets);
$("topic-search").addEventListener("input", renderTopicGroups);
$("topic-select-all").addEventListener("click", () => {
  topicSelection.selectAll();
  topicSelection.getGroups().forEach(group => selectedSubcategories.add(group.parent));
  syncTopicSelection();
});
$("topic-clear").addEventListener("click", () => {
  topicSelection.clear();
  selectedSubcategories.clear();
  syncTopicSelection();
});
$("topic-groups").addEventListener("click", event => {
  const subcategory = event.target.closest("[data-subcategory]");
  if (subcategory) event.stopPropagation();
}, true);
$("topic-groups").addEventListener("change", event => {
  const groupInput = event.target.closest("[data-subcategory]");
  const topicInput = event.target.closest("[data-topic-name]");
  if (groupInput) {
    const id = groupInput.dataset.subcategory;
    topicSelection.setGroupSelected(id, groupInput.checked);
    if (groupInput.checked) selectedSubcategories.add(id);
    else selectedSubcategories.delete(id);
  } else if (topicInput) {
    const id = topicInput.dataset.topicParent;
    topicSelection.setSelected(topicInput.dataset.topicName, topicInput.checked, id);
    const group = topicSelection.getGroups().find(item => item.parent === id);
    if (group.topics.some(topic => topicSelection.isSelected(topic, id))) selectedSubcategories.add(id);
    else selectedSubcategories.delete(id);
  }
  else return;
  syncTopicSelection();
});
$("topic-groups").addEventListener("toggle", event => {
  const group = event.target.closest("details[data-topic-group-panel]");
  if (!group) return;
  const parent = group.dataset.topicGroupPanel;
  if (!group.open) {
    openTopicGroups.delete(parent);
    return;
  }
  openTopicGroups.add(parent);
  if (window.matchMedia("(max-width: 560px)").matches) {
    $("topic-groups").querySelectorAll("details[open]").forEach(other => {
      if (other !== group) {
        openTopicGroups.delete(other.dataset.topicGroupPanel);
        other.open = false;
      }
    });
  }
}, true);
document.querySelectorAll("[data-next-step]").forEach(button=>button.addEventListener("click",()=>{
  const nextStep = Number(button.dataset.nextStep);
  $("setup-error").textContent = "";
  if (nextStep === 2 && !selectedCategories().length) {
    $("setup-error").textContent = "Choose at least one category or subject.";
    return;
  }
  if (nextStep === 3) {
    if (!selectedDatasets().length) {
      $("setup-error").textContent = "Choose at least one subcategory.";
      return;
    }
    if (!topicSelection.getSelectedTopics().length) {
      $("setup-error").textContent = "Select at least one topic.";
      return;
    }
  }
  if (nextStep === 4) {
    const validation = getConfigurationValidation();
    if (!validation.valid) {
      $("setup-error").textContent = validation.errors.join(" ");
      return;
    }
  }
  showSetupStep(nextStep);
}));
document.querySelectorAll("[data-previous-step]").forEach(button=>button.addEventListener("click",()=>{
  showSetupStep(Number(button.dataset.previousStep));
}));
document.querySelectorAll("[data-edit-step]").forEach(button=>button.addEventListener("click",()=>{
  showSetupStep(Number(button.dataset.editStep));
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
  event.preventDefault();
  if(!views.exam.classList.contains("hidden")){toast("Submit or finish the current test before leaving.");return;}
  showView("home");
});
$("menu-toggle").addEventListener("click",()=>{
  const open = $("main-nav").classList.toggle("is-open");
  $("menu-toggle").setAttribute("aria-expanded",String(open));
  $("menu-toggle").setAttribute("aria-label",open?"Close navigation menu":"Open navigation menu");
});
document.addEventListener("click",event=>{
  const link = event.target.closest("[data-menu-target]");
  if (!link) return;
  event.preventDefault();
  closeMainMenu();
  if (!views.exam.classList.contains("hidden")) {
    toast("Finish or submit the active test before navigating away.");
    return;
  }
  const target = link.dataset.menuTarget;
  if (target === "home" || target === "quick-test") {
    showView(target);
    return;
  }
  if (target === "about-dev") {
    showView("home");
    requestAnimationFrame(() => $("about-dev").scrollIntoView({ behavior:"smooth", block:"start" }));
    return;
  }
  if (target === "custom-test") {
    showView("setup");
    showSetupStep(1);
  }
});
document.addEventListener("keydown",event=>{
  if(event.key==="Escape") closeMainMenu();
});
document.addEventListener("click",event=>{
  if(!event.target.closest(".topbar")) closeMainMenu();
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
