"""Budget math shared by the API, the AI assistant and the exports."""

import re
from datetime import date

import db
from categories import GROUPS

EXPENSE_GROUPS = ("fixed", "flexible", "non_monthly")


def current_month() -> str:
    return date.today().strftime("%Y-%m")


def shift_month(month: str, n: int) -> str:
    y, m = map(int, month.split("-"))
    m += n
    y += (m - 1) // 12
    m = (m - 1) % 12 + 1
    return f"{y:04d}-{m:02d}"


def month_label(month: str) -> str:
    y, m = map(int, month.split("-"))
    return date(y, m, 1).strftime("%B %Y")


_NOISE = re.compile(
    r"\b(pos|debit|credit|card|purchase|recurring|payment|ach|web|online|pmt|checkcard|visa|"
    r"mastercard|sq|tst|pp|paypal|ref|id|des|indn|co|inc|llc|www|com)\b|[#*]|\d+",
    re.I,
)


def merchant_key(description: str) -> str:
    """Normalize a statement description to a stable merchant key, e.g.
    'SQ *BLUE BOTTLE COFFEE #123 OAKLAND CA' -> 'BLUE BOTTLE COFFEE'."""
    s = _NOISE.sub(" ", description or "")
    s = re.sub(r"[^A-Za-z&' ]", " ", s)
    words = [w for w in s.upper().split() if len(w) > 1 or w == "&"]
    # Drop a trailing US state code
    if len(words) > 2 and len(words[-1]) == 2:
        words = words[:-1]
    return " ".join(words[:3]) or (description or "").upper()[:30]


def ensure_month_budget(conn, month: str) -> None:
    """A new month starts with the plan from the most recent month that has one."""
    if conn.execute("SELECT 1 FROM budgets WHERE month = ? LIMIT 1", (month,)).fetchone():
        return
    prev = conn.execute(
        "SELECT MAX(month) FROM budgets WHERE month < ?", (month,)
    ).fetchone()[0]
    if not prev:
        return
    conn.execute(
        "INSERT INTO budgets (month, category_id, planned) "
        "SELECT ?, category_id, planned FROM budgets WHERE month = ?",
        (month, prev),
    )
    conn.execute(
        "INSERT OR IGNORE INTO group_budgets (month, grp, planned) "
        "SELECT ?, grp, planned FROM group_budgets WHERE month = ?",
        (month, prev),
    )


def actual_sign(grp: str) -> int:
    # Income counts money in; everything else counts money out as positive spending.
    return 1 if grp == "income" else -1


def month_budget(month: str) -> dict:
    with db.tx() as conn:
        ensure_month_budget(conn, month)
        cats = db.rows(conn.execute(
            """
            SELECT c.id, c.name, c.emoji, c.grp, c.sort,
                   COALESCE(b.planned, 0) AS planned,
                   COALESCE(t.total, 0) AS total, COALESCE(t.n, 0) AS count
            FROM categories c
            LEFT JOIN budgets b ON b.category_id = c.id AND b.month = ?
            LEFT JOIN (SELECT category_id, SUM(amount) AS total, COUNT(*) AS n
                       FROM transactions WHERE month = ? GROUP BY category_id) t
                   ON t.category_id = c.id
            ORDER BY c.sort, c.name
            """,
            (month, month),
        ))
        group_planned = {
            r["grp"]: r["planned"]
            for r in conn.execute("SELECT grp, planned FROM group_budgets WHERE month = ?", (month,))
        }
        uncategorized = conn.execute(
            "SELECT COALESCE(SUM(amount),0), COUNT(*) FROM transactions WHERE month = ? AND category_id IS NULL",
            (month,),
        ).fetchone()

    groups = []
    for key, label in GROUPS:
        rows = []
        for c in cats:
            if c["grp"] != key:
                continue
            actual = round(actual_sign(key) * c["total"], 2)
            rows.append({
                "id": c["id"], "name": c["name"], "emoji": c["emoji"],
                "planned": round(c["planned"], 2), "actual": actual,
                "remaining": round(c["planned"] - actual, 2), "count": c["count"],
            })
        cat_planned = round(sum(r["planned"] for r in rows), 2)
        planned = group_planned.get(key, cat_planned)
        actual = round(sum(r["actual"] for r in rows), 2)
        groups.append({
            "key": key, "label": label, "categories": rows,
            "planned": round(planned, 2), "actual": actual,
            "remaining": round(planned - actual, 2),
            "group_planned_set": key in group_planned,
            "unallocated": round(planned - cat_planned, 2),
        })

    g = {x["key"]: x for x in groups}
    income_p, income_a = g["income"]["planned"], g["income"]["actual"]
    exp_p = round(sum(g[k]["planned"] for k in EXPENSE_GROUPS), 2)
    exp_a = round(sum(g[k]["actual"] for k in EXPENSE_GROUPS), 2)
    return {
        "month": month,
        "label": month_label(month),
        "groups": groups,
        "totals": {
            "income_planned": income_p, "income_actual": income_a,
            "income_remaining": round(income_p - income_a, 2),
            "expense_planned": exp_p, "expense_actual": exp_a,
            "expense_remaining": round(exp_p - exp_a, 2),
            "left_to_budget": round(income_p - exp_p, 2),
            "net_actual": round(income_a - exp_a, 2),
            "savings_rate": round((income_a - exp_a) / income_a * 100, 1) if income_a > 0 else None,
        },
        "uncategorized": {"amount": round(-uncategorized[0], 2), "count": uncategorized[1]},
    }


