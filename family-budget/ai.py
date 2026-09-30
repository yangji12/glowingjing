"""Claude-powered helpers: statement extraction, categorization and the budget chat.

The app works without an API key (keyword rules + regex PDF parsing); adding a
key in Settings or ANTHROPIC_API_KEY turns these on.
"""

import json
import os
from typing import Iterator, Literal

import anthropic
from pydantic import BaseModel

import db

MODEL = "claude-opus-5-5"
# Server-side fallback: if a request is declined, the API retries it on a
# suitable fallback model within the same call.
BETAS = ["server-side-fallback-2026-07-01"]
FALLBACKS = "default"


class AIUnavailable(RuntimeError):
    pass


def api_key() -> str | None:
    return db.get_setting("anthropic_api_key") or os.environ.get("ANTHROPIC_API_KEY")


def enabled() -> bool:
    return bool(api_key())


def client() -> anthropic.Anthropic:
    key = api_key()
    if not key:
        raise AIUnavailable("Add your Anthropic API key in Settings to turn on AI features.")
    return anthropic.Anthropic(api_key=key)


def _check(message) -> None:
    if message.stop_reason == "refusal":
        raise AIUnavailable("The AI declined this request.")
    if message.stop_reason == "max_tokens":
        raise AIUnavailable("The AI response was cut off (statement too long for one pass).")


# ---------------------------------------------------------------- extraction

class ExtractedTxn(BaseModel):
    date: str  # YYYY-MM-DD
    description: str
    amount: float  # negative = money out, positive = money in


class ExtractedStatement(BaseModel):
    account_name: str
    statement_type: Literal["checking", "savings", "credit_card", "other"]
    transactions: list[ExtractedTxn]


EXTRACT_SYSTEM = """You extract transactions from bank and credit-card statement text.
Return every individual transaction exactly once. Skip balances, subtotals, interest-rate
tables, rewards summaries, and marketing text.

Sign convention (critical): amount is NEGATIVE when money left the account holder
(purchases, bills, fees, withdrawals, checks written) and POSITIVE when money came in
(deposits, paychecks, refunds, credits). On a credit-card statement, purchases are
negative and payments to the card are positive.

Dates must be YYYY-MM-DD. When rows omit the year, infer it from the statement period
(a December-January statement spans two years). Keep descriptions as printed, trimmed."""


def extract_statement(pages: list[str], filename: str) -> dict:
    """Extract transactions from PDF page text, a few pages per request so long
    statements don't run past the output limit."""
    c = client()
    chunks, cur = [], ""
    for i, page in enumerate(pages):
        piece = f"\n--- page {i + 1} ---\n{page}"
        if cur and len(cur) + len(piece) > 12000:
            chunks.append(cur)
            cur = ""
        cur += piece
    if cur.strip():
        chunks.append(cur)
    if not chunks:
        raise ValueError("This PDF has no readable text (it may be a scanned image).")

    header = pages[0][:3000]
    account, stype, txns = filename, "other", []
    for n, chunk in enumerate(chunks):
        context = "" if n == 0 else f"First page of the statement, for context:\n{header}\n\n"
        with c.beta.messages.stream(
            model=MODEL,
            max_tokens=32000,
            betas=BETAS,
            fallbacks=FALLBACKS,
            output_config={"effort": "low"},
            system=EXTRACT_SYSTEM,
            messages=[{
                "role": "user",
                "content": f"{context}Statement file: {filename}\nPart {n + 1} of {len(chunks)}:\n{chunk}",
            }],
            output_format=ExtractedStatement,
        ) as stream:
            message = stream.get_final_message()
        _check(message)
        parsed = message.parsed_output
        if n == 0:
            account, stype = parsed.account_name or filename, parsed.statement_type
        txns.extend(t.model_dump() for t in parsed.transactions)
    return {"account": account, "statement_type": stype, "transactions": txns}


# ---------------------------------------------------------------- categorization

class Assignment(BaseModel):
    index: int
    category: str


class Assignments(BaseModel):
    assignments: list[Assignment]


