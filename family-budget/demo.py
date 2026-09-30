"""Demo data so the app can be explored before uploading a real statement.
Run `python demo.py sample.csv` to write an uncategorized sample statement."""

import csv
import random
import sys
from datetime import date

import budget
import db

PLAN = {
    "Paychecks": 14312, "Rent Income": 5000,
    "Mortgage": 4060, "Rent": 5500, "Gas & Electric": 180, "Internet & Cable": 86,
    "Child Tuition": 3127, "Insurance": 164, "Loan Payments": 153, "Child Activities": 400,
    "Shopping": 1000, "Groceries": 1000, "Restaurants & Bars": 1000, "Clothing": 400,
    "Coffee Shops": 300, "Gas": 150,
    "Travel & Vacation": 300, "Gifts & Donations": 100,
}

# (description, category, amount range, times per month)
PATTERNS = [
    ("ACME CORP PAYROLL DIRECT DEP", "Paychecks", (7156, 7156), 2),
    ("ZELLE FROM J MARTINEZ RENT", "Rent Income", (3500, 3500), 1),
    ("MR COOPER MORTGAGE PMT", "Mortgage", (4060, 4060), 1),
    ("AVALON APARTMENTS RENT", "Rent", (5500, 5500), 1),
    ("PG&E WEB ONLINE", "Gas & Electric", (110, 170), 1),
    ("COMCAST XFINITY", "Internet & Cable", (86, 86), 1),
    ("BRIGHT HORIZONS TUITION", "Child Tuition", (3127, 3127), 1),
    ("GEICO AUTO INSURANCE", "Insurance", (164, 164), 1),
    ("BAY AREA SOCCER CLUB", "Child Activities", (150, 600), 1),
    ("KUMON LEARNING CTR", "Child Activities", (180, 180), 1),
    ("AMAZON MKTPL*2K4L1", "Shopping", (15, 180), 7),
    ("TARGET T-1234", "Household", (25, 140), 2),
    ("WHOLE FOODS MKT #102", "Groceries", (40, 190), 4),
    ("TRADER JOE'S #551", "Groceries", (35, 120), 3),
    ("COSTCO WHSE #0144", "Groceries", (120, 320), 1),
    ("CHIPOTLE 2231", "Restaurants & Bars", (18, 42), 3),
    ("DOORDASH*SUSHI RAN", "Restaurants & Bars", (35, 90), 3),
    ("TST* NOPA KITCHEN", "Restaurants & Bars", (80, 190), 1),
    ("UNIQLO USA 1123", "Clothing", (40, 160), 2),
    ("NORDSTROM #0427", "Clothing", (60, 220), 1),
    ("STARBUCKS STORE 0921", "Coffee Shops", (6, 14), 8),
    ("SQ *BLUE BOTTLE COFFEE", "Coffee Shops", (6, 12), 5),
    ("CHEVRON 0098812", "Gas", (45, 70), 3),
    ("FASTRAK CSC", "Parking & Tolls", (20, 60), 1),
    ("SPOTHERO PARKING", "Parking & Tolls", (12, 30), 2),
    ("NETFLIX.COM", "Subscriptions", (22.99, 22.99), 1),
    ("SPOTIFY USA", "Subscriptions", (16.99, 16.99), 1),
    ("AMC THEATRES 2201", "Entertainment & Recreation", (30, 70), 1),
    ("CVS/PHARMACY #4432", "Medical & Pharmacy", (10, 60), 1),
    ("BART CLIPPER", "Public Transit", (2, 10), 1),
    ("ATM WITHDRAWAL 00123", "Cash & ATM", (100, 100), 1),
    ("CHASE CARD AUTOPAY", "Credit Card Payment", (2500, 4000), 1),
]


def _generate(month: str, rng: random.Random):
    y, m = map(int, month.split("-"))
    last_day = 28
    today = date.today()
    if (y, m) == (today.year, today.month):
        last_day = max(1, min(28, today.day))
    for desc, cat, (lo, hi), times in PATTERNS:
        for _ in range(times):
            amt = round(rng.uniform(lo, hi), 2)
            income = cat in ("Paychecks", "Rent Income")
            yield (date(y, m, rng.randint(1, last_day)).isoformat(), desc, amt if income else -amt, cat)


def load_demo() -> int:
    rng = random.Random(42)
    month = budget.current_month()
    months = [budget.shift_month(month, -i) for i in range(5, -1, -1)]
    added = 0
    with db.tx() as conn:
        cats = {r["name"]: r["id"] for r in conn.execute("SELECT id, name FROM categories")}
        up = conn.execute(
            "INSERT INTO uploads (filename, account, method, added) VALUES ('Demo data', 'Demo', 'demo', 0)"
        ).lastrowid
        for mo in months:
            for name, planned in PLAN.items():
                conn.execute(
                    "INSERT OR REPLACE INTO budgets (month, category_id, planned) VALUES (?, ?, ?)",
                    (mo, cats[name], planned),
                )
            conn.execute("INSERT OR REPLACE INTO group_budgets (month, grp, planned) VALUES (?, 'flexible', 3060)", (mo,))
            for i, (d, desc, amt, cat) in enumerate(_generate(mo, rng)):
                cur = conn.execute(
                    "INSERT OR IGNORE INTO transactions (date, month, description, merchant, amount, category_id,"
                    " account, upload_id, categorized_by, hash) VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (d, d[:7], desc, budget.merchant_key(desc), amt, cats[cat], "Demo", up, "demo",
                     f"demo|{mo}|{i}"),
                )
                added += cur.rowcount
        conn.execute("UPDATE uploads SET added = ? WHERE id = ?", (added, up))
    return added


def write_sample_csv(path: str) -> None:
    rng = random.Random(7)
    rows = sorted(_generate(budget.current_month(), rng))
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Transaction Date", "Description", "Amount"])
        for d, desc, amt, _ in rows:
            y, m, dd = d.split("-")
            w.writerow([f"{m}/{dd}/{y}", desc, f"{amt:.2f}"])


if __name__ == "__main__":
    write_sample_csv(sys.argv[1] if len(sys.argv) > 1 else "sample_statement.csv")
