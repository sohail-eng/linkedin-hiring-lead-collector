"use strict";

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function getFingerprint(record) {
  return normalizeText(record.description);
}

function getCompositeKey(record) {
  const url = normalizeUrl(record.post_url);
  const author = normalizeText(record.author_name);
  const date = record.post_date || "";
  const fingerprint = getFingerprint(record);

  // Priority: URL > author+date+fingerprint > fingerprint alone
  if (url) {
    return `url:${url}`;
  }
  if (author && date && fingerprint) {
    return `composite:${author}|${date}|${fingerprint}`;
  }
  return `fingerprint:${fingerprint}`;
}

function getEmails(text) {
  const matches = text.match(
    /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi
  ) || [];

  return [...new Set(matches.map((email) => email.toLowerCase()))];
}

function getApplicationLinks(text) {
  const patterns = [
    /https?:\/\/lnkd\.in\/[a-zA-Z0-9_-]+/gi,
    /https?:\/\/www\.linkedin\.com\/jobs\/view\/[a-zA-Z0-9_-]+/gi,
    /https?:\/\/www\.linkedin\.com\/jobs\/[a-zA-Z0-9_\/\-?=&]+/gi,
    /https?:\/\/[a-zA-Z0-9.-]+\.(?:com|org|net|io|co|pk|in|uk)\/[a-zA-Z0-9_\/\-?=&]*(?:apply|application|job|career)[a-zA-Z0-9_\/\-?=&]*/gi
  ];

  const allMatches = [];
  for (const pattern of patterns) {
    const matches = text.match(pattern) || [];
    allMatches.push(...matches);
  }

  return [...new Set(allMatches.map((url) => url.toLowerCase()))];
}

function matchesLocations(description, locations) {
  if (!locations?.length) return true;

  const text = normalizeText(description);
  return locations.some((location) =>
    text.includes(normalizeText(location))
  );
}

function matchesKeywords(description, keywords) {
  if (!keywords?.length) return true;

  const text = normalizeText(description);
  return keywords.some((keyword) =>
    text.includes(normalizeText(keyword))
  );
}

function applyLocalHiringGuard(record) {
  const result = classifyHiringPost(record.description || "");
  record.guard_decision = result.decision;
  record.guard_confidence = result.confidence;
  record.guard_reason = result.reason;
  record.classification_source = "local_guard";

  if (result.decision === "KEEP" || result.decision === "DENY") {
    record.ollama_decision = result.decision;
    if (result.decision === "KEEP") {
      record.relevance = "Likely hiring";
      record.relevance_reason = "Local guard: " + result.reason;
    }
  } else {
    record.ollama_decision = "CONFUSE";
  }

  return result;
}

async function processPost(incoming, classificationTasks = []) {
  const { records, session } = await getState();
  if (!session.active) {
    return { ignored: true };
  }

  const description = incoming.description || "";
  session.processed = (session.processed || 0) + 1;

  const locationMatch = matchesLocations(description, session.locations);
  const keywordMatch = matchesKeywords(description, session.keywords);
  if (!locationMatch || !keywordMatch) {
    session.filtered = (session.filtered || 0) + 1;
    await chrome.storage.local.set({ [SESSION_KEY]: session });
    return { filtered: true };
  }

  const emails = incoming.emails || getEmails(description);
  const application_links = incoming.application_links ||
    getApplicationLinks(description);
  if (emails.length === 0 && application_links.length === 0) {
    session.filtered = (session.filtered || 0) + 1;
    await chrome.storage.local.set({ [SESSION_KEY]: session });
    return { filtered: true, reason: "no_contact_info" };
  }

  const settings = await chrome.storage.local.get([OLLAMA_KEY_KEY]);
  const apiKey = settings[OLLAMA_KEY_KEY];
  const incomingKey = getCompositeKey(incoming);
  const pendingRecords = await getPendingRecords();
  const existing = records.find((record) =>
    getCompositeKey(record) === incomingKey
  );
  const pending = pendingRecords.find((record) =>
    getCompositeKey(record) === incomingKey
  );
  const duplicate = existing || pending;

  if (duplicate) {
    duplicate.last_seen_at = new Date().toISOString();
    for (const field of [
      "post_date",
      "original_date_label",
      "author_name",
      "company"
    ]) {
      if (!duplicate[field] && incoming[field]) {
        duplicate[field] = incoming[field];
      }
    }
    duplicate.emails = [...new Set([...(duplicate.emails || []), ...emails])];
    duplicate.application_links = [
      ...new Set([...(duplicate.application_links || []), ...application_links])
    ];
    session.duplicates = (session.duplicates || 0) + 1;
    await chrome.storage.local.set({
      [RECORDS_KEY]: records,
      [PENDING_RECORDS_KEY]: pendingRecords,
      [SESSION_KEY]: session
    });

    if (pending && apiKey) {
      const classificationTaskIndex = classificationTasks.push(
        enqueueClassification(pending, apiKey)
      ) - 1;
      return {
        duplicate: true,
        classificationPending: true,
        classificationTaskIndex
      };
    }
    return { duplicate: true };
  }

  const record = {
    post_date: incoming.post_date || "",
    original_date_label: incoming.original_date_label || "",
    description,
    emails,
    application_links,
    author_name: incoming.author_name || "",
    company: incoming.company || "",
    post_url: normalizeUrl(incoming.post_url) || incoming.post_url || "",
    search_keyword: Array.isArray(session.keywords)
      ? session.keywords.join(", ")
      : "",
    collected_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    relevance: incoming.relevance || "Needs review",
    relevance_reason: "",
    ollama_decision: "",
    application_status: "New"
  };
  const guardResult = applyLocalHiringGuard(record);
  records.push(record);
  session.saved = (session.saved || 0) + 1;
  await chrome.storage.local.set({
    [RECORDS_KEY]: records,
    [SESSION_KEY]: session
  });

  if (guardResult.decision === "KEEP") {
    record.relevance = "Likely hiring";
    await chrome.storage.local.set({ [RECORDS_KEY]: records });
    return {
      saved: true,
      classified: "KEEP",
      classificationSource: "local_guard"
    };
  }

  if (guardResult.decision === "DENY") {
    return {
      saved: true,
      classified: "DENY",
      classificationSource: "local_guard"
    };
  }

  if (!apiKey) {
    return {
      saved: true,
      classified: "CONFUSE",
      classificationSource: "local_guard"
    };
  }

  pendingRecords.push(record);
  await chrome.storage.local.set({
    [PENDING_RECORDS_KEY]: pendingRecords,
    [SESSION_KEY]: session
  });
  const classificationTaskIndex = classificationTasks.push(
    enqueueClassification(record, apiKey)
  ) - 1;
  return {
    saved: true,
    classified: "CONFUSE",
    classificationPending: true,
    classificationTaskIndex
  };
}