def categorize(items: list[dict], categories: list[dict], examples: list[dict]) -> dict[int, str]:
    """items: [{"index", "description", "amount", "hint"}]. Returns index -> category name."""
    c = client()
    cat_lines = "\n".join(f"- {x['name']} ({x['grp']})" for x in categories)
    ex_lines = "\n".join(f"- {e['merchant']} -> {e['category']}" for e in examples[:80])
    system = f"""You categorize household bank transactions for a family budget.
Pick exactly one category name from this list, spelled exactly as written:
{cat_lines}

Guidance:
- Positive amounts are money coming in; use an income category unless it is clearly a
  refund of a purchase (then use the purchase's category) or a payment/transfer.
- Payments to a credit card and moves between the family's own accounts are transfers
  ("Credit Card Payment", "Transfer", "Savings Transfer"), never expenses.
- The bank's own category hint, when present, is a clue but not authoritative.
- Use "Uncategorized" only when you genuinely cannot tell.
""" + (f"\nThe family has previously categorized these merchants (follow them):\n{ex_lines}\n" if ex_lines else "")

    names = {x["name"] for x in categories}
    result: dict[int, str] = {}
    for start in range(0, len(items), 150):
        batch = items[start:start + 150]
        lines = "\n".join(
            f"{it['index']}. {it['description']} | {it['amount']:+.2f}"
            + (f" | bank category: {it['hint']}" if it.get("hint") else "")
            for it in batch
        )
        message = c.beta.messages.parse(
            model=MODEL,
            max_tokens=16000,
            betas=BETAS,
            fallbacks=FALLBACKS,
            output_config={"effort": "low"},
            system=system,
            messages=[{"role": "user", "content": f"Categorize each transaction:\n{lines}"}],
            output_format=Assignments,
        )
        _check(message)
        for a in message.parsed_output.assignments:
            if a.category in names:
                result[a.index] = a.category
    return result


# ---------------------------------------------------------------- chat

CHAT_SYSTEM = """You are the family's friendly, practical budgeting assistant inside their
budget app. You can see this month's budget (planned vs. actual by category), recent
months' totals, and the month's transactions.

- Answer from the data provided; quote real numbers and category names. If the data
  doesn't cover something, say so rather than guessing.
- Keep answers short and scannable: a one-line takeaway, then a few bullets. Use
  markdown bold for key numbers.
- When suggesting savings, be specific (which category, how much, what to try).
- You are not a licensed financial advisor; for tax, investment or legal decisions,
  suggest a professional briefly, without lecturing.
- Transfers and credit-card payments are excluded from spending totals."""


def chat_stream(context: str, history: list[dict], question: str) -> Iterator[str]:
    c = client()
    messages = [
        {"role": "user", "content": f"<budget_data>\n{context}\n</budget_data>\n\nI'll ask questions about this."},
        {"role": "assistant", "content": "Got it — I have your budget data. What would you like to know?"},
    ]
    messages += [{"role": m["role"], "content": m["content"]} for m in history]
    messages.append({"role": "user", "content": question})
    with c.beta.messages.stream(
        model=MODEL,
        max_tokens=8000,
        betas=BETAS,
        fallbacks=FALLBACKS,
        output_config={"effort": "low"},
        system=CHAT_SYSTEM,
        messages=messages,
    ) as stream:
        for text in stream.text_stream:
            yield text
        final = stream.get_final_message()
    if final.stop_reason == "refusal":
        yield "\n\n_(The assistant couldn't answer that one.)_"


def describe_error(e: Exception) -> str:
    if isinstance(e, AIUnavailable):
        return str(e)
    if isinstance(e, anthropic.AuthenticationError):
        return "Your Anthropic API key was rejected. Check it in Settings."
    if isinstance(e, anthropic.RateLimitError):
        return "The AI is rate-limited right now. Try again in a minute."
    if isinstance(e, anthropic.APIConnectionError):
        return "Couldn't reach the AI service. Check your internet connection."
    if isinstance(e, anthropic.APIStatusError):
        return f"AI service error ({e.status_code})."
    return f"AI error: {e}"
