const $ = (id) => document.getElementById(id);

function send(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, resolve);
  });
}

function showMessage(message) {
  $("message").textContent = message;
}

function render(data) {
  const session = data.session || {};

  $("status").textContent = session.active
    ? "Collecting"
    : "Ready";

  $("processed").textContent = session.processed || 0;
  $("saved").textContent = session.saved || 0;
  $("duplicates").textContent = session.duplicates || 0;
  $("filtered").textContent = session.filtered || 0;

  $("start").disabled = Boolean(session.active);
  $("stop").disabled = !session.active;
}

async function refresh() {
  const result = await send({ type: "GET_STATE" });

  if (result?.ok) {
    render(result);
  }
}

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
  showMessage("Stopping and exporting...");

  const result = await send({ 
    type: "STOP",
    format: getExportFormat()
  });

  await refresh();

  showMessage(
    result?.ok
      ? `Exported ${result.count} unique leads. Check Downloads folder.`
      : `Export failed: ${result?.error || "Unknown error"}. Try Export All Saved Leads.`
  );
  $("stop").disabled = false;
});

$("export").addEventListener("click", async () => {
  showMessage("Exporting all saved leads...");
  const result = await send({ 
    type: "EXPORT_ALL",
    format: getExportFormat()
  });

  showMessage(
    result?.ok
      ? `Exported ${result.count} unique leads. Check Downloads folder.`
      : `Export failed: ${result?.error || "Unknown error"}`
  );
});

$("clear").addEventListener("click", async () => {
  if (!confirm("Delete ALL saved leads and reset counters? This cannot be undone.")) {
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