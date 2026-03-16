# ResearchMind — AI Research Design Partner

A web-based research design advisor powered by Claude. Specialized in academic research design for Marketing, Advertising, Communication, HCI, and Computational Social Science.

## What It Does

ResearchMind acts as a senior methodological advisor with four capabilities:

1. **Research Design Advisor** — Given a research question, recommends the right design with claim-type classification, configuration options, and validity priorities
2. **Paper Design Decoder** — Reverse-engineers any paper's methodology, flags threats, and identifies design-claim mismatches
3. **Scale & Method Library** — Surfaces validated scales, instruments, and computational methods with references
4. **Design Validation & Alarm System** — Stress-tests a proposed design with graded alarms (🚨 CRITICAL / ⚠️ WARNING) before reviewers see it

## Prerequisites

- Python 3.9 or higher
- An Anthropic API key — get one free at [console.anthropic.com](https://console.anthropic.com)

## Setup & Running

**1. Install dependencies** (one time only):
```bash
pip install -r requirements.txt
```

**2. Launch the web app:**
```bash
streamlit run app.py
```

**3. Open your browser** — Streamlit will automatically open [http://localhost:8501](http://localhost:8501)

**4. Enter your API key** in the sidebar and start chatting.

## Example Prompts

- *"I want to study how AI-generated ads affect brand trust. What design should I use?"*
- *"A paper used topic modeling on 200,000 tweets to claim social media drove brand sentiment. Decode the design and flag any threats."*
- *"What validated scales exist for measuring persuasion knowledge and advertising credibility?"*
- *"I'm planning a 2×2 between-subjects online experiment on Prolific to test deepfake ad effects. What threats should I worry about?"*

## Files

| File | Purpose |
|------|---------|
| `app.py` | Streamlit web interface |
| `prompt.py` | Full ResearchMind system prompt |
| `chat.py` | Optional CLI version |
| `requirements.txt` | Python dependencies |
