"""Family Budget — FastAPI backend.

Run:  python server.py      (then open http://localhost:8000)
"""

import base64
import hashlib
import os
import secrets
from collections import defaultdict

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import ai
import budget
import db
import exports
import parsers
from categories import GROUP_KEYS, GROUPS, keyword_category

STATIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
MAX_UPLOAD_BYTES = 25 * 1024 * 1024

app = FastAPI(title="Family Budget")
db.init_db()


# Optional password: set APP_PASSWORD before exposing the app beyond your own computer.
@app.middleware("http")
async def password_gate(request: Request, call_next):
    password = os.environ.get("APP_PASSWORD")
    if password:
        header = request.headers.get("authorization", "")
        ok = False
        if header.startswith("Basic "):
            try:
                _, _, given = base64.b64decode(header[6:]).decode().partition(":")
                ok = secrets.compare_digest(given, password)
            except Exception:
                ok = False
        if not ok:
            return Response("Password required", status_code=401,
                            headers={"WWW-Authenticate": 'Basic realm="Family Budget"'})
    return await call_next(request)


def family_name() -> str:
    return db.get_setting("family_name", "Family")


# ---------------------------------------------------------------- meta & settings

@app.get("/api/meta")
def meta():
    with db.tx() as conn:
        cats = db.rows(conn.execute("SELECT id, name, emoji, grp, sort FROM categories ORDER BY sort, name"))
        months = [r[0] for r in conn.execute("SELECT DISTINCT month FROM transactions ORDER BY month")]
        n = conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
    return {
        "groups": [{"key": k, "label": v} for k, v in GROUPS],
        "categories": cats,
        "months": months,
        "current_month": budget.current_month(),
        "transaction_count": n,
        "ai_enabled": ai.enabled(),
        "family_name": family_name(),
        "google_sheets": exports.google_sheets_configured(),
    }


@app.get("/api/settings")
def get_settings():
    key = db.get_setting("anthropic_api_key")
    return {
        "family_name": family_name(),
        "api_key_saved": bool(key),
        "api_key_hint": f"…{key[-4:]}" if key else None,
        "api_key_from_env": bool(os.environ.get("ANTHROPIC_API_KEY")) and not key,
        "google_share_email": db.get_setting("google_share_email", ""),
        "google_sheets": exports.google_sheets_configured(),
    }


class SettingsIn(BaseModel):
    family_name: str | None = None
    anthropic_api_key: str | None = None  # "" clears it
    google_share_email: str | None = None


@app.put("/api/settings")
def put_settings(s: SettingsIn):
    if s.family_name is not None:
        db.set_setting("family_name", s.family_name.strip() or "Family")
    if s.anthropic_api_key is not None:
        db.set_setting("anthropic_api_key", s.anthropic_api_key.strip() or None)
    if s.google_share_email is not None:
        db.set_setting("google_share_email", s.google_share_email.strip())
    return get_settings()


# ---------------------------------------------------------------- categories

class CategoryIn(BaseModel):
    name: str | None = None
    emoji: str | None = None
    grp: str | None = None


@app.post("/api/categories")
def add_category(c: CategoryIn):
    if not c.name or c.grp not in GROUP_KEYS:
        raise HTTPException(400, "Name and a valid group are required.")
    with db.tx() as conn:
        try:
            cid = conn.execute(
                "INSERT INTO categories (name, emoji, grp, sort) VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort),0)+1 FROM categories))",
                (c.name.strip(), c.emoji or "🏷️", c.grp),
            ).lastrowid
        except db.sqlite3.IntegrityError:
            raise HTTPException(400, "A category with that name already exists.")
    return {"id": cid}


@app.patch("/api/categories/{cid}")
def edit_category(cid: int, c: CategoryIn):
    if c.grp is not None and c.grp not in GROUP_KEYS:
        raise HTTPException(400, "Invalid group.")
    with db.tx() as conn:
        for field in ("name", "emoji", "grp"):
            v = getattr(c, field)
            if v is not None:
                conn.execute(f"UPDATE categories SET {field} = ? WHERE id = ?", (v.strip(), cid))
    return {"ok": True}


