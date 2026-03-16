"""
ResearchMind — AI Research Design Partner
Interactive CLI for multi-turn research design advising.

Usage:
    export ANTHROPIC_API_KEY="your-key-here"
    python chat.py
"""

import anthropic

from prompt import SYSTEM_PROMPT

MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 8096


def send_message(client: anthropic.Anthropic, history: list, user_text: str) -> str:
    """
    Append user_text to history, call the API, append the assistant reply,
    and return the reply text. On API error, removes the appended user message
    to keep history in a consistent state.
    """
    history.append({"role": "user", "content": user_text})
    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=SYSTEM_PROMPT,
            messages=history,
        )
        reply = response.content[0].text
        history.append({"role": "assistant", "content": reply})
        return reply
    except anthropic.APIError:
        history.pop()
        raise


def run_chat() -> None:
    """
    Main interactive loop. Reads from stdin, prints to stdout.
    Exits on 'exit'/'quit' command or KeyboardInterrupt/EOFError.
    """
    client = anthropic.Anthropic()
    history: list = []

    print("ResearchMind — AI Research Design Partner")
    print("Type 'exit' or 'quit' to end the session.")
    print("-" * 50)

    while True:
        try:
            user_input = input("\nYou: ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\n\nSession ended. Goodbye.")
            break

        if not user_input:
            continue

        if user_input.lower() in ("exit", "quit"):
            print("\nSession ended. Goodbye.")
            break

        try:
            reply = send_message(client, history, user_input)
            print(f"\nResearchMind: {reply}")
        except anthropic.AuthenticationError:
            print("\nError: Invalid API key. Set ANTHROPIC_API_KEY and restart.")
            break
        except anthropic.RateLimitError:
            print("\nRate limit reached. Please wait a moment and try again.")
        except anthropic.APIError as e:
            print(f"\nAPI error: {e}. You can continue or type 'exit' to quit.")


if __name__ == "__main__":
    run_chat()
