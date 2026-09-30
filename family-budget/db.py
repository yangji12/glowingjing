"""SQLite storage. Everything the app knows lives in one file (data/budget.db)."""

import os
import sqlite3
from contextlib import contextmanager

from categories import DEFAULT_CATEGORIES

DB_PATH = os.environ.get(
    "BUDGET_DB", os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "budget.db")
)

SCHEMA = """
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    emoji TEXT NOT NULL DEFAULT '',
    grp TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS budgets (
    month TEXT NOT NULL,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    planned REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (month, category_id)
);
CREATE TABLE IF NOT EXISTS group_budgets (
    month TEXT NOT NULL,
    grp TEXT NOT NULL,
    planned REAL NOT NULL,
    PRIMARY KEY (month, grp)
);
CREATE TABLE IF NOT EXISTS uploads (
    id INTEGER PRIMARY KEY,
    filename TEXT NOT NULL,
    account TEXT,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
    added INTEGER NOT NULL DEFAULT 0,
    skipped INTEGER NOT NULL DEFAULT 0,
    method TEXT
);
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY,
    date TEXT NOT NULL,
    month TEXT NOT NULL,
    description TEXT NOT NULL,
    merchant TEXT,
    amount REAL NOT NULL,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    account TEXT,
    notes TEXT,
    upload_id INTEGER REFERENCES uploads(id) ON DELETE CASCADE,
    categorized_by TEXT,
    hash TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_txn_month ON transactions(month);
CREATE TABLE IF NOT EXISTS merchant_rules (
    merchant TEXT PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY,
    month TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def tx():
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with tx() as conn:
        conn.executescript(SCHEMA)
        if conn.execute("SELECT COUNT(*) FROM categories").fetchone()[0] == 0:
            conn.executemany(
                "INSERT INTO categories (name, emoji, grp, sort) VALUES (?, ?, ?, ?)",
                [(n, e, g, i) for i, (n, e, g) in enumerate(DEFAULT_CATEGORIES)],
            )


def get_setting(key: str, default=None):
    with tx() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row and row["value"] is not None else default


def set_setting(key: str, value) -> None:
    with tx() as conn:
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )


def rows(cursor) -> list[dict]:
    return [dict(r) for r in cursor.fetchall()]
