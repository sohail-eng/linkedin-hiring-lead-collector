# Hiring Lead Collector

A Chrome extension to collect hiring leads from LinkedIn posts, with a beautiful data viewer for GitHub Pages deployment.

## 🚀 Quick Start

### 1. Install the Extension
1. Download the `lead-collector-extention/` folder
2. Open Chrome → `chrome://extensions/`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → Select `lead-collector-extention/` folder

### 2. Collect Leads
1. Go to LinkedIn (feed, search results, or hashtag pages)
2. Click the extension icon
3. **Optional**: Enter locations (e.g., `Lahore, Karachi`) and keywords (e.g., `Python, Django`)
4. Click **Start**
5. Scroll through posts manually; the local guard screens every candidate and, with an Ollama key, uncertain cases are classified asynchronously
6. Click **Stop Collection** to stop scanning, then click **Export All Saved Leads** separately

### 3. View Data Beautifully
1. Deploy this repo to GitHub Pages (see below)
2. Open the GitHub Pages URL
3. Upload your exported `.csv` or `.json` file
4. Filter, sort, and explore your leads!

---

## 📦 GitHub Pages Deployment

### Option 1: Automatic (Recommended)
1. Push this repo to GitHub
2. Go to **Settings** → **Pages**
3. Source: **Deploy from a branch** → `main` → `/ (root)`
4. Save → Your site will be at `https://<username>.github.io/<repo-name>/`

### Option 2: Manual
```bash
git init
git add .
git commit -m "Deploy data viewer"
git branch -M main
git remote add origin https://github.com/<username>/<repo>.git
git push -u origin main
```
Then enable Pages in repo settings.

---

## 📊 Data Viewer Features

| Feature | Description |
|---------|-------------|
| **Drag & Drop Upload** | Drop CSV/JSON directly |
| **Live Search** | Search across all fields |
| **Smart Filters** | Filter by email status, link status, company |
| **Sorting** | By date (newest/oldest), author |
| **Pagination** | 25 leads per page |
| **Detail Panel** | Click any row for full details |
| **Responsive** | Works on mobile & desktop |
| **Export Formats** | View both CSV and JSON exports |

---

## 🔧 Extension Features

| Feature | Description |
|---------|-------------|
| **Location Filtering** | Comma-separated cities (e.g., `Lahore, Karachi`) |
| **Keyword Filtering** | Job keywords (e.g., `Python, Django, Backend`) |
| **Hiring Guard + Ollama** | Local rule-based screening; all `KEEP`, `DENY`, and `CONFUSE` posts are saved/exported for testing; Ollama optionally adds a decision for uncertain posts |
| **Contact Extraction** | Emails + application links (`lnkd.in`, job URLs) |
| **Deduplication** | Smart duplicate detection across sessions |
| **Date Parsing** | Relative times (1h, 3d, 1w) → ISO dates |
| **Company Detection** | Extracts company from post |
| **Export** | CSV or JSON with all fields |
| **Privacy** | All guard-labeled posts and Ollama-pending uncertain posts are stored locally; with a key configured, only uncertain eligible post text is sent to Ollama Cloud |

---

## 📁 Project Structure

```
linkedin-hiring-lead-collector/
├── index.html          # GitHub Pages entry point
├── styles.css          # Viewer styling
├── viewer.js           # Data parsing & display logic
├── lead-collector-extention/    # Chrome Extension
│   ├── manifest.json   # MV3 manifest
│   ├── background.js   # Service worker and message routing
│   ├── post-processing.js # Filtering, guard routing, and classification queue
│   ├── hiring-guard.js # Local KEEP / DENY / CONFUSE rules
│   ├── ollama-client.js # Ollama Cloud request client
│   ├── lead-export.js  # CSV and JSON export
│   ├── content.js      # LinkedIn DOM extraction
│   ├── popup.html      # Extension UI
│   ├── popup.css       # Extension styling
│   ├── popup.js        # Extension logic
│   └── README.md       # Extension docs
└── README.md           # This file
```

---

## 📋 Exported Data Fields

| Field | Description |
|-------|-------------|
| `post_date` | Parsed date (YYYY-MM-DD) |
| `original_date_label` | Original text (e.g., "2h", "3d") |
| `description` | Full post text |
| `emails` | Extracted email addresses |
| `application_links` | Apply links (lnkd.in, job URLs) |
| `author_name` | Post author |
| `company` | Company name |
| `post_url` | LinkedIn post permalink |
| `search_keyword` | Keywords used during collection |
| `collected_at` | Timestamp of collection |
| `relevance` | Hiring assessment, including "Likely hiring", "Not hiring", or "Needs review" |
| `relevance_reason` | Hiring relevance reason from the local guard or Ollama |
| `ollama_decision` | Local guard decision until Ollama classifies a `CONFUSE` post; all outcomes are retained |
| `guard_decision` | Local guard's `KEEP`, `DENY`, or `CONFUSE` triage result |
| `guard_confidence` | Heuristic local-guard confidence score (not calibrated) |
| `guard_reason` | Local guard's decision reason |
| `classification_source` | `local_guard` or `ollama` |
| `application_status` | "New" (for tracking) |

---

## 🎯 Usage Tips

### For Best Results
- **Search hashtags**: `#hiring`, `#jobs`, `#remotejobs` on LinkedIn
- **Use filters**: Add locations/keywords before starting
- **Scroll slowly**: Let extension process visible posts
- **Export regularly**: Click "Export All" to backup data

### Data Viewer Tips
- **Click rows** to see full description and all links
- **Filter by company** to focus on specific employers
- **Sort by date** to see newest opportunities first
- **Search** for specific technologies or roles

---

## 🔒 Privacy & Security

- **Local storage by default**: Leads and settings are stored in your Chrome profile
- **Optional Ollama Cloud**: Every eligible LinkedIn post is screened locally and all three guard results are retained for test/evaluation. Only uncertain posts are sent to Ollama when a key is configured; its result is saved alongside the local guard status. The API key is stored in Chrome local extension storage, which is not encrypted. The guard is heuristic and does not verify employers or vacancies.
- **No tracking**: No analytics, no telemetry
- **Local only**: Exports are downloaded to your machine
- **GitHub Pages viewer**: Runs entirely in browser, no backend

---

## 🛠 Development

### Extension Development
```bash
cd lead-collector-extention
# Make changes, then reload in chrome://extensions
```

### Viewer Development
```bash
# Serve locally
npx serve .
# or
python -m http.server 8000
```

---

## 📄 License

MIT License - Free for personal and commercial use.

---

## 🤝 Contributing

1. Fork the repo
2. Create feature branch
3. Submit PR with clear description

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/<username>/<repo>/issues)
- **Extension Problems**: Check `chrome://extensions` → Details → Service worker console
- **Data Viewer**: Open browser DevTools (F12) for errors

---

**Built with ❤️ for job seekers and recruiters**