@app.delete("/api/categories/{cid}")
def delete_category(cid: int):
    with db.tx() as conn:
        unc = conn.execute("SELECT id FROM categories WHERE name = 'Uncategorized'").fetchone()
        if unc and unc["id"] == cid:
            raise HTTPException(400, "The Uncategorized category can't be deleted.")
        if unc:
            conn.execute("UPDATE transactions SET category_id = ? WHERE category_id = ?", (unc["id"], cid))
        conn.execute("DELETE FROM categories WHERE id = ?", (cid,))
    return {"ok": True}


# ---------------------------------------------------------------- budget

@app.get("/api/budget")
def get_budget(month: str | None = None):
    return budget.month_budget(month or budget.current_month())


class PlannedIn(BaseModel):
    month: str
    category_id: int | None = None
    grp: str | None = None
    planned: float | None = None  # for grp: null removes the group-level override
    apply_forward: bool = False   # also set it for all later months that already have a plan


@app.put("/api/budget")
def set_planned(p: PlannedIn):
    with db.tx() as conn:
        budget.ensure_month_budget(conn, p.month)
        if p.category_id:
            months = [p.month]
            if p.apply_forward:
                months += [r[0] for r in conn.execute("SELECT DISTINCT month FROM budgets WHERE month > ?", (p.month,))]
            for m in months:
                conn.execute(
                    "INSERT INTO budgets (month, category_id, planned) VALUES (?, ?, ?) "
                    "ON CONFLICT(month, category_id) DO UPDATE SET planned = excluded.planned",
                    (m, p.category_id, p.planned or 0),
                )
        elif p.grp in GROUP_KEYS:
            if p.planned is None:
                conn.execute("DELETE FROM group_budgets WHERE month = ? AND grp = ?", (p.month, p.grp))
            else:
                conn.execute(
                    "INSERT INTO group_budgets (month, grp, planned) VALUES (?, ?, ?) "
                    "ON CONFLICT(month, grp) DO UPDATE SET planned = excluded.planned",
                    (p.month, p.grp, p.planned),
                )
        else:
            raise HTTPException(400, "category_id or grp is required.")
    return budget.month_budget(p.month)


# ---------------------------------------------------------------- dashboard

@app.get("/api/dashboard")
def dashboard(month: str | None = None):
    month = month or budget.current_month()
    b = budget.month_budget(month)
    prev = budget.month_budget(budget.shift_month(month, -1))
    by_category = sorted(
        [{"id": c["id"], "name": c["name"], "emoji": c["emoji"], "group": g["key"],
          "actual": c["actual"], "planned": c["planned"]}
         for g in b["groups"] if g["key"] in budget.EXPENSE_GROUPS for c in g["categories"] if c["actual"] > 0],
        key=lambda x: -x["actual"],
    )
    over = sorted(
        [x for x in by_category if x["planned"] > 0 and x["actual"] > x["planned"]]
        + [{"id": c["id"], "name": c["name"], "emoji": c["emoji"], "group": g["key"], "actual": c["actual"], "planned": 0}
           for g in b["groups"] if g["key"] in budget.EXPENSE_GROUPS for c in g["categories"]
           if c["planned"] == 0 and c["actual"] > 0],
        key=lambda x: -(x["actual"] - x["planned"]),
    )
    return {
        "month": month, "label": b["label"], "totals": b["totals"], "prev_totals": prev["totals"],
        "groups": [{k: g[k] for k in ("key", "label", "planned", "actual", "remaining")} for g in b["groups"]],
        "by_category": by_category,
        "over_budget": over[:6],
        "trend": budget.trend(month),
        "top_merchants": budget.top_merchants(month),
        "uncategorized": b["uncategorized"],
    }


# ---------------------------------------------------------------- transactions

@app.get("/api/transactions")
def list_transactions(month: str | None = None, category_id: int | None = None, q: str | None = None,
                      grp: str | None = None, uncategorized: bool = False):
    return budget.transactions(month, category_id, q, grp, uncategorized)


class TxnIn(BaseModel):
    date: str | None = None
    description: str | None = None
    amount: float | None = None
    category_id: int | None = None
    notes: str | None = None
    account: str | None = None
    remember: bool = False  # always use this category for this merchant
    apply_to_similar: bool = False  # also recategorize existing transactions from this merchant


