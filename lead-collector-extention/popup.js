const $ = (id) => document.getElementById(id);

function send(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, resolve);
  });
}

function showMessage(message) {
  $("message").textContent = message;
}

function showSettingsMessage(message) {
  $("settingsMessage").textContent = message;
}

function showSettings() {
  showSettingsMessage("");
  refreshOllamaKeyStatus();
  $("settingsDialog").showModal();
}

function hideSettings() {
  $("settingsDialog").close();
}

function render(data) {
  const session = data.session || {};

  $("status").textContent = session.active
    ? "Collecting"
    : "Ready";

  $("processed").textContent = session.processed || 0;
  $("saved").textContent = session.saved || 0;
  $("classificationPending").textContent = session.classificationPending || 0;
  $("duplicates").textContent = session.duplicates || 0;
  $("filtered").textContent = session.filtered || 0;
  $("classificationErrors").textContent = session.classificationErrors || 0;

  $("start").disabled = Boolean(session.active);
  $("stop").disabled = !session.active;
}

async function refreshOllamaKeyStatus() {
  const result = await send({ type: "GET_OLLAMA_SETTINGS" });
  if (!result?.ok) {
    $("ollamaKeyStatus").textContent = "Could not read Ollama settings.";
    return;
  }

  $("ollamaKeyStatus").textContent = result.configured
    ? "API key saved. All guard statuses are saved; Ollama also reviews uncertain cases."
    : "No key saved. All local guard statuses are saved for testing.";
  $("clearOllamaKey").disabled = !result.configured;
}

async function refresh() {
  const result = await send({ type: "GET_STATE" });

  if (result?.ok) {
    render(result);
  }
}

$("saveOllamaKey").addEventListener("click", async () => {
  const apiKey = $("ollamaApiKey").value.trim();
  if (!apiKey) {
    showSettingsMessage("Enter an API key before saving.");
    return;
  }

  $("saveOllamaKey").disabled = true;
  const result = await send({ type: "SAVE_OLLAMA_KEY", apiKey });
  $("saveOllamaKey").disabled = false;

  if (!result?.ok) {
    showSettingsMessage(`Could not save API key: ${result?.error || "Unknown error"}`);
    return;
  }

  $("ollamaApiKey").value = "";
  await refreshOllamaKeyStatus();
  showSettingsMessage("Ollama API key saved locally.");
});

$("clearOllamaKey").addEventListener("click", async () => {
  const result = await send({ type: "REMOVE_OLLAMA_KEY" });
  if (!result?.ok) {
    showSettingsMessage(`Could not remove API key: ${result?.error || "Unknown error"}`);
    return;
  }

  await refreshOllamaKeyStatus();
  showSettingsMessage("API key removed. New posts will keep all local guard statuses.");
});

$("openSettings").addEventListener("click", showSettings);
$("closeSettings").addEventListener("click", hideSettings);
$("settingsDialog").addEventListener("click", (event) => {
  if (event.target === $("settingsDialog")) {
    hideSettings();
  }
});

$("start").addEventListener("click", async () => {
  const locations = $("locations").value
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const keywords = $("keywords").value
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const result = await send({
    type: "START",
    locations,
    keywords
  });

  if (!result?.ok) {
    showMessage("Could not start collection.");
    return;
  }

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (tab?.url?.startsWith("https://www.linkedin.com/")) {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "SCAN_VISIBLE"
      });
    } catch {
      showMessage("Reload LinkedIn and try again.");
    }
  } else {
    showMessage("Open LinkedIn first, then start collection.");
  }

  await refresh();
  showMessage("Started. Review posts and scroll manually.");
});

function getExportFormat() {
  return $("exportFormat").value;
}

$("stop").addEventListener("click", async () => {
  $("stop").disabled = true;
  const result = await send({ type: "STOP" });

  await refresh();

  showMessage(
    result?.ok
      ? "Collection stopped. Use Export All Saved Leads when you are ready."
      : `Could not stop collection: ${result?.error || "Unknown error"}`
  );
  $("stop").disabled = false;
});

$("export").addEventListener("click", async () => {
  $("export").disabled = true;
  showMessage("Exporting finalized saved leads...");
  const result = await send({ 
    type: "EXPORT_ALL",
    format: getExportFormat()
  });

  showMessage(
    result?.ok
      ? `Exported ${result.count} saved leads. Check Downloads folder.`
      : `Export failed: ${result?.error || "Unknown error"}`
  );
  $("export").disabled = false;
});

$("clear").addEventListener("click", async () => {
  if (!confirm("Delete all saved leads, pending posts, and reset counters? This cannot be undone.")) {
    return;
  }
  $("clear").disabled = true;
  showMessage("Clearing all data...");

  const result = await send({ type: "CLEAR_ALL" });

  await refresh();

  showMessage(
    result?.ok
      ? "All data cleared."
      : "Clear failed."
  );
  $("clear").disabled = false;
});

$("resetFilters").addEventListener("click", () => {
  $("locations").value = "";
  $("keywords").value = "";
  showMessage("Filters cleared. Leave empty to disable filtering.");
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.hiringLeadRecords || changes.hiringLeadSession)) {
    refresh();
  }
  if (area === "local" && changes.hiringLeadOllamaApiKey) {
    refreshOllamaKeyStatus();
  }
});

// Periodic refresh as fallback (every 3 seconds when popup is open)
let refreshInterval;
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    refresh();
    refreshInterval = setInterval(refresh, 3000);
  } else {
    clearInterval(refreshInterval);
  }
});

// Initial refresh
refresh();
refreshOllamaKeyStatus();