def trend(month: str, n: int = 6) -> list[dict]:
    months = [shift_month(month, -i) for i in range(n - 1, -1, -1)]
    with db.tx() as conn:
        data = db.rows(conn.execute(
            f"""
            SELECT t.month, c.grp, SUM(t.amount) AS total
            FROM transactions t JOIN categories c ON c.id = t.category_id
            WHERE t.month IN ({",".join("?" * len(months))})
            GROUP BY t.month, c.grp
            """,
            months,
        ))
    out = []
    for m in months:
        row = {"month": m, "label": month_label(m)[:3] + " " + m[2:4], "income": 0.0, "expenses": 0.0}
        for d in data:
            if d["month"] != m:
                continue
            if d["grp"] == "income":
                row["income"] += d["total"]
            elif d["grp"] in EXPENSE_GROUPS:
                row["expenses"] -= d["total"]
        row["income"], row["expenses"] = round(row["income"], 2), round(row["expenses"], 2)
        out.append(row)
    return out


def top_merchants(month: str, limit: int = 8) -> list[dict]:
    with db.tx() as conn:
        return db.rows(conn.execute(
            """
            SELECT COALESCE(t.merchant, t.description) AS merchant, -SUM(t.amount) AS total, COUNT(*) AS count
            FROM transactions t JOIN categories c ON c.id = t.category_id
            WHERE t.month = ? AND c.grp IN ('fixed','flexible','non_monthly')
            GROUP BY 1 HAVING total > 0 ORDER BY total DESC LIMIT ?
            """,
            (month, limit),
        ))


def transactions(month: str | None = None, category_id: int | None = None, q: str | None = None,
                 grp: str | None = None, uncategorized: bool = False) -> list[dict]:
    where, args = [], []
    if month:
        where.append("t.month = ?"); args.append(month)
    if category_id:
        where.append("t.category_id = ?"); args.append(category_id)
    if grp:
        where.append("c.grp = ?"); args.append(grp)
    if uncategorized:
        where.append("(t.category_id IS NULL OR c.name = 'Uncategorized')")
    if q:
        where.append("(t.description LIKE ? OR t.merchant LIKE ? OR t.notes LIKE ?)")
        args += [f"%{q}%"] * 3
    sql = f"""
        SELECT t.id, t.date, t.month, t.description, t.merchant, t.amount, t.account, t.notes,
               t.categorized_by, t.category_id, c.name AS category, c.emoji, c.grp
        FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
        {"WHERE " + " AND ".join(where) if where else ""}
        ORDER BY t.date DESC, t.id DESC
    """
    with db.tx() as conn:
        return db.rows(conn.execute(sql, args))


def chat_context(month: str) -> str:
    """Plain-text snapshot of the budget for the AI assistant."""
    b = month_budget(month)
    t = b["totals"]
    lines = [
        f"Month: {b['label']} (today is {date.today().isoformat()})",
        f"Income: planned ${t['income_planned']:,.0f}, actual ${t['income_actual']:,.0f}",
        f"Expenses (fixed+flexible+non-monthly): planned ${t['expense_planned']:,.0f}, actual ${t['expense_actual']:,.0f}",
        f"Left to budget (planned income - planned expenses): ${t['left_to_budget']:,.0f}",
        f"Actual net (income - expenses): ${t['net_actual']:,.0f}",
        "",
        "Category | group | planned | actual | remaining | #txns",
    ]
    for g in b["groups"]:
        for c in g["categories"]:
            if c["planned"] or c["actual"]:
                lines.append(f"{c['name']} | {g['label']} | {c['planned']:.0f} | {c['actual']:.2f} | {c['remaining']:.2f} | {c['count']}")
        lines.append(f"= {g['label']} total | planned {g['planned']:.0f} | actual {g['actual']:.2f}")
    lines += ["", "Last 6 months (income / expenses):"]
    lines += [f"{r['label']}: ${r['income']:,.0f} / ${r['expenses']:,.0f}" for r in trend(month)]
    txns = transactions(month)
    lines += ["", f"Transactions this month ({len(txns)}; negative = money out):"]
    for x in txns[:400]:
        lines.append(f"{x['date']} | {x['description'][:60]} | {x['amount']:.2f} | {x['category'] or 'Uncategorized'}")
    if len(txns) > 400:
        lines.append(f"... {len(txns) - 400} more not shown")
    return "\n".join(lines)