@app.post("/api/transactions")
def add_transaction(t: TxnIn):
    d = parsers.parse_date(t.date or "")
    if not d or not t.description or t.amount is None:
        raise HTTPException(400, "Date, description and amount are required.")
    with db.tx() as conn:
        tid = conn.execute(
            "INSERT INTO transactions (date, month, description, merchant, amount, category_id, account, notes, categorized_by)"
            " VALUES (?,?,?,?,?,?,?,?, 'manual')",
            (d, d[:7], t.description.strip(), budget.merchant_key(t.description), t.amount, t.category_id,
             t.account or "Manual", t.notes),
        ).lastrowid
    return {"id": tid}


@app.patch("/api/transactions/{tid}")
def edit_transaction(tid: int, t: TxnIn):
    with db.tx() as conn:
        row = conn.execute("SELECT * FROM transactions WHERE id = ?", (tid,)).fetchone()
        if not row:
            raise HTTPException(404, "Transaction not found.")
        updated = 1
        if t.category_id is not None:
            conn.execute("UPDATE transactions SET category_id = ?, categorized_by = 'you' WHERE id = ?", (t.category_id, tid))
            if t.remember and row["merchant"]:
                conn.execute(
                    "INSERT INTO merchant_rules (merchant, category_id) VALUES (?, ?) "
                    "ON CONFLICT(merchant) DO UPDATE SET category_id = excluded.category_id",
                    (row["merchant"], t.category_id),
                )
            if t.apply_to_similar and row["merchant"]:
                updated += conn.execute(
                    "UPDATE transactions SET category_id = ?, categorized_by = 'you' "
                    "WHERE merchant = ? AND id != ? AND COALESCE(categorized_by,'') != 'you'",
                    (t.category_id, row["merchant"], tid),
                ).rowcount
        for field in ("notes", "description", "account"):
            v = getattr(t, field)
            if v is not None:
                conn.execute(f"UPDATE transactions SET {field} = ? WHERE id = ?", (v, tid))
        if t.amount is not None:
            conn.execute("UPDATE transactions SET amount = ? WHERE id = ?", (t.amount, tid))
        if t.date is not None:
            d = parsers.parse_date(t.date)
            if not d:
                raise HTTPException(400, "Invalid date.")
            conn.execute("UPDATE transactions SET date = ?, month = ? WHERE id = ?", (d, d[:7], tid))
    return {"ok": True, "updated": updated}


@app.delete("/api/transactions/{tid}")
def delete_transaction(tid: int):
    with db.tx() as conn:
        conn.execute("DELETE FROM transactions WHERE id = ?", (tid,))
    return {"ok": True}


# ---------------------------------------------------------------- uploads

def categorize_new(txns: list[dict]) -> tuple[list[dict], str | None]:
    """Fill in category_id + categorized_by on each txn: saved merchant rules first,
    then the AI, then keyword rules."""
    with db.tx() as conn:
        cats = db.rows(conn.execute("SELECT id, name, grp FROM categories"))
        rules = {r["merchant"]: r["category_id"] for r in conn.execute("SELECT merchant, category_id FROM merchant_rules")}
        examples = db.rows(conn.execute(
            "SELECT r.merchant, c.name AS category FROM merchant_rules r JOIN categories c ON c.id = r.category_id LIMIT 80"
        ))
    by_name = {c["name"]: c["id"] for c in cats}
    unc = by_name.get("Uncategorized")

    pending = []
    for i, t in enumerate(txns):
        t["merchant"] = budget.merchant_key(t["description"])
        if t["merchant"] in rules:
            t["category_id"], t["categorized_by"] = rules[t["merchant"]], "rule"
        else:
            pending.append(i)

    warning = None
    if pending and ai.enabled():
        # Ask about each distinct merchant once; apply the answer to all its rows.
        groups = defaultdict(list)
        for i in pending:
            groups[(txns[i]["merchant"], txns[i]["amount"] > 0)].append(i)
        items = []
        for n, idxs in enumerate(groups.values()):
            t = txns[idxs[0]]
            items.append({"index": n, "description": t["description"], "amount": t["amount"], "hint": t.get("hint")})
        try:
            answers = ai.categorize(items, cats, examples)
            for n, idxs in enumerate(groups.values()):
                if n in answers:
                    for i in idxs:
                        txns[i]["category_id"], txns[i]["categorized_by"] = by_name[answers[n]], "ai"
        except Exception as e:  # fall back to keywords, but tell the user why
            warning = f"AI categorization unavailable ({ai.describe_error(e)}); used keyword rules instead."

    for t in txns:
        if "category_id" not in t:
            name = keyword_category(t["description"], t["amount"])
            if t.get("hint"):
                hinted = keyword_category(t["hint"], t["amount"])
                if name == "Uncategorized" and hinted != "Uncategorized":
                    name = hinted
            t["category_id"], t["categorized_by"] = by_name.get(name, unc), "keyword"
    return txns, warning


