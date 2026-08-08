# AI-Powered Citizen Service Assistant

> **Hackathon Project — Government Services Track**  
> A full-stack, production-ready AI assistant for Indian government citizen services, featuring confidence-based RAG escalation, a full-spectrum eligibility engine, multilingual support, voice input, and a live analytics dashboard.

---

## Quick Start

```bash
# 1. Clone / navigate to project directory
cd "d:\ai platform"

# 2. Create virtual environment
python -m venv venv
venv\Scripts\activate      # Windows
# source venv/bin/activate  # macOS/Linux

# 3. Install dependencies
pip install -r requirements.txt

# 4. Set your LLM API key (at least one)
set OPENAI_API_KEY=sk-...          # Windows CMD
# export OPENAI_API_KEY=sk-...     # macOS/Linux
# OR
set ANTHROPIC_API_KEY=sk-ant-...

# 5. Run the app
python app.py

# Open http://localhost:5000 in your browser
```

> **No LLM key?** The app still works — it returns the top-matching RAG chunk directly when no LLM is configured. Perfect for offline demos.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Browser)                                │
│                                                                          │
│  ┌─────────────┐  ┌────────────────┐  ┌──────────────────────────────┐  │
│  │ Service     │  │ Chat Panel     │  │ Eligibility Panel / Modal    │  │
│  │ Tiles       │  │ (NL input +    │  │ (Age / Income / Category /   │  │
│  │ (5 quick    │  │  voice input)  │  │  Marital Status → all 4      │  │
│  │  shortcuts) │  │                │  │  schemes evaluated)          │  │
│  └─────────────┘  └────────────────┘  └──────────────────────────────┘  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ Live Analytics Strip (Queries · Resolution % · Avg Time · Langs)  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────┬───────────────────────────────────────────────┘
                           │  HTTP (JSON)
                           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        BACKEND (Flask / Python)                          │
