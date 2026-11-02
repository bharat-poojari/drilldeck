let currentAccount = null;
let historyLoaded = false;
let pendingScore = null;

const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character =>
  ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[character])
);
const createSubmissionId = () => globalThis.crypto?.randomUUID
  ? globalThis.crypto.randomUUID()
  : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, character => {
    const value = Math.floor(Math.random() * 16);
    return (character === "x" ? value : (value & 3) | 8).toString(16);
  });

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
    headers: { "Content-Type":"application/json", ...(options.headers || {}) }
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`The server returned an invalid response (${response.status}).`);
  }
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

function showAccountMessage(message, isError = false) {
  const node = $("account-message");
  node.textContent = message;
  node.classList.toggle("error-message", isError);
}

function setAccountMode(mode) {
  const registering = mode === "register";
  $("account-form-login").classList.toggle("hidden", registering);
  $("account-form-register").classList.toggle("hidden", !registering);
  $("account-login-tab").classList.toggle("active", !registering);
  $("account-register-tab").classList.toggle("active", registering);
  $("account-login-tab").setAttribute("aria-selected", String(!registering));
  $("account-register-tab").setAttribute("aria-selected", String(registering));
  showAccountMessage("");
}

function formatScore(item) {
  return `${Number(item.score).toFixed(2)} / ${Number(item.maximum).toFixed(2)} · ${Number(item.scorePercentage).toFixed(1)}%`;
}

function renderHistory(history) {
  const container = $("account-history");
  if (!history.length) {
    container.innerHTML = '<p class="empty-datasets">No saved test scores yet. Your completed tests will appear here.</p>';
    return;
  }
  container.innerHTML = `<ol class="score-list">${history.slice(0,20).map(item => `
    <li class="score-entry account-score-entry">
      <span class="score-rank">${escapeHtml(new Date(item.createdAt).toLocaleDateString())}</span>
      <span class="score-name">${escapeHtml(item.paper)}<small>${escapeHtml((item.subjects || []).join(", "))}</small></span>
      <strong class="score-value-small">${escapeHtml(formatScore(item))}</strong>
      <div class="account-score-controls">
        <label class="sr-only" for="account-public-name-${escapeHtml(item.id)}">Public display name</label>
        <input id="account-public-name-${escapeHtml(item.id)}" data-account-public-name type="text" maxlength="60" value="${escapeHtml(item.name || currentAccount.name)}">
        <button class="button button-outline" type="button" data-account-score-action="rename" data-score-id="${escapeHtml(item.id)}">Save name</button>
        <button class="button button-outline" type="button" data-account-score-action="remove" data-score-id="${escapeHtml(item.id)}">Remove</button>
      </div>
    </li>`).join("")}</ol>`;
}

function renderLeaderboard(items, containerId) {
  const container = $(containerId);
  if (!items.length) {
    container.innerHTML = '<p class="empty-datasets">No scores have been published yet.</p>';
    return;
  }
  container.innerHTML = `<ol class="score-list">${items.slice(0,10).map(item => `
    <li class="score-entry">
      <span class="score-rank">#${Number(item.rank)}</span>
      <span class="score-name">${escapeHtml(item.name)}<small>${escapeHtml(item.paper)} · ${escapeHtml((item.subjects || []).join(", "))}</small></span>
      <strong class="score-value-small">${escapeHtml(formatScore(item))}</strong>
    </li>`).join("")}</ol>`;
}

async function refreshHistory() {
  if (!currentAccount) return;
  const { history } = await requestJson("/api/history");
  renderHistory(history);
  historyLoaded = true;
}

export async function refreshLeaderboard() {
  try {
    const { scores } = await requestJson("/api/leaderboard");
    renderLeaderboard(scores, "leaderboard-list");
    renderLeaderboard(scores, "result-leaderboard-list");
  } catch (error) {
    const message = `<p class="empty-datasets">Global scores are unavailable: ${escapeHtml(error.message)}</p>`;
    $("leaderboard-list").innerHTML = message;
    $("result-leaderboard-list").innerHTML = message;
  }
}