@app.post("/api/upload")
async def upload(files: list[UploadFile] = File(...), account: str = Form(""), sign: str = Form("auto")):
    results = []
    for f in files:
        data = await f.read()
        name = f.filename or "statement"
        if len(data) > MAX_UPLOAD_BYTES:
            results.append({"file": name, "error": "File is larger than 25 MB."})
            continue
        ext = name.lower().rsplit(".", 1)[-1]
        warnings, method, acct = [], ext, account.strip() or None
        try:
            if ext in ("csv", "txt"):
                txns = parsers.parse_csv(data, sign)
            elif ext in ("xlsx", "xlsm"):
                txns = parsers.parse_xlsx(data, sign)
            elif ext == "pdf":
                pages = parsers.pdf_text(data)
                txns = None
                if ai.enabled():
                    try:
                        res = ai.extract_statement(pages, name)
                        txns = [{"date": parsers.parse_date(t["date"]), "description": t["description"],
                                 "amount": t["amount"], "hint": None} for t in res["transactions"]]
                        txns = [t for t in txns if t["date"]]
                        if sign == "purchases_positive":  # user override beats the AI's reading
                            txns = parsers.apply_sign(txns, "purchases_positive")
                        acct = acct or res["account"]
                        method = "pdf+ai"
                    except Exception as e:
                        warnings.append(f"AI couldn't read the PDF ({ai.describe_error(e)}); used the basic reader.")
                if txns is None:
                    txns = parsers.parse_pdf_regex(pages, sign)
                    method = "pdf"
            else:
                raise ValueError("Unsupported file type. Upload a CSV, Excel (.xlsx) or PDF statement.")
        except ValueError as e:
            results.append({"file": name, "error": str(e)})
            continue
        if not txns:
            results.append({"file": name, "error": "No transactions found in this file."})
            continue

        txns, warn = categorize_new(txns)
        if warn:
            warnings.append(warn)

        added = skipped = 0
        months = set()
        seen = defaultdict(int)
        with db.tx() as conn:
            up = conn.execute("INSERT INTO uploads (filename, account, method) VALUES (?, ?, ?)",
                              (name, acct or name, method)).lastrowid
            for t in txns:
                # Re-uploading the same statement is harmless: identical rows are skipped.
                base = f"{t['date']}|{t['amount']:.2f}|{' '.join(t['description'].upper().split())}"
                seen[base] += 1
                h = hashlib.sha1(f"{base}|{seen[base]}".encode()).hexdigest()
                cur = conn.execute(
                    "INSERT OR IGNORE INTO transactions (date, month, description, merchant, amount, category_id,"
                    " account, upload_id, categorized_by, hash) VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (t["date"], t["date"][:7], t["description"], t["merchant"], round(t["amount"], 2),
                     t["category_id"], acct or name, up, t["categorized_by"], h),
                )
                if cur.rowcount:
                    added += 1
                    months.add(t["date"][:7])
                else:
                    skipped += 1
            conn.execute("UPDATE uploads SET added = ?, skipped = ? WHERE id = ?", (added, skipped, up))
            if not added:
                conn.execute("DELETE FROM uploads WHERE id = ?", (up,))
        by = defaultdict(int)
        for t in txns:
            by[t["categorized_by"]] += 1
        results.append({"file": name, "added": added, "skipped": skipped, "months": sorted(months),
                        "method": method, "categorized_by": dict(by), "warnings": warnings})
    return {"results": results}


