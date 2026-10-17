
const RECORDS_KEY = "hiringLeadRecords";
const SESSION_KEY = "hiringLeadSession";
const LOGS_KEY = "hiringLeadLogs";
const MAX_LOGS = 500;

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
  // Extract LinkedIn short links (lnkd.in), apply links, and job posting URLs
  const patterns = [
    /https?:\/\/lnkd\.in\/[a-zA-Z0-9_-]+/gi,           // lnkd.in short links
    /https?:\/\/www\.linkedin\.com\/jobs\/view\/[a-zA-Z0-9_-]+/gi,  // LinkedIn job views
    /https?:\/\/www\.linkedin\.com\/jobs\/[a-zA-Z0-9_\/\-?=&]+/gi,   // Other LinkedIn job URLs
    /https?:\/\/[a-zA-Z0-9.-]+\.(?:com|org|net|io|co|pk|in|uk)\/[a-zA-Z0-9_\/\-?=&]*(?:apply|application|job|career)[a-zA-Z0-9_\/\-?=&]*/gi  // External apply links
  ];

  const allMatches = [];
  for (const pattern of patterns) {
    const matches = text.match(pattern) || [];
    allMatches.push(...matches);
  }

  // Deduplicate and normalize
  return [...new Set(allMatches.map(url => url.toLowerCase()))];
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

