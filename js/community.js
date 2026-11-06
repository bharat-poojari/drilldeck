let pendingScore = null;
const MUTED_NAMES_KEY = "drilldeck.community-muted-names.v1";
let cachedCommunityMessages = [];

const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character =>
  ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[character])
);

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials:"same-origin",
    cache:"no-store",
    ...options,
    headers:{ "Content-Type":"application/json", ...(options.headers || {}) }
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

function formatScore(item) {
  return `${Number(item.score).toFixed(2)} / ${Number(item.maximum).toFixed(2)} · ${Number(item.scorePercentage).toFixed(1)}%`;
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
      <span class="score-name">${escapeHtml(item.name)}<small>${escapeHtml(item.paper)} · ${escapeHtml((item.subjects || []).join(", "))}${Number.isFinite(item.accuracyPercentage) ? ` · ${Number(item.accuracyPercentage).toFixed(0)}% accuracy` : ""}${Number.isInteger(item.attempted) ? ` · ${item.attempted}/${item.totalQuestions} attempted` : ""}</small></span>
      <strong class="score-value-small">${escapeHtml(formatScore(item))}</strong>
    </li>`).join("")}</ol>`;
}

function currentLeaderboardFilters() {
  const filters = {};
  const activeView = document.querySelector(".view:not(.hidden)");
  for (const select of document.querySelectorAll("[data-leaderboard-filter]")) {
    if (activeView && select.closest(".view") !== activeView) continue;
    filters[select.dataset.leaderboardFilter] = select.value;
  }
  return filters;
}

export async function refreshLeaderboard(filters = currentLeaderboardFilters()) {
  try {
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    const queryString = query.toString();
    const suffix = queryString ? `?${queryString}` : "";
    const { scores } = await requestJson(`/api/leaderboard${suffix}`);
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
  const mutedNames = readMutedNames();
  const visibleMessages = messages.filter(message => !mutedNames.has(message.name.trim().toLocaleLowerCase()));
  $("unmute-community-button").classList.toggle("hidden", mutedNames.size === 0);
  if (!visibleMessages.length && messages.length) {
    container.innerHTML = '<p class="empty-datasets">All current messages are muted on this device.</p>';
    return;
  }
  if (!visibleMessages.length) {
    container.innerHTML = '<p class="empty-datasets">No messages yet. Start the conversation.</p>';
    return;
  }
  container.innerHTML = [...visibleMessages].reverse().map(message => {
    const reportBody = encodeURIComponent(`Please review community message ${message.id}.`);
    return `
    <article class="community-message">
      <div class="community-message-heading"><strong>${escapeHtml(message.name)}</strong><time datetime="${escapeHtml(message.createdAt)}">${escapeHtml(new Date(message.createdAt).toLocaleString())}</time></div>
      <p>${escapeHtml(message.message)}</p>
      <div class="community-message-actions">
        <button class="text-button" type="button" data-mute-name="${escapeHtml(message.name)}">Mute</button>
        <a class="text-button" href="mailto:bharatp0316@gmail.com?subject=DrillDeck%20community%20message%20report&amp;body=${reportBody}">Report</a>
      </div>
    </article>`;
  }).join("");
  container.scrollTop = container.scrollHeight;
}

function readMutedNames() {
  let value;
  try {
    value = window.localStorage.getItem(MUTED_NAMES_KEY);
  } catch (error) {
    throw new Error(`Muted names could not be read: ${error.message}`);
  }
  if (value === null) return new Set();
  try {
    const names = JSON.parse(value);
    if (!Array.isArray(names) || !names.every(name => typeof name === "string")) {
      throw new Error("Saved muted names have an invalid format.");
    }
    return new Set(names.map(name => name.trim().toLocaleLowerCase()).filter(Boolean));
  } catch (error) {
    throw new Error(`Muted names could not be loaded: ${error.message}`);
  }
}

function saveMutedNames(names) {
  try {
    window.localStorage.setItem(MUTED_NAMES_KEY, JSON.stringify([...names]));
  } catch (error) {
    throw new Error(`Muted names could not be saved: ${error.message}`);
  }
}

async function refreshCommunityMessages() {
  const { messages } = await requestJson("/api/chat");
  cachedCommunityMessages = messages;
  renderCommunityMessages(messages);
}

export function initializeCommunityChat() {
  const form = $("community-form");
  $("unmute-community-button").addEventListener("click", () => {
    try {
      saveMutedNames(new Set());
      renderCommunityMessages(cachedCommunityMessages);
      $("community-status").textContent = "Muted names cleared on this device.";
      $("community-status").classList.remove("error-message");
    } catch (error) {
      $("community-status").textContent = error.message;
      $("community-status").classList.add("error-message");
    }
  });
  $("community-messages").addEventListener("click", event => {
    const button = event.target.closest("[data-mute-name]");
    if (!button) return;
    try {
      const mutedNames = readMutedNames();
      mutedNames.add(button.dataset.muteName.trim().toLocaleLowerCase());
      saveMutedNames(mutedNames);
      renderCommunityMessages(cachedCommunityMessages);
      $("community-status").textContent = `${button.dataset.muteName} is muted on this device.`;
      $("community-status").classList.remove("error-message");
    } catch (error) {
      $("community-status").textContent = error.message;
      $("community-status").classList.add("error-message");
    }
  });
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

async function sendPendingScore() {
  if (!pendingScore) return null;
  const status = $("score-publish-status");
  status.textContent = "Publishing this score to the global leaderboard…";
  status.classList.remove("error-message");
  try {
    const { score } = await requestJson("/api/leaderboard", {
      method:"POST",
      body:JSON.stringify({ ...pendingScore, publishConsent:true })
    });
    pendingScore = null;
    $("retry-publish").classList.add("hidden");
    status.textContent = `Score published globally as ${score.name}.`;
    await refreshLeaderboard();
    return score;
  } catch (error) {
    status.textContent = `Score could not be published: ${error.message}. Your result is still available on this page.`;
    status.classList.add("error-message");
    $("retry-publish").classList.remove("hidden");
    return null;
  }
}

export function publishScore(score) {
  pendingScore = {
    ...score,
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
  return response.score || null;
}

export function initializeLeaderboard() {
  $("retry-publish").addEventListener("click", sendPendingScore);
  document.querySelectorAll("[data-leaderboard-filter]").forEach(select => {
    select.addEventListener("change", () => {
      document.querySelectorAll(`[data-leaderboard-filter="${select.dataset.leaderboardFilter}"]`)
        .forEach(mirror => { mirror.value = select.value; });
      refreshLeaderboard();
    });
  });
  refreshLeaderboard();
}
