
(() => {
  if (window.__hiringLeadCollectorLoaded) return;
  window.__hiringLeadCollectorLoaded = true;

  const EMAIL_REGEX =
    /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi;

  // Configuration - can be adjusted via chrome.storage if needed
  const SCAN_INTERVAL_MS = 1500;      // Debounce mutations
  const MAX_POSTS_PER_SCAN = 50;      // Limit posts processed per scan
  const BATCH_SIZE = 10;              // Send records in batches
  const MAX_LOGS = 200;               // Max log entries to keep

  // In-memory log buffer (also sent to background for persistence)
  const logs = [];
  function addLog(level, message, data) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data
    };
    logs.push(entry);
    if (logs.length > MAX_LOGS) logs.shift();
    // Also send to background for persistence
    try {
      chrome.runtime.sendMessage({ type: "LOG", entry });
    } catch (e) {}
    console.log(`[Hiring Collector] [${level}] ${message}`, data || "");
  }

  const processedElements = new WeakSet();
  let scanTimer;
  let scanning = false;
  let scanAgain = false;

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function getEmails(text) {
    return [...new Set(
      (text.match(EMAIL_REGEX) || []).map(email => email.toLowerCase())
    )];
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

    return [...new Set(allMatches.map(url => url.toLowerCase()))];
  }

  function findPostCards() {
    const selectors = [
      // Modern LinkedIn layout (2024+): feed update cards with componentkey
      '[role="listitem"][componentkey^="update-card-focus"]',
      // New CSS-in-JS layout: componentkey with long hash (urn:li:activity or urn:li:share)
      '[componentkey]:has(a[href*="/in/"], a[href*="/company/"])',
      // Legacy layouts
      ".feed-shared-update-v2",
      ".occludable-update",
      '[data-urn*="activity"]',
      '[data-urn*="share"]',
      '[role="article"]'
    ];

    const found = new Set();

    for (const selector of selectors) {
      try {
        document.querySelectorAll(selector).forEach(element => {
          if (element.innerText?.trim()) found.add(element);
        });
      } catch (e) {
        // Some selectors like :has() may not be supported in all browsers
      }
    }

    // Prefer the actual update card when LinkedIn's newer layout is present.
    const modernCards = [...found].filter(card =>
      card.matches('[role="listitem"][componentkey^="update-card-focus"]')
    );

    if (modernCards.length) return modernCards;

    // For new CSS-in-JS layout, prefer cards with componentkey that look like post URNs
    const urnCards = [...found].filter(card => {
      const key = card.getAttribute("componentkey") || "";
      return /^[A-Za-z0-9\-_]{20,}$/.test(key) || key.includes("urn:li:");
    });

    if (urnCards.length) return urnCards;

    // Remove wrappers containing another detected post.
    return [...found].filter(card =>
      ![...card.children].some(child => found.has(child))
    );
  }

  async function expandDescription(card) {
    const expandButtons = card.querySelectorAll('[data-testid="expandable-text-button"]');
    if (!expandButtons.length) return;

    addLog("debug", `Found ${expandButtons.length} expandable text button(s)`, {
      cardComponentKey: card.getAttribute("componentkey")
    });

    for (const btn of expandButtons) {
      try {
        // Check if button is visible and not already expanded
        const isVisible = btn.offsetParent !== null;
        const ariaExpanded = btn.getAttribute("aria-expanded");
        
        if (isVisible && ariaExpanded !== "true") {
          addLog("debug", "Clicking expand button", { 
            btnText: btn.innerText?.slice(0, 50),
            ariaExpanded 
          });
          btn.click();
          
          // Small delay to let animation complete and content expand
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      } catch (e) {
        addLog("warn", "Failed to click expand button", { error: String(e) });
      }
    }
  }

  function extractDescription(card) {
    const selectors = [
      // Modern layout: expandable text box
      '[data-testid="expandable-text-box"]',
      // New CSS-in-JS layout: componentkey on text block
      '[componentkey]:has(span[data-testid="expandable-text-box"])',
      // Legacy layouts
      ".update-components-text",
      ".feed-shared-update-v2__description",
      ".feed-shared-text",
      '[data-ad-preview="message"]',
      '[componentkey*="commentary"]',
      '[class*="update-components-text"]'
    ];

    const chunks = [];

    for (const selector of selectors) {
      try {
        for (const node of card.querySelectorAll(selector)) {
          const text = clean(node.innerText || node.textContent);
          if (text && !chunks.includes(text)) chunks.push(text);
        }
      } catch (e) {
        // Some selectors like :has() may not be supported
      }
    }

    // Avoid using the entire card if a specific text block is available.
    if (chunks.length) {
      let desc = chunks.sort((a, b) => b.length - a.length)[0].slice(0, 15000);
      // Strip "Feed post" prefix that appears in new LinkedIn layout
      desc = desc.replace(/^feed post\s*/i, "").trim();
      return cleanDescription(desc);
    }

    // Fallback for LinkedIn's generated-class layout.
    const lines = (card.innerText || "")
      .split("\n")
      .map(clean)
      .filter(Boolean)
      .filter(line =>
        !/^(feed post|like|comment|repost|send|follow|see translation|more)$/i.test(line)
      );

    return cleanDescription(lines.join("\n")).slice(0, 15000);
  }

  function cleanDescription(text) {
    if (!text) return "";
    
    // Remove common UI noise patterns
    const noisePatterns = [
      /^follow\s*$/i,
      /^like\s*$/i,
      /^comment\s*$/i,
      /^repost\s*$/i,
      /^send\s*$/i,
      /^share\s*$/i,
      /^see translation\s*$/i,
      /^more\s*$/i,
      /^…more\s*$/i,
      /^\.\.\.\s*more\s*$/i,
      /^\d+\s*votes?\s*•/i,
      /^what matters most when choosing a job\?/i,
      /^the author can see how you vote\./i,
      /^learn more\s*$/i,
      /^show results\s*$/i,
      /^vote\s*$/i,
      /^poll\s*$/i,
      /^\d+[hdw]\s*left\s*$/i,
      /^\d+\s*(hour|day|week)s?\s*left\s*$/i,
    ];
    
    // Split into lines, filter out noise, rejoin
    const lines = text.split("\n")
      .map(line => line.trim())
      .filter(line => {
        if (!line) return false;
        // Check against noise patterns
        for (const pattern of noisePatterns) {
          if (pattern.test(line)) return false;
        }
        return true;
      });
    
    return lines.join("\n").trim();
  }

  function findAuthor(card) {
    const selectors = [
      ".update-components-actor__name",
      ".feed-shared-actor__name",
      '[class*="update-components-actor__name"]',
      'a[href*="/in/"]',
      'a[href*="/company/"]'
    ];

    for (const selector of selectors) {
      const nodes = card.querySelectorAll(selector);

      for (const node of nodes) {
        const text = clean(node.innerText || node.textContent);
        if (text && text.length < 150) {
          return text.split("\n")[0].trim();
        }
      }
    }

    // Modern layout fallback: first meaningful profile/company link.
    const link = [...card.querySelectorAll("a[href]")].find(a =>
      /linkedin\.com\/(in|company)\//i.test(a.href) &&
      clean(a.innerText || a.getAttribute("aria-label"))
    );

    return clean(link?.innerText || link?.getAttribute("aria-label"))
      .split("\n")[0]
      .trim();
  }

  function findCompany(card, author) {
    // Primary: company link in card
    const companyLink = [...card.querySelectorAll('a[href*="/company/"]')]
      .find(a => clean(a.innerText) && clean(a.innerText) !== author);

    if (companyLink) {
      return clean(companyLink.innerText).split("\n")[0].trim();
    }

    // Fallback: look for company in actor sub-description or similar
    const companyNode = card.querySelector([
      '.update-components-actor__sub-description',
      '.feed-shared-actor__sub-description',
      '[class*="actor__sub-description"]'
    ].join(","));

    if (companyNode) {
      const text = clean(companyNode.innerText || companyNode.textContent);
      // Try to extract company from text like "Company Name · 1h"
      const parts = text.split("·").map(clean).filter(Boolean);
      if (parts.length > 1 && parts[0] !== author) {
        return parts[0];
      }
    }

    // Fallback: search all links for company pattern
    const allLinks = [...card.querySelectorAll('a[href]')];
    const companyFromLink = allLinks.find(a => 
      a.href.includes('/company/') && 
      clean(a.innerText) && 
      clean(a.innerText) !== author
    );

    return clean(companyFromLink?.innerText).split("\n")[0].trim();
  }

  function getPostDate(card) {
    const time = card.querySelector("time");

    if (time) {
      const raw = clean(
        time.getAttribute("datetime") || time.innerText || time.textContent
      );

      const parsed = new Date(raw);

      if (raw && !Number.isNaN(parsed.getTime())) {
        return {
          date: parsed.toISOString().slice(0, 10),
          label: raw
        };
      }
    }

    // Try specific date nodes first
    const dateNode = card.querySelector([
      ".update-components-actor__sub-description",
      ".feed-shared-actor__sub-description",
      '[class*="actor__sub-description"]',
      // New layout: relative time in various elements
      '[data-testid="social-activity-time"]',
      'span[aria-label*="ago"]',
      'span[aria-label*="hour"]',
      'span[aria-label*="day"]',
      'span[aria-label*="week"]',
      'span[aria-label*="month"]'
    ].join(","));

    let label = clean(dateNode?.innerText || dateNode?.textContent || "");

    // If no specific date node found, search entire card text for relative time patterns
    if (!label) {
      const cardText = clean(card.innerText || "");
      // Look for patterns like "1h", "27m", "4d", "6d", "1w", "1mo", "1y" with optional spaces
      const timeMatch = cardText.match(/\b(\d+)\s*(?:m(?:in(?:ute)?s?)?|h(?:r|our)?s?|d(?:ay)?s?|w(?:eek)?s?|mo(?:nth)?s?|y(?:ear)?s?)\b/i);
      if (timeMatch) {
        label = timeMatch[0];
      }
    }

    const lower = label.toLowerCase();

    // Recognize common relative timestamps, including "2h", "3d", and "1w".
    const now = new Date();
    let days = null;

    if (/\byesterday\b/.test(lower)) {
      days = 1;
    } else if (/\b(today|just now|now)\b/.test(lower)) {
      return { date: now.toISOString().slice(0, 10), label };
    } else {
      // Match: 1m, 5min, 30 minutes, 2h, 3hr, 4 hours, 1d, 2 days, 1w, 2 weeks, 1mo, 2 months, 1y, 2 years
      // Use word boundaries and explicit unit matching to avoid "mo" matching "moment"
      const match = lower.match(
        /\b(\d+)\s*(?:m(?:in(?:ute)?s?)?|h(?:r|our)?s?|d(?:ay)?s?|w(?:eek)?s?|mo(?:nth)?s?|y(?:ear)?s?)\b/
      );

      if (match) {
        const n = Number(match[1]);
        const unit = match[0].match(/[a-z]+/)[0]; // Extract the unit part

        if (/^m(in(ute)?s?)?$/.test(unit) || /^h(r|our)?s?$/.test(unit)) {
          days = 0;
        } else if (/^d(ay)?s?$/.test(unit)) {
          days = n;
        } else if (/^w(eek)?s?$/.test(unit)) {
          days = n * 7;
        } else if (/^mo(nth)?s?$/.test(unit)) {
          now.setMonth(now.getMonth() - n);
          return { date: now.toISOString().slice(0, 10), label };
        } else if (/^y(ear)?s?$/.test(unit)) {
          now.setFullYear(now.getFullYear() - n);
          return { date: now.toISOString().slice(0, 10), label };
        }
      }
    }

    if (days !== null) {
      now.setDate(now.getDate() - days);
      return { date: now.toISOString().slice(0, 10), label };
    }

    return { date: "", label };
  }

  function getPostUrl(card) {
    // Prefer an actual post permalink, never the current search/feed URL.
    const links = [...card.querySelectorAll("a[href]")];

    const postLink = links.find(a =>
      /linkedin\.com\/feed\/update\/|linkedin\.com\/posts\/|linkedin\.com\/pulse\//i.test(a.href)
    );

    if (postLink) {
      try {
        const url = new URL(postLink.href);
        url.search = "";
        url.hash = "";
        return url.href;
      } catch {}
    }

    // Some layouts expose the post identifier in a component key.
    const keyed = card.querySelector('[componentkey^="update-card-focus"]');
    const key = keyed?.getAttribute("componentkey") || "";

    const match = key.match(/(urn:li:(?:activity|share):\d+)/i);
    if (match) {
      return `https://www.linkedin.com/feed/update/${match[1]}/`;
    }

    const urn = card.getAttribute("data-urn") ||
      card.querySelector("[data-urn]")?.getAttribute("data-urn");

    if (urn && /urn:li:(activity|share):\d+/i.test(urn)) {
      return `https://www.linkedin.com/feed/update/${urn}/`;
    }

    // New CSS-in-JS layout: check card's own componentkey for urn pattern
    const cardKey = card.getAttribute("componentkey") || "";
    const cardKeyMatch = cardKey.match(/(urn:li:(?:activity|share):\d+)/i);
    if (cardKeyMatch) {
      return `https://www.linkedin.com/feed/update/${cardKeyMatch[1]}/`;
    }

    // Check all componentkeys in the card for urn pattern
    const allKeys = [...card.querySelectorAll("[componentkey]")]
      .map(el => el.getAttribute("componentkey") || "")
      .join(" ");
    const allKeysMatch = allKeys.match(/(urn:li:(?:activity|share):\d+)/i);
    if (allKeysMatch) {
      return `https://www.linkedin.com/feed/update/${allKeysMatch[1]}/`;
    }

    // For search results: look for any link that contains activity URN
    const activityLink = links.find(a => 
      /urn:li:activity:\d+/i.test(a.href) || 
      /linkedin\.com\/feed\/update\/urn:li:activity:/i.test(a.href)
    );
    if (activityLink) {
      try {
        const url = new URL(activityLink.href);
        url.search = "";
        url.hash = "";
        return url.href;
      } catch {}
    }

    // Empty is safer than assigning the same feed URL to every post.
    return "";
  }

  async function sendRecords(records) {
    if (!records.length) return { ok: true, count: 0 };
    
    // Check extension context
    if (!chrome.runtime?.id) {
      addLog("error", "Cannot send records - extension context invalidated");
      return { ok: false, error: "Extension context invalidated" };
    }
    
    try {
      return await chrome.runtime.sendMessage({
        type: "EXTRACTED_POSTS_BATCH",
        records
      });
    } catch (error) {
      const errMsg = String(error);
      addLog("error", "Failed to send records to background", { error: errMsg });
      return { ok: false, error: errMsg };
    }
  }

  async function sendRecord(record) {
    return sendRecords([record]);
  }

  async function scan() {
    if (scanning) {
      scanAgain = true;
      return;
    }

    scanning = true;

    try {
      let state;

      // Check if extension context is still valid
      if (!chrome.runtime?.id) {
        addLog("error", "Extension context invalidated");
        return;
      }

      try {
        state = await chrome.runtime.sendMessage({ type: "GET_STATE" });
      } catch (error) {
        const errMsg = String(error);
        addLog("error", "Background connection failed", { error: errMsg });
        
        // If "Extension context invalidated" or "message port closed", stop scanning
        if (errMsg.includes("Extension context invalidated") || 
            errMsg.includes("message port closed") ||
            errMsg.includes("could not establish connection")) {
          addLog("error", "Extension context lost - stopping scanner");
          clearTimeout(scanTimer);
          return;
        }
        return;
      }

      addLog("debug", "GET_STATE response", { 
        hasState: !!state, 
        sessionActive: state?.session?.active,
        sessionKeys: state?.session ? Object.keys(state.session) : null
      });

      if (!state?.session?.active) {
        addLog("info", "Session not active, skipping scan", { 
          sessionExists: !!state?.session,
          sessionActive: state?.session?.active 
        });
        return;
      }

      addLog("info", "Starting scan", { url: location.href });
      const cards = findPostCards();
      let submitted = 0;
      const batch = [];

      addLog("info", `Detected ${cards.length} candidate post elements`, {
        selectors: ['[role="listitem"][componentkey^="update-card-focus"]', '[componentkey]:has(a[href*="/in/"])', '.feed-shared-update-v2', '[data-urn*="activity"]', '[role="article"]']
      });

      // Log first few cards for debugging
      for (let i = 0; i < Math.min(cards.length, 3); i++) {
        const card = cards[i];
        addLog("debug", `Card ${i} preview`, {
          componentkey: card.getAttribute("componentkey"),
          dataUrn: card.getAttribute("data-urn"),
          role: card.getAttribute("role"),
          className: card.className?.slice(0, 100),
          innerTextPreview: card.innerText?.slice(0, 200)
        });
      }

      for (const card of cards) {
        if (processedElements.has(card)) continue;
        if (submitted >= MAX_POSTS_PER_SCAN) break;

        // Expand "Show more" buttons before extracting description
        await expandDescription(card);

        const description = extractDescription(card);
        if (!description || description.length < 15) {
          addLog("debug", "Skipping card - no description or too short", { length: description?.length });
          continue;
        }

        const date = getPostDate(card);
        const author = findAuthor(card);

        const record = {
          post_date: date.date,
          original_date_label: date.label,
          description,
          emails: getEmails(description),
          application_links: getApplicationLinks(description),
          author_name: author,
          company: findCompany(card, author),
          post_url: getPostUrl(card),
          relevance: /\b(hiring|hire|vacancy|vacancies|job opening|recruiter|apply|careers|job opportunity)\b/i.test(description)
            ? "Likely hiring"
            : "Needs review"
        };

        addLog("info", "Extracted post", {
          author,
          company: record.company,
          date: record.post_date,
          emails: record.emails,
          application_links: record.application_links,
          url: record.post_url,
          relevance: record.relevance,
          descriptionPreview: description.slice(0, 100)
        });

        batch.push({ record, card });

        if (batch.length >= BATCH_SIZE) {
          await flushBatch(batch, processedElements);
          submitted += batch.length;
          batch.length = 0;
        }
      }

      // Flush remaining batch
      if (batch.length) {
        await flushBatch(batch, processedElements);
        submitted += batch.length;
      }

      addLog("info", `Scan finished`, { candidates: cards.length, submitted });
    } finally {
      scanning = false;

      if (scanAgain) {
        scanAgain = false;
        scheduleScan();
      }
    }
  }

  async function flushBatch(batch, processedSet) {
    const records = batch.map(({ record }) => record);
    try {
      await sendRecords(records);
      for (const { card } of batch) {
        processedSet.add(card);
      }
    } catch (error) {
      console.error("[Hiring Collector] Failed to submit batch", error);
    }
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, SCAN_INTERVAL_MS);
  }

  const observer = new MutationObserver(scheduleScan);

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "SCAN_VISIBLE") {
      scan()
        .then(() => sendResponse({ ok: true }))
        .catch(error => sendResponse({ ok: false, error: String(error) }));

      return true;
    }

    if (message?.type === "GET_LOGS") {
      sendResponse({ ok: true, logs });
      return true;
    }
  });

  console.log("[Hiring Collector] Content script loaded:", location.href);
  scan();
})();