@app.get("/api/uploads")
def list_uploads():
    with db.tx() as conn:
        return db.rows(conn.execute(
            "SELECT u.*, MIN(t.date) AS first_date, MAX(t.date) AS last_date FROM uploads u "
            "LEFT JOIN transactions t ON t.upload_id = u.id GROUP BY u.id ORDER BY u.id DESC"
        ))


@app.delete("/api/uploads/{uid}")
def delete_upload(uid: int):
    with db.tx() as conn:
        n = conn.execute("DELETE FROM transactions WHERE upload_id = ?", (uid,)).rowcount
        conn.execute("DELETE FROM uploads WHERE id = ?", (uid,))
    return {"ok": True, "deleted": n}


@app.post("/api/demo")
def demo():
    import demo as demo_mod
    return {"added": demo_mod.load_demo()}


@app.delete("/api/all-data")
def reset_all():
    with db.tx() as conn:
        for table in ("transactions", "uploads", "budgets", "group_budgets", "merchant_rules", "chat_messages"):
            conn.execute(f"DELETE FROM {table}")
    return {"ok": True}


# ---------------------------------------------------------------- AI chat

@app.get("/api/chat")
def chat_history(month: str):
    with db.tx() as conn:
        return db.rows(conn.execute(
            "SELECT role, content, created_at FROM chat_messages WHERE month = ? ORDER BY id", (month,)
        ))


@app.delete("/api/chat")
def chat_clear(month: str):
    with db.tx() as conn:
        conn.execute("DELETE FROM chat_messages WHERE month = ?", (month,))
    return {"ok": True}


class ChatIn(BaseModel):
    month: str
    message: str


@app.post("/api/chat")
def chat(c: ChatIn):
    question = c.message.strip()
    if not question:
        raise HTTPException(400, "Empty message.")
    history = chat_history(c.month)[-20:]
    context = budget.chat_context(c.month)

    def gen():
        parts = []
        try:
            for piece in ai.chat_stream(context, history, question):
                parts.append(piece)
                yield piece
        except Exception as e:
            msg = ai.describe_error(e)
            parts.append(msg)
            yield msg
            return  # don't save failed exchanges
        with db.tx() as conn:
            conn.executemany(
                "INSERT INTO chat_messages (month, role, content) VALUES (?, ?, ?)",
                [(c.month, "user", question), (c.month, "assistant", "".join(parts))],
            )

    return StreamingResponse(gen(), media_type="text/plain; charset=utf-8")


# ---------------------------------------------------------------- exports

def _slug(month: str) -> str:
    return f"{family_name().replace(' ', '-')}-budget-{month}"


@app.get("/api/export/pdf")
def export_pdf(month: str):
    return Response(exports.pdf_summary(month, family_name()), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{_slug(month)}.pdf"'})


@app.get("/api/export/xlsx")
def export_xlsx(month: str):
    return Response(exports.xlsx(month),
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="{_slug(month)}.xlsx"'})


@app.get("/api/export/csv")
def export_csv(month: str | None = None):
    name = _slug(month) if month else f"{family_name()}-all-transactions"
    return Response(exports.csv_bytes(exports.transaction_rows(month)), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{name}-transactions.csv"'})


@app.post("/api/export/gsheets")
def export_gsheets(month: str):
    if not exports.google_sheets_configured():
        raise HTTPException(400, "Google Sheets isn't connected. See README → Google Sheets.")
    try:
        url = exports.export_google_sheet(month, db.get_setting("google_share_email") or None, family_name())
    except Exception as e:
        raise HTTPException(502, f"Google Sheets export failed: {e}")
    return {"url": url}


# ---------------------------------------------------------------- frontend

app.mount("/static", StaticFiles(directory=STATIC), name="static")


@app.get("/")
def index():
    return FileResponse(os.path.join(STATIC, "index.html"))


@app.exception_handler(Exception)
async def unhandled(_request: Request, exc: Exception):
    return JSONResponse({"detail": f"Unexpected error: {exc}"}, status_code=500)


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    host = os.environ.get("HOST", "127.0.0.1")
    print(f"\n  Family Budget is running → http://localhost:{port}\n")
    uvicorn.run(app, host=host, port=port)