function renderCommunityMessages(messages) {
  const container = $("community-messages");
  if (!messages.length) {
    container.innerHTML = '<p class="empty-datasets">No messages yet. Start the conversation.</p>';
    return;
  }
  container.innerHTML = [...messages].reverse().map(message => `
    <article class="community-message">
      <div class="community-message-heading"><strong>${escapeHtml(message.name)}</strong><time datetime="${escapeHtml(message.createdAt)}">${escapeHtml(new Date(message.createdAt).toLocaleString())}</time></div>
      <p>${escapeHtml(message.message)}</p>
    </article>`).join("");
  container.scrollTop = container.scrollHeight;
}

async function refreshCommunityMessages() {
  const { messages } = await requestJson("/api/chat");
  renderCommunityMessages(messages);
}

export function initializeCommunityChat() {
  const form = $("community-form");
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    const status = $("community-status");
    submit.disabled = true;
    status.textContent = "Sending…";
    status.classList.remove("error-message");
    try {
      await requestJson("/api/chat", {
        method:"POST",
        body:JSON.stringify({
          name:$("community-name").value.trim(),
          message:$("community-message").value
        })
      });
      $("community-message").value = "";
      try {
        await refreshCommunityMessages();
        status.textContent = "Message shared with everyone.";
      } catch (error) {
        status.textContent = `Message sent, but chat could not be refreshed: ${error.message}`;
        status.classList.add("error-message");
      }
    } catch (error) {
      status.textContent = `Message could not be sent: ${error.message}`;
      status.classList.add("error-message");
    } finally {
      submit.disabled = false;
    }
  });

  refreshCommunityMessages().catch(error => {
    $("community-messages").innerHTML = `<p class="empty-datasets">Community chat is unavailable: ${escapeHtml(error.message)}</p>`;
  });
  window.setInterval(() => {
    if (document.visibilityState === "visible") {
      refreshCommunityMessages().catch(error => {
        $("community-status").textContent = `Could not refresh chat: ${error.message}`;
        $("community-status").classList.add("error-message");
      });
    }
  }, 30000);
}

function renderAccount() {
  const signedIn = Boolean(currentAccount);
  $("account-open").textContent = signedIn ? currentAccount.name : "Account (optional)";
  $("account-open").setAttribute("aria-label", signedIn ? `Account for ${currentAccount.name}` : "Sign in or create an optional account");
  $("account-auth-forms").classList.toggle("hidden", signedIn);
  $("account-signed-in").classList.toggle("hidden", !signedIn);
  $("leaderboard-name").disabled = false;
  $("leaderboard-name-label").textContent = "Public display name (optional)";
  $("leaderboard-name-help").textContent = "This name is used only if you choose to publish this result. You can change or remove a published score later.";
  if (signedIn) {
    $("account-profile-name").textContent = currentAccount.name;
    $("account-profile-email").textContent = currentAccount.email;
    $("leaderboard-name").value = currentAccount.name;
  } else if (!historyLoaded) {
    $("account-history").innerHTML = '<p class="empty-datasets">Sign in to see your previous scores.</p>';
  }
}

async function setCurrentAccount(account) {
  currentAccount = account;
  historyLoaded = false;
  renderAccount();
  if (!account) {
    $("account-history").innerHTML = '<p class="empty-datasets">Sign in to see your previous scores.</p>';
    return;
  }
  await refreshHistory();
}

function openAccountDialog() {
  $("account-dialog").classList.remove("hidden");
  $("account-dialog-close").focus();
  if (currentAccount) {
    refreshHistory().catch(error => showAccountMessage(`Could not load score history: ${error.message}`, true));
  }
}

function closeAccountDialog() {
  $("account-dialog").classList.add("hidden");
}

function bindAccountForm(formId, action) {
  $(formId).addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    showAccountMessage(action === "login" ? "Signing in…" : "Creating account…");
    const body = Object.fromEntries(new FormData(form).entries());
    try {
      const { account } = await requestJson("/api/account", {
        method:"POST",
        body:JSON.stringify({ ...body, action })
      });
      await setCurrentAccount(account);
      closeAccountDialog();
      form.reset();
    } catch (error) {
      showAccountMessage(error.message, true);
    } finally {
      submit.disabled = false;
    }
  });
}