async function processPost(incoming) {
    const { records, session } = await getState();

    if (!session.active) {
      console.log("[Hiring Collector] BG: Session not active, ignoring");
      return { ignored: true };
    }

    const description = incoming.description || "";

    session.processed = (session.processed || 0) + 1;
    console.log("[Hiring Collector] BG: processPost called, processed now:", session.processed);

    const locationMatch = matchesLocations(description, session.locations);
    const keywordMatch = matchesKeywords(description, session.keywords);

    console.log("[Hiring Collector] BG Filter Check:", {
      hasLocations: session.locations?.length > 0,
      hasKeywords: session.keywords?.length > 0,
      locations: session.locations,
      keywords: session.keywords,
      locationMatch,
      keywordMatch,
      descPreview: description.slice(0, 100)
    });

    if (!locationMatch || !keywordMatch) {
    session.filtered = (session.filtered || 0) + 1;

    await chrome.storage.local.set({
      [SESSION_KEY]: session
    });

    console.log("[Hiring Collector] BG Filtered:", { filtered: session.filtered });
    return { filtered: true };
  }

  // Require at least one email OR application link
  const incomingEmails = incoming.emails || getEmails(description);
  const incomingLinks = incoming.application_links || getApplicationLinks(description);
  
  if (incomingEmails.length === 0 && incomingLinks.length === 0) {
    session.filtered = (session.filtered || 0) + 1;
    await chrome.storage.local.set({ [SESSION_KEY]: session });
    console.log("[Hiring Collector] BG Skipped: No email or application link");
    return { filtered: true, reason: "no_contact_info" };
  }

  console.log("[Hiring Collector] BG: Passed filters, checking duplicates...");
  const incomingKey = getCompositeKey(incoming);

  const existing = records.find((record) => {
    return getCompositeKey(record) === incomingKey;
  });

  console.log("[Hiring Collector] BG: Duplicate check, existing:", !!existing, "records count:", records.length);

  if (existing) {
    existing.last_seen_at = new Date().toISOString();

    // Fill missing fields if the same post is encountered again.
    for (const field of [
      "post_date",
      "original_date_label",
      "author_name",
      "company"
    ]) {
      if (!existing[field] && incoming[field]) {
        existing[field] = incoming[field];
      }
    }

    existing.emails = [
      ...new Set([
        ...(existing.emails || []),
        ...(incoming.emails || [])
      ])
    ];

    existing.application_links = [
      ...new Set([
        ...(existing.application_links || []),
        ...(incoming.application_links || [])
      ])
    ];

    try {
      await chrome.storage.local.set({
        [RECORDS_KEY]: records
      });
      session.duplicates = (session.duplicates || 0) + 1;
      await chrome.storage.local.set({
        [SESSION_KEY]: session
      });
      console.log("[Hiring Collector] BG: Duplicate updated successfully");
    } catch (err) {
      console.error("[Hiring Collector] BG: Failed to save duplicate:", err);
    }

    return { duplicate: true };
  }

  const incomingUrl = normalizeUrl(incoming.post_url);

  console.log("[Hiring Collector] BG: Saving new record...");
  
  console.log("[Hiring Collector] BG: Getting emails...");
  const emails = incoming.emails || getEmails(description);
  console.log("[Hiring Collector] BG: Emails:", emails);
  
  console.log("[Hiring Collector] BG: Getting application links...");
  const application_links = incoming.application_links || getApplicationLinks(description);
  console.log("[Hiring Collector] BG: Application links:", application_links);
  
  console.log("[Hiring Collector] BG: Checking incomingUrl...");
  console.log("[Hiring Collector] BG: incomingUrl:", incomingUrl, "incoming.post_url:", incoming.post_url);
  const post_url = incomingUrl || incoming.post_url || "";
  console.log("[Hiring Collector] BG: post_url:", post_url);
  
  console.log("[Hiring Collector] BG: Checking session.keywords...");
  console.log("[Hiring Collector] BG: session.keywords:", session.keywords, "type:", typeof session.keywords);
  const search_keyword = Array.isArray(session.keywords) ? session.keywords.join(", ") : "";
  console.log("[Hiring Collector] BG: search_keyword:", search_keyword);
  
  console.log("[Hiring Collector] BG: Creating record object...");
  const record = {
    post_date: incoming.post_date || "",
    original_date_label: incoming.original_date_label || "",
    description,
    emails,
    application_links,
    author_name: incoming.author_name || "",
    company: incoming.company || "",
    post_url,
    search_keyword,
    collected_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    relevance: incoming.relevance || "Needs review",
    application_status: "New"
  };
  
  console.log("[Hiring Collector] BG: Record object created");
  console.log("[Hiring Collector] BG: Record size approx:", JSON.stringify(record).length, "chars");
  console.log("[Hiring Collector] BG: Current records count:", records.length);

  try {
    records.push(record);
    console.log("[Hiring Collector] BG: Record pushed to array");
  } catch (err) {
    console.error("[Hiring Collector] BG: Failed to push record:", err);
    return { saved: false, error: String(err) };
  }

  session.saved = (session.saved || 0) + 1;

  try {
    console.log("[Hiring Collector] BG: Attempting storage write...");
    await chrome.storage.local.set({
      [RECORDS_KEY]: records,
      [SESSION_KEY]: session
    });
    console.log("[Hiring Collector] BG: Storage write completed");
    
    // Verify the write
    const verify = await chrome.storage.local.get([RECORDS_KEY]);
    console.log("[Hiring Collector] BG: Verify - records in storage:", verify[RECORDS_KEY]?.length);
    
    console.log("[Hiring Collector] BG: Record saved successfully, saved count:", session.saved);
  } catch (err) {
    console.error("[Hiring Collector] BG: Failed to save record:", err);
    console.error("[Hiring Collector] BG: Error stack:", err?.stack);
    return { saved: false, error: String(err) };
  }

  return { saved: true };
}