│                                                                          │
│  POST /api/chat ──────────────────────────────────────────────────────   │
│   │                                                                      │
│   ├─1─ Language Detection (langdetect)                                   │
│   │     └─ Not English → GoogleTranslator (deep-translator) → English    │
│   │                                                                      │
│   ├─2─ Intent Classification (keyword regex)                             │
│   │     ├─ eligibility_check → Nudge user to Eligibility Form            │
│   │     └─ general_query    → RAG Pipeline                               │
│   │                                                                      │
│   ├─3─ RAG Retrieval (sentence-transformers all-MiniLM-L6-v2 + numpy)   │
│   │     ├─ Embed query → cosine similarity over chunk embeddings         │
│   │     ├─ Top-3 chunks retrieved                                        │
│   │     └─ Confidence = max cosine score                                 │
│   │                                                                      │
│   ├─4─ Confidence Routing                                                │
│   │     ├─ >= 0.55 → LLM call (OpenAI gpt-4o-mini / Claude Haiku)       │
│   │     │              with strict "Answer only from context" prompt      │
│   │     └─ <  0.55 → Escalation (no LLM call)                           │
│   │                   → ticket_id generated → row in SQLite              │
│   │                                                                      │
│   └─5─ Translate response back → user's language                        │
│                                                                          │
│  POST /api/eligibility ───────────────────────────────────────────────   │
│   └─ Rules engine → ALL 4 schemes → eligible / not_eligible / partial   │
│                                                                          │
│  GET  /api/analytics ─────────────────────────────────────────────────   │
│   └─ Aggregates interactions table → live stats JSON                    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  SQLite DB (citizen_service.db)                                 │    │
│  │  ┌──────────────────┐   ┌───────────────────────────────────┐  │    │
│  │  │  interactions     │   │  escalations                      │  │    │
│  │  │  (every request)  │   │  (low-confidence escalations)     │  │    │
│  │  └──────────────────┘   └───────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Document Knowledge Base (/documents/*.md)                      │    │
│  │  Chunked at startup → Embedded → numpy array (in-memory)        │    │
│  │  birth_certificate_process.md  │  ration_card_guidelines.md    │    │
│  │  old_age_pension_scheme.md     │  income_tax_faq.md            │    │
│  │  widow_pension_scheme.md                                        │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Why This Design — Core Innovation

### 1. Confidence-Based Escalation (The Key Safety Mechanism)

Most chatbots either hallucinate or refuse. This system does neither.

The RAG pipeline computes a **cosine similarity confidence score** between the user's query embedding and the document chunk embeddings. This score is used as a strict gate:

| Confidence | Action |
|---|---|
| ≥ 0.55 | Send top-3 chunks + query to LLM with a "cite sources only" system prompt |
| < 0.55 | Do NOT call LLM. Generate escalation ticket. Log to database. |

**Why this matters for government services:**
- Citizens making decisions about pensions, ration cards, or taxes need *correct* information, not confident-sounding hallucinations.
- Every escalation creates a traceable ticket ID — fulfilling accountability requirements.
- The threshold (0.55) was chosen empirically for `all-MiniLM-L6-v2` on government document prose. Tune via the `CONFIDENCE_THRESHOLD` constant in `app.py`.

### 2. Full-Spectrum Eligibility Engine (Beyond a Simple Match)

Most eligibility checkers return a list of schemes you qualify for. This system evaluates **every scheme** and tells you:

- ✅ **Eligible** — You meet all criteria. Here are the exact next steps to apply.
- ❌ **Not Eligible** — You don't qualify. Here is the *specific* failed condition in plain language (e.g., "Age requirement not met: minimum 60 years, your age is 45 years").
- ⚠️ **Partially Eligible / Needs Info** — You may qualify but a required field was not provided. The system tells you *exactly* what information is missing.

This three-state output is what makes the tool genuinely useful rather than just informational. Citizens leave knowing not just what they qualify for but also *why* they don't qualify for other schemes and what to do about it.

### 3. Rejection Explanation Integration

Each document in the knowledge base contains a dedicated "Common Rejection Reasons" section with real-world rejection causes and remedies. This means users can ask natural-language questions like:
- *"Why was my ration card rejected?"*
- *"What happens if my application is rejected for incorrect Aadhaar?"*

And receive accurate, sourced answers drawn directly from official government guidance.

---

## API Reference

### `POST /api/chat`

**Request:**
```json
{
  "query": "How do I get a birth certificate?",
  "lang": "en",
  "session_id": "sess-abc123"
}
```

**Response:**
```json
{
  "response": "To obtain a birth certificate…",
  "source": "birth_certificate_process.md",
  "intent": "general_query",
  "confidence": 0.72,
  "escalated": false,
  "ticket_id": null
}
```

---

### `POST /api/eligibility`

**Request:**
```json
{
  "age": 65,
  "income": 80000,
  "category": "SC",
  "marital_status": "widowed",
  "session_id": "sess-abc123"
}
```

**Response:**
```json
{
  "results": [
    {
      "scheme": "Old Age Pension (IGNOAPS)",
      "description": "Monthly pension for elderly BPL citizens aged 60+.",
      "status": "eligible",
      "reason": null,
      "next_steps": ["Visit your Gram Panchayat…", "…"]
    },
    {
      "scheme": "Widow Pension (IGNWPS)",
      "description": "Monthly pension for widowed women from BPL households aged 40–79.",
      "status": "eligible",
      "reason": null,
      "next_steps": ["…"]
    },
    {
      "scheme": "BPL Ration Card (PHH/AAY)",
      "description": "Subsidised food grains under NFSA.",
      "status": "eligible",
      "reason": null,
      "next_steps": ["…"]
    },
    {
      "scheme": "Income Tax Rebate (Section 87A)",
      "description": "Zero tax liability for income ≤ ₹7 lakh (new regime).",
      "status": "eligible",
      "reason": "Your declared income is within the ₹7,00,000 threshold…",
      "next_steps": ["…"]
    }
  ]
}
```

---

### `GET /api/analytics`

**Response:**
```json
{
  "total_queries": 142,
  "resolution_rate": 87.3,
  "avg_response_time_ms": 1240.5,
  "top_5_topics": [
    {"topic": "ration_card", "count": 48},
    {"topic": "old_age_pension", "count": 35}
  ],
  "queries_by_language": {"en": 90, "hi": 32, "te": 20}
}
```

---

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI API key (uses `gpt-4o-mini`) | No (either or) |
| `ANTHROPIC_API_KEY` | Anthropic API key (uses `claude-3-haiku`) | No (either or) |
| `PORT` | Port to run Flask on (default: 5000) | No |
| `FLASK_DEBUG` | Set to `1` for debug mode | No |

---

## Production Scaling Path

This project is architected for easy production upgrades:

| Component | Demo (Current) | Production Upgrade |
|---|---|---|
| **Embedding Store** | numpy in-memory array | FAISS / Pinecone / Weaviate |
| **Database** | SQLite (`citizen_service.db`) | PostgreSQL / Cloud SQL |
| **Translation** | deep-translator (Google Translate free) | **Bhashini API** (Government of India's official multilingual NLP platform) |
| **Language Detection** | langdetect | Bhashini / custom model |
| **LLM** | OpenAI / Anthropic (cloud) | Fine-tuned model on gov docs; on-prem |
| **Auth** | None (demo) | Aadhaar-based SSO via DigiLocker / API Setu |
| **Analytics Dashboard** | Live analytics strip | Full admin dashboard with Grafana / Metabase |
| **Deployment** | `python app.py` | Docker + gunicorn + nginx + cloud run |
| **Document Updates** | Manual .md file replacement | CMS integration with re-embedding pipeline |
| **Escalation Routing** | Database log only | Integration with NIC helpdesk ticketing system |

### Bhashini Integration Note
Replace `deep-translator` with **Bhashini** (bhashini.gov.in) for production:
- Government-endorsed, covers 22 scheduled Indian languages
- Superior quality for technical/legal government text
- Available via API Setu (apisetu.gov.in)

```python
# Production swap: replace GoogleTranslator(...).translate() with:
# bhashini_translate(text, source_lang, target_lang, api_key=BHASHINI_KEY)
```

---

## File Structure

```
d:\ai platform\
├── app.py                          # Flask backend (all business logic)
├── requirements.txt                # Python dependencies
├── README.md                       # This file
├── citizen_service.db              # SQLite DB (auto-created on first run)
│
├── documents/                      # RAG knowledge base
│   ├── birth_certificate_process.md
│   ├── ration_card_guidelines.md
│   ├── old_age_pension_scheme.md
│   ├── income_tax_faq.md
│   └── widow_pension_scheme.md
│
├── templates/
│   └── index.html                  # Single-page frontend
│
└── static/
    ├── style.css                   # Government aesthetic CSS
    └── script.js                   # Chat, voice, eligibility, analytics JS
```

---

## Demo Script (For Judges)

**1. General NL Query**
> Type: *"What documents do I need for a ration card?"*
> → Shows RAG answer with source citation tag.

**2. Low-Confidence Escalation**
> Type: *"Can I get a pension from another country's government?"*
> → Confidence < 0.55 → Escalation with ticket ID (amber bubble).

**3. Multilingual**
> Select Hindi → Type: *"राशन कार्ड के लिए क्या करना होगा?"*
> → Detected as Hindi → translated → RAG → translated back to Hindi.

**4. Voice Input**
> Click 🎤 → Speak your question → auto-sends.

**5. Eligibility Check**
> Click "Check My Eligibility" tile → Enter: Age=65, Income=80000, Marital=Widowed
> → All 4 schemes shown with exact status and next steps.

**6. Rejection Reason Query**
> Type: *"Why would a ration card application be rejected?"*
> → Retrieves rejection reasons section from ration_card_guidelines.md.

**7. Live Analytics**
> Watch the top strip update in real time after every query.

---

*Built for hackathon demonstration. All government information sourced from official Ministry publications.*