export function getCurrentAccount() {
  return currentAccount;
}

async function sendPendingScore() {
  if (!pendingScore) return null;
  $("score-publish-status").textContent = "Publishing this score to the global list…";
  $("score-publish-status").classList.remove("error-message");
  try {
    const { score:published } = await requestJson("/api/leaderboard", {
      method:"POST",
      body:JSON.stringify({
        ...pendingScore,
        publishConsent:true
      })
    });
    pendingScore = null;
    $("retry-publish").classList.add("hidden");
    $("score-publish-status").textContent = currentAccount
      ? "Score published globally and saved to your account history."
      : `Score published globally as ${published.name}. Create an account to save your score history.`;
    await refreshLeaderboard();
    if (currentAccount) {
      try {
        await refreshHistory();
      } catch (error) {
        $("score-publish-status").textContent += ` Account history could not be refreshed: ${error.message}`;
      }
    }
    return published;
  } catch (error) {
    $("score-publish-status").textContent = `Score could not be published: ${error.message}. Your result is still available on this page.`;
    $("score-publish-status").classList.add("error-message");
    $("retry-publish").classList.remove("hidden");
    return null;
  }
}

export async function publishScore(score) {
  pendingScore = {
    ...score,
    id:score.id || createSubmissionId(),
    name:$("leaderboard-name").value.trim()
  };
  return sendPendingScore();
}

export async function managePublishedScore({ id, action, name, ownerKey }) {
  const options = action === "remove"
    ? { method:"DELETE", body:JSON.stringify({ id, ownerKey }) }
    : { method:"PATCH", body:JSON.stringify({ id, name, ownerKey }) };
  const response = await requestJson("/api/leaderboard", options);
  await refreshLeaderboard();
  if (currentAccount) {
    try {
      await refreshHistory();
    } catch (error) {
      showAccountMessage(`The public score changed, but account history could not be refreshed: ${error.message}`, true);
    }
  }
  return response.score || null;
}

export async function initializeAccounts() {
  $("account-open").addEventListener("click", openAccountDialog);
  $("account-dialog-close").addEventListener("click", closeAccountDialog);
  $("account-dialog").addEventListener("click", event => {
    if (event.target === $("account-dialog")) closeAccountDialog();
  });
  $("account-login-tab").addEventListener("click", () => setAccountMode("login"));
  $("account-register-tab").addEventListener("click", () => setAccountMode("register"));
  $("retry-publish").addEventListener("click", sendPendingScore);
  $("account-history").addEventListener("click", async event => {
    const button = event.target.closest("[data-account-score-action]");
    if (!button) return;
    if (button.dataset.accountScoreAction === "remove" &&
        !window.confirm("Remove this score from the public leaderboard?")) return;
    button.disabled = true;
    try {
      await managePublishedScore({
        id:button.dataset.scoreId,
        action:button.dataset.accountScoreAction,
        name:button.closest(".account-score-entry").querySelector("[data-account-public-name]").value.trim()
      });
    } catch (error) {
      showAccountMessage(`The public score could not be updated: ${error.message}`, true);
      button.disabled = false;
    }
  });
  $("account-signout").addEventListener("click", async () => {
    try {
      await requestJson("/api/account", { method:"DELETE" });
      await setCurrentAccount(null);
      showAccountMessage("You have signed out.");
    } catch (error) {
      showAccountMessage(`Could not sign out: ${error.message}`, true);
    }
  });
  bindAccountForm("account-form-login", "login");
  bindAccountForm("account-form-register", "register");
  setAccountMode("login");
  renderAccount();
  await Promise.all([
    requestJson("/api/account").then(({ account }) => setCurrentAccount(account)).catch(error => {
      showAccountMessage(`Account service is unavailable: ${error.message}`, true);
    }),
    refreshLeaderboard()
  ]);
}
