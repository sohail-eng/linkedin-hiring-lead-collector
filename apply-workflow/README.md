# Auto-Apply Workflow

Python script that scores exported leads against your compressed CV (`cv.md`), drafts a short email when the score is **greater than** `MIN_SCORE` (default 70), and sends that email with `cv.pdf` attached.

Full setup steps live on the site **Auto-Apply** tab (`index.html`).

## Quick start

```bash
cd apply-workflow
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # fill Ollama + SMTP
# Place hiring-leads.csv, cv.md, cv.pdf in this folder
python apply_jobs.py
```

Progress is saved in `apply-results.json` so re-runs skip already-processed posts. Any Ollama failure prints the error and stops the run.
