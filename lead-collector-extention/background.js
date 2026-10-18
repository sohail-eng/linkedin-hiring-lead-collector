importScripts(
  "hiring-guard.js",
  "ollama-client.js",
  "post-processing.js",
  "lead-export.js"
);

const RECORDS_KEY = "hiringLeadRecords";
const PENDING_RECORDS_KEY = "hiringLeadPendingRecords";
const SESSION_KEY = "hiringLeadSession";
const LOGS_KEY = "hiringLeadLogs";
const OLLAMA_KEY_KEY = "hiringLeadOllamaApiKey";
const MAX_LOGS = 500;
let extractedPostsQueue = Promise.resolve();
let classificationQueue = Promise.resolve();
let classificationPendingWriteQueue = Promise.resolve();
let recordStateQueue = Promise.resolve();
const classificationTasksByKey = new Map();
let pendingClassifications = 0;

let storageAccessError;
const storageAccessReady = chrome.storage.local.setAccessLevel({
  accessLevel: "TRUSTED_CONTEXTS"
})
  .catch((error) => {
    storageAccessError = error;
    console.error("[Hiring Collector] Failed to restrict local storage access:", error);
  });

async function getState() {
  const data = await chrome.storage.local.get([
    RECORDS_KEY,
    SESSION_KEY
  ]);

  return {
    records: data[RECORDS_KEY] || [],
    session: data[SESSION_KEY] || {
      active: false,
      processed: 0,
      saved: 0,
      duplicates: 0,
      filtered: 0
    }
  };
}

async function getPendingRecords() {
  const data = await chrome.storage.local.get([PENDING_RECORDS_KEY]);
  return Array.isArray(data[PENDING_RECORDS_KEY])
    ? data[PENDING_RECORDS_KEY]
    : [];
}

function withRecordStateLock(operation) {
  const task = recordStateQueue.then(operation);
  recordStateQueue = task.then(() => undefined, () => undefined);
  return task;
}

function enqueuePostProcessing(incoming, classificationTasks) {
  return withRecordStateLock(() => processPost(incoming, classificationTasks));
}