function csvEscape(value) {
  let text = Array.isArray(value)
    ? value.join("; ")
    : String(value ?? "");

  // Reduce CSV formula injection risk in spreadsheet applications.
  if (/^[\s]*[=+\-@]/.test(text)) {
    text = "'" + text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function makeCsv(records) {
  const columns = [
    "post_date",
    "description",
    "emails",
    "application_links",
    "author_name",
    "company",
    "post_url",
    "search_keyword",
    "collected_at",
    "relevance",
    "application_status",
    "original_date_label"
  ];

  const sorted = [...records].sort((a, b) => {
    const dateA = Date.parse(a.post_date);
    const dateB = Date.parse(b.post_date);

    if (Number.isNaN(dateA) && Number.isNaN(dateB)) return 0;
    if (Number.isNaN(dateA)) return 1;
    if (Number.isNaN(dateB)) return -1;

    return dateB - dateA;
  });

  return [
    columns.map(csvEscape).join(","),
    ...sorted.map((record) =>
      columns.map((column) => csvEscape(record[column])).join(",")
    )
  ].join("\r\n");
}

async function exportCsv(records) {
  const csv = "\uFEFF" + makeCsv(records);

  const url =
    "data:text/csv;charset=utf-8," +
    encodeURIComponent(csv);

  const date = new Date().toISOString().slice(0, 10);

  try {
    await chrome.downloads.download({
      url,
      filename: `hiring-leads-${date}.csv`,
      saveAs: true,
      conflictAction: "uniquify"
    });
  } catch (error) {
    console.error("[Hiring Collector] Export failed:", error);
    throw new Error(`Download failed: ${error.message}`);
  }

  return records.length;
}

async function exportJson(records) {
  const json = JSON.stringify(records, null, 2);
  
  const url =
    "data:application/json;charset=utf-8," +
    encodeURIComponent(json);

  const date = new Date().toISOString().slice(0, 10);

  try {
    await chrome.downloads.download({
      url,
      filename: `hiring-leads-${date}.json`,
      saveAs: true,
      conflictAction: "uniquify"
    });
  } catch (error) {
    console.error("[Hiring Collector] JSON Export failed:", error);
    throw new Error(`Download failed: ${error.message}`);
  }

  return records.length;
}

chrome.runtime.onInstalled.addListener(async (details) => {
  // Only initialize on first install, not on updates
  if (details.reason !== "install") return;

  const data = await chrome.storage.local.get([
    RECORDS_KEY,
    SESSION_KEY
  ]);

  if (!Array.isArray(data[RECORDS_KEY])) {
    await chrome.storage.local.set({
      [RECORDS_KEY]: []
    });
  }

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
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handleMessage = async () => {
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

        // Ensure empty arrays (not undefined) for proper filter disabling
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
          filtered: 0
        };

        console.log("[Hiring Collector] BG START:", { locations, keywords });

        try {
          await chrome.storage.local.set({
            [SESSION_KEY]: session
          });
          console.log("[Hiring Collector] BG START: Session saved, active=true");
        } catch (err) {
          console.error("[Hiring Collector] BG START: Failed to save session:", err);
          return { ok: false, error: String(err) };
        }

        return {
          ok: true,
          session,
          existingRecords: state.records.length
        };
      }

      case "STOP": {
        const state = await getState();

        state.session.active = false;
        state.session.stoppedAt = new Date().toISOString();

        await chrome.storage.local.set({
          [SESSION_KEY]: state.session
        });

        const format = message.format || "csv";
        const count = format === "json" 
          ? await exportJson(state.records) 
          : await exportCsv(state.records);

        return { ok: true, count };
      }

      case "EXPORT_ALL": {
        const { records } = await getState();
        const format = message.format || "csv";
        const count = format === "json" 
          ? await exportJson(records) 
          : await exportCsv(records);

        return { ok: true, count };
      }

      case "CLEAR_ALL": {
        await chrome.storage.local.set({
          [RECORDS_KEY]: [],
          [SESSION_KEY]: {
            active: false,
            processed: 0,
            saved: 0,
            duplicates: 0,
            filtered: 0
          }
        });
        return { ok: true };
      }

      case "EXTRACTED_POST": {
        const result = await processPost(message.record || {});
        return { ok: true, ...result };
      }

      case "EXTRACTED_POSTS_BATCH": {
        const records = message.records || [];
        const results = [];
        for (const record of records) {
          const result = await processPost(record);
          results.push(result);
        }
        return { ok: true, results };
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

// Global error handlers to prevent service worker crashes
self.addEventListener("error", (event) => {
  console.error("[Hiring Collector] Background script error:", event.error);
});

self.addEventListener("unhandledrejection", (event) => {
  console.error("[Hiring Collector] Background unhandled rejection:", event.reason);
  event.preventDefault(); // Prevent service worker termination
});
