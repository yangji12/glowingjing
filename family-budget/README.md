# 🏡 Family Budget

A private, self-hosted budgeting app for tracking your family's monthly money:
upload your bank statements, let AI categorize every transaction, and see the
whole picture: planned vs. actual for **Income**, **Fixed**, **Flexible** and
**Non-Monthly & Misc** expenses, with a dashboard, click-through transactions, a
built-in AI budget assistant, and PDF / Excel / Google Sheets exports.

All data stays on your computer in `data/budget.db` (SQLite).

## Easiest: just double-click `Family-Budget.html`

`Family-Budget.html` is the whole app in one file. Download it, double-click it, and it
opens in your web browser (Chrome, Safari, Edge or Firefox). There's nothing to install.

- Your budget is saved **in that browser on that computer**. Use the same browser each time.
- Use **Settings → Download backup** now and then. Clearing your browser history or data
  would erase the budget, and a backup file lets you restore it or move to another computer.
- To turn on AI (statement reading, smart categories, the assistant), paste an Anthropic
  API key in **Settings**. The key is saved only in your browser and is sent only to Anthropic.
- One-click Google Sheets export isn't available in this version. Use **Export → Excel / Google Sheets file**
  and import it into Google Sheets.

To rebuild the file after changing the code: `cd standalone && npm install && npm run build`.

## Or run it as a small server

Requires Python 3.10+.

```bash
cd family-budget
./start.sh            # Mac/Linux: installs on first run, then opens http://localhost:8000
```

Or manually:

```bash
cd family-budget
pip install -r requirements.txt
python server.py      # then open http://localhost:8000
```

Click **Load demo data** to explore, or **Upload statement** to import your own.

To turn on the AI features, open **Settings → AI features** and paste an Anthropic API key
([get one](https://console.anthropic.com/settings/keys)), or set `ANTHROPIC_API_KEY`
before starting. Without a key the app still works: it uses keyword rules for
categories and a basic PDF reader.

## Features

| Area | What it does |
|---|---|
| **Budget** | Month-by-month planned / actual / remaining table grouped into Income, Fixed, Flexible and Non-Monthly & Misc, with progress bars and a *Left to Budget* bar. You can edit the planned amounts in place. You can set a total Flexible budget and see how much is still unallocated. Categories with no budget are hidden behind "Show N unbudgeted". A new month copies the plan from the previous month. |
| **Upload** | Drag in CSV, Excel or PDF statements from checking, savings or credit cards. Columns and amount signs are detected automatically. Re-uploading the same statement skips duplicates. Credit-card payments and transfers go to *Transfers*, so nothing is counted twice. |
| **AI categorization** | Claude reads PDF statements and assigns a category to every transaction. When you change a category, the app can remember it for that merchant, so future uploads follow your choices. |
| **Dashboard** | Income, spending, net saved and budget-left figures with month-over-month change. Also: spending by category, progress per section, over-budget categories, top merchants and a 6-month income vs. spending chart. Click any bar, row or merchant to see its transactions. |
| **Transactions** | Search and filter, change categories inline, add cash or manual transactions, delete transactions. |
| **Budget Assistant** | A side-panel chat that can see this month's budget, the last 6 months and every transaction. It offers starter questions such as "Where did we overspend?" and "How could we save $500 next month?". Conversations are saved per month. |
| **Exports** | PDF summary with the budget tables, a chart and all transactions. Excel file with Summary, Transactions and 12-Month Trend tabs; open it in Google Sheets with *File → Import*. Transactions CSV. Optional one-click Google Sheets export. |
| **Settings** | Family name, API key, category manager (rename, emoji, move between sections, add, delete), upload history with undo, and reset. |

## Supported statement formats

- **CSV / Excel:** any export with a date column, a description column, and either an
  `Amount` column or separate `Debit`/`Credit` columns. Header rows above the table
  are skipped. Works with exports from Chase, Bank of America, Wells Fargo, Amex,
  Capital One, Citi, credit unions and others.
- **PDF:** with AI on, Claude reads the statement text (any layout). Without AI, a
  line-by-line reader handles statements that print one transaction per line.
  Scanned (image-only) PDFs aren't supported; download the statement from your
  bank's website instead.

If purchases show up as income after an upload, remove the upload in **Settings**. Then
upload it again with **Amount signs → Purchases are positive**.

## Google Sheets

**No setup:** use **Export → Excel / Google Sheets file**. In Google Sheets, choose
*File → Import → Upload* and pick the file.

**One-click export** (optional):

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable
   the **Google Sheets API** and the **Google Drive API**.
2. Create a **service account**, then add a **JSON key** and download it.
3. `pip install gspread`
4. Start the app with `GOOGLE_SERVICE_ACCOUNT_FILE=/path/to/key.json python server.py`.
5. In **Settings → Google Sheets**, enter your Google email so new sheets are shared with you.

After that, **Export → Send to Google Sheets** creates a new spreadsheet each time.

## Privacy & security

- Everything is stored locally in `data/budget.db`. Back up that file to keep your history.
- When AI is on, the statement text and transaction descriptions are sent to the
  Anthropic API to be read and categorized, and the month's budget data is sent when you
  use the assistant. Nothing is sent when AI is off.
- The server listens only on `localhost` by default. If you expose it on your home
  network (`HOST=0.0.0.0`), also set `APP_PASSWORD=...` to require a password.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Turns on AI (or paste it in Settings) |
| `PORT` / `HOST` | `8000` / `127.0.0.1` | Where the server listens |
| `APP_PASSWORD` | — | Require a password (browser login prompt) |
| `BUDGET_DB` | `data/budget.db` | Database location |
| `GOOGLE_SERVICE_ACCOUNT_FILE` | — | Enables one-click Google Sheets export |

## Files

| File | Purpose |
|---|---|
| `server.py` | FastAPI app and API routes |
| `budget.py` | Budget math: totals, trends, merchant names, assistant context |
| `ai.py` | Claude calls: PDF extraction, categorization, streaming chat |
| `parsers.py` | CSV / Excel / PDF statement parsing |
| `categories.py` | Default categories and keyword rules |
| `exports.py` | PDF, Excel, CSV and Google Sheets exports |
| `db.py` | SQLite schema and helpers |
| `demo.py` | Demo data, plus `python demo.py out.csv` to write a sample statement |
| `static/` | The web app (plain HTML/CSS/JS; Chart.js is bundled for offline use) |
| `Family-Budget.html` | Single-file version: the same UI with everything running in the browser (built, don't edit) |
| `standalone/` | In-browser backend (`backend.js`) and the build script that produces `Family-Budget.html` |
| `sample_data/sample_statement.csv` | A sample statement to try the upload flow |
