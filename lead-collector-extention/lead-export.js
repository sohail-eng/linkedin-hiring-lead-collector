"use strict";

async function getRecordsForExport() {
  let records;
  await extractedPostsQueue;
  await withRecordStateLock(async () => {
    records = (await getState()).records;
  });
  return records;
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
    "relevance_reason",
    "ollama_decision",
    "guard_decision",
    "guard_confidence",
    "guard_reason",
    "classification_source",
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
