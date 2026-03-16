"""
ResearchMind — AI Research Design Partner
Streamlit web interface.
"""

import streamlit as st
import anthropic

from prompt import SYSTEM_PROMPT

MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 8096

st.set_page_config(
    page_title="ResearchMind",
    page_icon="🔬",
    layout="wide",
)

st.title("🔬 ResearchMind")
st.caption("AI Research Design Partner — Senior Methodological Advisor")

# Sidebar: API key input
with st.sidebar:
    st.header("Setup")
    api_key = st.text_input(
        "Anthropic API Key",
        type="password",
        placeholder="sk-ant-...",
        help="Get your key at console.anthropic.com",
    )
    st.divider()
    st.markdown(
        """
**What ResearchMind does:**

1. **Research Design Advisor** — Recommends the right design for your RQ
2. **Paper Design Decoder** — Reverse-engineers a paper's methodology
3. **Scale & Method Library** — Surfaces validated scales and instruments
4. **Design Validation** — Flags threats before reviewers do

---
*Specializes in: Marketing, Advertising, Communication, HCI, Computational Social Science*
        """
    )
    if st.button("Clear conversation", use_container_width=True):
        st.session_state.messages = []
        st.rerun()

# Initialize conversation history
if "messages" not in st.session_state:
    st.session_state.messages = []

# Display conversation history
for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])

# Welcome message when no conversation yet
if not st.session_state.messages:
    with st.chat_message("assistant"):
        st.markdown(
            "I'm your Research Design Partner. Direct, opinionated, and methodologically rigorous.\n\n"
            "Tell me your research question, describe a paper you want decoded, share a design you want stress-tested, "
            "or ask about a scale or method. What are you working on?"
        )

# Chat input
user_input = st.chat_input("Ask ResearchMind anything about your research design...")

if user_input:
    if not api_key:
        st.error("Please enter your Anthropic API key in the sidebar to continue.")
        st.stop()

    # Show user message
    with st.chat_message("user"):
        st.markdown(user_input)
    st.session_state.messages.append({"role": "user", "content": user_input})

    # Call the API
    with st.chat_message("assistant"):
        with st.spinner("Thinking..."):
            try:
                client = anthropic.Anthropic(api_key=api_key)
                response = client.messages.create(
                    model=MODEL,
                    max_tokens=MAX_TOKENS,
                    system=SYSTEM_PROMPT,
                    messages=st.session_state.messages,
                )
                reply = response.content[0].text
                st.markdown(reply)
                st.session_state.messages.append({"role": "assistant", "content": reply})
            except anthropic.AuthenticationError:
                st.error("Invalid API key. Please check the key you entered in the sidebar.")
                st.session_state.messages.pop()
            except anthropic.RateLimitError:
                st.error("Rate limit reached. Please wait a moment and try again.")
                st.session_state.messages.pop()
            except anthropic.APIError as e:
                st.error(f"API error: {e}")
                st.session_state.messages.pop()
