# ResearchMind — AI Research Design Partner

A CLI research advisor powered by Claude, specialized in academic research design for Marketing, Advertising, Communication, HCI, and Computational Social Science.

## What It Does

ResearchMind acts as a senior methodological advisor — direct, opinionated, and intellectually rigorous. It provides four capabilities:

1. **Research Design Advisor** — Given a research question, recommends the appropriate design family (experimental, computational, mixed methods, etc.) with claim-type classification, configuration options, and validity priorities.
2. **Paper Design Decoder** — Given a paper description, reverse-engineers the design logic, flags methodological threats, and identifies design-claim mismatches.
3. **Scale & Method Library** — Surfaces validated scales, instruments, and computational methods with references and design compatibility notes.
4. **Design Validation & Alarm System** — Stress-tests a proposed design with graded alarms (🚨 CRITICAL / ⚠️ WARNING) for threats before they reach reviewers.

The system always distinguishes research design (architectural strategy) from research method (tactical implementation). Design reasoning comes first; method choices are explained as consequences of design decisions.

## Prerequisites

- Python 3.9 or higher
- An Anthropic API key (get one at [console.anthropic.com](https://console.anthropic.com))

## Setup

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Set your API key:
   ```bash
   export ANTHROPIC_API_KEY="your-key-here"
   ```

## Usage

```bash
python chat.py
```

Type your research question and press Enter. Type `exit` or `quit` to end the session. The full conversation history is maintained for the duration of the session.

## Example Prompts

**Research Design Advisor:**
> "I want to study how AI-generated ads affect brand trust. What design should I use?"

**Paper Design Decoder:**
> "A paper used topic modeling on 200,000 tweets and claimed it showed that social media drove brand sentiment. What's the design and what are the threats?"

**Scale Library:**
> "What validated scales exist for measuring persuasion knowledge and advertising credibility?"

**Design Validation:**
> "I'm planning a 2x2 between-subjects online experiment on Prolific to test how deepfake ad disclosure affects purchase intention. What threats should I worry about?"

## Configuration

The model and token limit are set as constants at the top of `chat.py`:

```python
MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 8096
```

Change `MODEL` to `claude-opus-4-6` for the most capable model, or adjust `MAX_TOKENS` as needed.

The full system prompt lives in `prompt.py` as the `SYSTEM_PROMPT` constant and can be modified to adjust the advisor's scope, user context, or behavioral rules.