function enqueueClassification(record, apiKey) {
  const recordKey = getCompositeKey(record);
  const existingTask = classificationTasksByKey.get(recordKey);
  if (existingTask) {
    return existingTask;
  }

  pendingClassifications += 1;
  const pendingWrite = classificationPendingWriteQueue.then(async () => {
    const sessionData = await chrome.storage.local.get([SESSION_KEY]);
    const session = sessionData[SESSION_KEY] || {};
    session.classificationPending = pendingClassifications;
    await chrome.storage.local.set({ [SESSION_KEY]: session });
  });
  classificationPendingWriteQueue = pendingWrite.then(() => undefined, () => undefined);

  const task = classificationQueue.then(async () => {
    try {
      await pendingWrite;
      const classification = await classifyDeveloperHiringPost(
        record.description || "",
        apiKey
      );
      await withRecordStateLock(async () => {
        const state = await getState();
        const pendingRecords = await getPendingRecords();
        const pendingIndex = pendingRecords.findIndex((item) =>
          getCompositeKey(item) === recordKey
        );
        if (pendingIndex === -1) {
          throw new Error("Pending post was removed before classification completed.");
        }

        pendingRecords.splice(pendingIndex, 1);
        const classifiedRecord = state.records.find((item) =>
          getCompositeKey(item) === recordKey
        );
        if (!classifiedRecord) {
          throw new Error("Classified post was removed before the result was saved.");
        }
        classifiedRecord.ollama_decision = classification.decision;
        classifiedRecord.classification_source = "ollama";
        classifiedRecord.relevance = classification.genuine
          ? "Likely hiring"
          : "Not hiring";
        classifiedRecord.relevance_reason = `Ollama decision: ${classification.decision}`;
        await chrome.storage.local.set({
          [RECORDS_KEY]: state.records,
          [PENDING_RECORDS_KEY]: pendingRecords,
          [SESSION_KEY]: state.session
        });
      });
      return {
        classified: classification.decision,
        saved: true
      };
    } catch (error) {
      await withRecordStateLock(async () => {
        const state = await getState();
        state.session.classificationErrors =
          (state.session.classificationErrors || 0) + 1;
        await chrome.storage.local.set({ [SESSION_KEY]: state.session });
      });
      console.error(
        "[Hiring Collector] Ollama collection classification failed:",
        error instanceof Error ? error.message : String(error)
      );
      return {
        classificationError: error instanceof Error ? error.message : String(error)
      };
    } finally {
      pendingClassifications = Math.max(0, pendingClassifications - 1);
      const pendingWrite = classificationPendingWriteQueue.then(async () => {
        const latestSessionData = await chrome.storage.local.get([SESSION_KEY]);
        const latestSession = latestSessionData[SESSION_KEY] || {};
        latestSession.classificationPending = pendingClassifications;
        await chrome.storage.local.set({ [SESSION_KEY]: latestSession });
      });
      classificationPendingWriteQueue = pendingWrite.then(() => undefined, () => undefined);
      await pendingWrite;
    }
  });

  const trackedTask = task.finally(() => {
    classificationTasksByKey.delete(recordKey);
  });
  classificationTasksByKey.set(recordKey, trackedTask);
  classificationQueue = trackedTask.then(() => undefined, () => undefined);
  return trackedTask;
}

async function retryPendingClassifications(apiKey) {
  const pendingRecords = await withRecordStateLock(async () => {
    const records = (await getState()).records;
    const queued = await getPendingRecords();
    const pendingKeys = new Set(queued.map(getCompositeKey));

    for (const record of records) {
      if (record.guard_decision !== "CONFUSE" ||
          record.ollama_decision === "KEEP" ||
          record.ollama_decision === "DENY") {
        continue;
      }
      const key = getCompositeKey(record);
      if (!pendingKeys.has(key)) {
        pendingKeys.add(key);
        queued.push(record);
      }
    }

    await chrome.storage.local.set({ [PENDING_RECORDS_KEY]: queued });
    return queued;
  });
  const tasks = pendingRecords.map((record) =>
    enqueueClassification(record, apiKey)
  );
  return Promise.all(tasks);
}
