
# Hiring Lead Collector

## Features

- Start and stop collection from the extension popup.
- Configure comma-separated location filters.
- Configure optional job keyword filters.
- Extract available post text, date, author, email addresses, and URL.
- Deduplicate records across collection sessions.
- Store records locally in Chrome.
- Export all unique records as a CSV.
- Sort CSV by post date, newest first.
- Keep records with unknown dates at the bottom.

## Location filtering

Example input:

Lahore, Karachi

A post is retained if its description contains either Lahore or Karachi,
regardless of capitalization.

If the location field is empty, location filtering is disabled.

## Install locally

1. Save all files in one folder named `linkedin-hiring-lead-collector`.
2. Open Chrome.
3. Visit `chrome://extensions`.
4. Enable Developer mode.
5. Click Load unpacked.
6. Select the project folder.
7. Open LinkedIn.
8. Navigate to posts or search results you are permitted to review.
9. Open the extension and enter locations and optional job keywords.
10. Click Start.
11. Review posts and scroll manually.
12. Click Stop & Export CSV.

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
