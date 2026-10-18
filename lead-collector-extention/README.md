
# Hiring Lead Collector

## Features

- Start and stop collection from the extension popup.
- Configure comma-separated location filters.
- Configure optional job keyword filters.
- Use a local hiring guard on every candidate; optionally send uncertain posts to Ollama Cloud to distinguish advertised software developer roles from jokes, job-seeking posts, and shared personal details.
- Extract available post text, date, author, email addresses, and URL.
- Deduplicate records across collection sessions.
- Store records locally in Chrome.
- Export all posts that pass the existing location, keyword, and contact filters, including each local `KEEP`, `DENY`, and `CONFUSE` guard result, as CSV or JSON.
- Sort CSV by post date, newest first.
- Keep records with unknown dates at the bottom.

## Location filtering

Example input:

Lahore, Karachi

A post is retained if its description contains either Lahore or Karachi,
regardless of capitalization.

If the location field is empty, location filtering is disabled.

## Ollama Cloud classification

1. Create an API key at [Ollama API keys](https://ollama.com/settings/keys).
2. Open the extension popup, click the gear icon in the top-right corner, enter the key under **Ollama Cloud API key**, and save it.
3. Start collection. After the existing location, keyword, and contact-info filters, the local guard classifies each post. All three local results (`KEEP`, `DENY`, and `CONFUSE`) are saved and included in exports for evaluation. With a key saved, only `CONFUSE` posts are additionally sent to Ollama asynchronously; the Ollama decision is recorded separately without removing the original post.
4. **Stop Collection** only stops scanning; it does not export or cancel ongoing Ollama requests. Click **Export All Saved Leads** separately when ready. Export downloads the saved records immediately and does not run or wait for classification, so a `CONFUSE` record can be exported before its Ollama result arrives.
5. Without a key, all posts passing the existing filters are still saved with their local guard status. If an Ollama request fails, the record remains saved/exportable with `CONFUSE` and is retried when collection starts again or a key is saved.
6. Removing the key disables Ollama calls for new posts; the local guard continues to save all three guard statuses.

The local guard uses text patterns and heuristic confidence; it does not verify employers or confirm that a vacancy is genuine. It may misclassify unusual wording. Both local guard and Ollama decisions are included in saved exports for review. The Cloud model catalog can change, and Ollama's free-plan models, included credits, and limits depend on the account. Calls are queued one at a time to respect the free account's concurrency limit. Failed classifications remain pending, are counted in the popup, and are retried at the next collection start or when a key is saved. Check [Ollama usage and plans](https://ollama.com/pricing).

The API key is stored in this browser's Chrome local extension storage; that storage is not encrypted. With a key configured, only eligible posts the local guard marks uncertain are sent to Ollama Cloud. Do not share your key or a packaged extension containing your key.

## Install locally

1. Save all files in one folder named `linkedin-hiring-lead-collector`.
2. Open Chrome 102 or newer.
3. Visit `chrome://extensions`.
4. Enable Developer mode.
5. Click Load unpacked.
6. Select the project folder.
7. Open LinkedIn.
8. Navigate to posts or search results you are permitted to review.
9. Open the extension and enter locations and optional job keywords. Click the top-right gear to optionally configure an Ollama Cloud API key for uncertain-post classification.
10. Click Start.
11. Review posts and scroll manually.
12. Click Stop Collection, then click Export All Saved Leads when ready.

## Important limitations

- This is a prototype; LinkedIn changes its page structure regularly.
- The extension processes visible page elements; it does not guarantee
  exhaustive results.
- It does not automatically open every post or scroll the page.
- It extracts emails from post text, not images or comments.
- Relative date parsing is approximate.
- Check exported data for extraction errors.
- Records remain in Chrome local storage until browser/extension data is cleared.
- Export backups regularly.
- Use only collection methods permitted by LinkedIn's terms and applicable law.