async function migrateExistingRecords() {
  const settings = await chrome.storage.local.get([OLLAMA_KEY_KEY]);
  const apiKey = settings[OLLAMA_KEY_KEY];

  await withRecordStateLock(async () => {
    const state = await getState();
    const pendingRecords = await getPendingRecords();
    const pendingKeys = new Set(pendingRecords.map(getCompositeKey));

    for (const record of state.records) {
      if (!record.guard_decision) {
        const previousDecision = record.ollama_decision;
        const previousSource = record.classification_source;
        const previousRelevance = record.relevance;
        const previousReason = record.relevance_reason;
        applyLocalHiringGuard(record);
        if (previousSource === "ollama" && previousDecision) {
          record.ollama_decision = previousDecision;
          record.classification_source = previousSource;
          record.relevance = previousRelevance;
          record.relevance_reason = previousReason;
        }
      }

      if (record.guard_decision === "CONFUSE" && apiKey &&
          record.ollama_decision !== "KEEP" &&
          record.ollama_decision !== "DENY") {
        const key = getCompositeKey(record);
        if (!pendingKeys.has(key)) {
          pendingKeys.add(key);
          pendingRecords.push(record);
        }
      }
    }

    await chrome.storage.local.set({
      [RECORDS_KEY]: state.records,
      [PENDING_RECORDS_KEY]: pendingRecords
    });
  });

  return apiKey;
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await storageAccessReady;
  if (storageAccessError) {
    throw new Error("Could not secure extension storage access.");
  }
  const data = await chrome.storage.local.get([
    RECORDS_KEY,
    PENDING_RECORDS_KEY,
    SESSION_KEY
  ]);

  if (details.reason === "install") {
    await chrome.storage.local.set({
      [RECORDS_KEY]: Array.isArray(data[RECORDS_KEY]) ? data[RECORDS_KEY] : [],
      [PENDING_RECORDS_KEY]: Array.isArray(data[PENDING_RECORDS_KEY])
        ? data[PENDING_RECORDS_KEY]
        : []
    });
    if (!data[SESSION_KEY]) {
      await chrome.storage.local.set({
        [SESSION_KEY]: {
          active: false,
          processed: 0,
          saved: 0,
          duplicates: 0,
          filtered: 0
        }
      });
    }
    return;
  }

  if (details.reason === "update") {
    const apiKey = await migrateExistingRecords();
    if (apiKey) {
      retryPendingClassifications(apiKey).catch((error) => {
        console.error("[Hiring Collector] Could not retry pending Ollama classifications:", error);
      });
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handleMessage = async () => {
    await storageAccessReady;
    if (storageAccessError) {
      throw new Error("Could not secure extension storage access.");
    }
    switch (message.type) {
      case "GET_STATE": {
        const state = await getState();
        console.log("[Hiring Collector] BG GET_STATE:", {
          sessionActive: state.session?.active,
          recordsCount: state.records?.length,
          sessionKeys: state.session ? Object.keys(state.session) : null
        });
        return { ok: true, ...state };
      }

      case "START": {
        const state = await getState();
        const locations = Array.isArray(message.locations) ? message.locations : [];
        const keywords = Array.isArray(message.keywords) ? message.keywords : [];
        const session = {
          active: true,
          startedAt: new Date().toISOString(),
          locations,
          keywords,
          processed: 0,
          saved: 0,
          duplicates: 0,
          filtered: 0,
          classificationErrors: 0
        };

        try {
          await chrome.storage.local.set({ [SESSION_KEY]: session });
        } catch (error) {
          console.error("[Hiring Collector] Failed to start collection:", error);
          return { ok: false, error: String(error) };
        }

        const settings = await chrome.storage.local.get([OLLAMA_KEY_KEY]);
        if (settings[OLLAMA_KEY_KEY]) {
          retryPendingClassifications(settings[OLLAMA_KEY_KEY]).catch((error) => {
            console.error("[Hiring Collector] Could not retry pending Ollama classifications:", error);
          });
        }

        return {
          ok: true,
          session,
          existingRecords: state.records.length
        };
      }

      case "STOP": {
        await extractedPostsQueue;
        const state = await getState();
        state.session.active = false;
        state.session.stoppedAt = new Date().toISOString();
        await chrome.storage.local.set({ [SESSION_KEY]: state.session });
        return { ok: true };
      }

      case "EXPORT_ALL": {
        const records = await getRecordsForExport();
        const format = message.format || "csv";
        const count = format === "json"
          ? await exportJson(records)
          : await exportCsv(records);
        return { ok: true, count };
      }

      case "CLEAR_ALL": {
        await chrome.storage.local.set({
          [RECORDS_KEY]: [],
          [PENDING_RECORDS_KEY]: [],
          [SESSION_KEY]: {
            active: false,
            processed: 0,
            saved: 0,
            duplicates: 0,
            filtered: 0,
            classificationErrors: 0
          }
        });
        return { ok: true };
      }

      case "GET_OLLAMA_SETTINGS": {
        const settings = await chrome.storage.local.get([OLLAMA_KEY_KEY]);
        return { ok: true, configured: Boolean(settings[OLLAMA_KEY_KEY]) };
      }

      case "SAVE_OLLAMA_KEY": {
        const apiKey = typeof message.apiKey === "string"
          ? message.apiKey.trim()
          : "";
        if (!apiKey) {
          return { ok: false, error: "API key cannot be empty." };
        }
        await chrome.storage.local.set({ [OLLAMA_KEY_KEY]: apiKey });
        retryPendingClassifications(apiKey).catch((error) => {
          console.error("[Hiring Collector] Could not retry pending Ollama classifications:", error);
        });
        return { ok: true };
      }

      case "REMOVE_OLLAMA_KEY": {
        await chrome.storage.local.remove([OLLAMA_KEY_KEY]);
        return { ok: true };
      }

      case "EXTRACTED_POST": {
        const classificationTasks = [];
        const result = await enqueuePostProcessing(
          message.record || {},
          classificationTasks
        );
        const [classificationResult] = await Promise.all(classificationTasks);
        const { classificationTaskIndex, ...postResult } = result;
        return { ok: true, ...postResult, ...classificationResult };
      }

      case "EXTRACTED_POSTS_BATCH": {
        const records = message.records || [];
        const classificationTasks = [];
        const processing = extractedPostsQueue.then(async () => {
          const results = [];
          for (const record of records) {
            results.push(await enqueuePostProcessing(record, classificationTasks));
          }
          return { ok: true, results };
        });
        extractedPostsQueue = processing.then(() => undefined, () => undefined);
        const result = await processing;
        const classificationResults = await Promise.all(classificationTasks);
        result.results = result.results.map((postResult) => {
          const { classificationTaskIndex, ...publicResult } = postResult;
          if (!Number.isInteger(classificationTaskIndex)) {
            return publicResult;
          }
          return {
            ...publicResult,
            ...classificationResults[classificationTaskIndex]
          };
        });
        return result;
      }

      case "LOG": {
        const entry = message.entry;
        if (entry) {
          const data = await chrome.storage.local.get([LOGS_KEY]);
          const logs = data[LOGS_KEY] || [];
          logs.push(entry);
          if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
          await chrome.storage.local.set({ [LOGS_KEY]: logs });
        }
        return { ok: true };
      }

      case "GET_LOGS": {
        const data = await chrome.storage.local.get([LOGS_KEY]);
        return { ok: true, logs: data[LOGS_KEY] || [] };
      }

      case "CLEAR_LOGS": {
        await chrome.storage.local.set({ [LOGS_KEY]: [] });
        return { ok: true };
      }

      case "DEBUG_RECORDS": {
        const state = await getState();
        return { ok: true, records: state.records, session: state.session };
      }

      default:
        return {
          ok: false,
          error: "Unknown message type"
        };
    }
  };

  handleMessage()
    .then(sendResponse)
    .catch((error) => {
      sendResponse({
        ok: false,
        error: String(error)
      });
    });

  return true;
});

self.addEventListener("error", (event) => {
  console.error("[Hiring Collector] Background script error:", event.error);
});

self.addEventListener("unhandledrejection", (event) => {
  console.error("[Hiring Collector] Background unhandled rejection:", event.reason);
  event.preventDefault();
});
