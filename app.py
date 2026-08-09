# Flask backend — AI-Powered Citizen Service Assistant
# app.py  (Extended — v2 with Live Agent, Ticketing, Email, Name Matching)
#
# EXISTING APIs preserved:
#   POST /api/chat        → Multilingual NLU → Intent → RAG + Confidence routing
#   POST /api/eligibility → Rules engine evaluating ALL schemes
#   GET  /api/analytics   → Live stats from SQLite interaction log
#
# NEW APIs added:
#   POST /api/name-compare         → Name/initial mismatch detection & scoring
#   POST /api/ticket               → Create support ticket
#   GET  /api/ticket/<id>          → Get ticket details
#   POST /api/ticket/<id>/message  → Add message to ticket
#   POST /api/ticket/<id>/resolve  → Resolve ticket (agent)
#   POST /api/ticket/<id>/status   → Update ticket status (agent)
#   POST /api/escalate-to-agent    → AI→LiveAgent escalation
#   GET  /api/tickets              → All tickets (agent dashboard)
#   POST /api/agent/login          → Agent login
#   GET  /api/agent/status         → Check agent auth
#   GET  /api/email-config         → Get notification emails (agent)
#   POST /api/email-config         → Save notification emails (agent)
#   GET  /api/gov-source/<service> → Official government source metadata
#   GET  /agent                    → Agent dashboard page

# ── SSL fix for Windows corporate/ISP networks (must be BEFORE all imports)
import os as _os, ssl as _ssl
_os.environ.setdefault("CURL_CA_BUNDLE", "")
_os.environ.setdefault("REQUESTS_CA_BUNDLE", "")
_os.environ.setdefault("HF_HUB_DISABLE_SSL_VERIFY", "1")
try:
    _ssl._create_default_https_context = _ssl.create_unverified_context
except AttributeError:
    pass

import os
import re
import uuid
import time
import json
import logging
import sqlite3
import datetime
import threading
import hashlib
import functools
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Optional, Tuple

import numpy as np
from flask import Flask, request, jsonify, render_template, session
from flask_cors import CORS
from sentence_transformers import SentenceTransformer

# Load .env file if present
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ── Optional imports (graceful degradation) ──────────────────────────────────
try:
    from langdetect import detect as _langdetect, LangDetectException
    LANGDETECT_AVAILABLE = True
except ImportError:
    LANGDETECT_AVAILABLE = False

try:
    from deep_translator import GoogleTranslator
    TRANSLATOR_AVAILABLE = True
except ImportError:
    TRANSLATOR_AVAILABLE = False

try:
    import openai
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False

try:
    import anthropic as anthropic_sdk
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False

try:
    from flask_socketio import SocketIO, emit, join_room, leave_room, rooms
    SOCKETIO_AVAILABLE = True
except ImportError:
    SOCKETIO_AVAILABLE = False
    logging.warning("flask-socketio not installed — live agent chat disabled")

try:
    from flask_limiter import Limiter
    from flask_limiter.util import get_remote_address
    LIMITER_AVAILABLE = True
except ImportError:
    LIMITER_AVAILABLE = False

try:
    import bleach
    BLEACH_AVAILABLE = True
except ImportError:
    BLEACH_AVAILABLE = False

try:
    import certifi  # noqa
except ImportError:
    pass

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# ── Flask app ─────────────────────────────────────────────────────────────────
app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET", uuid.uuid4().hex)
app.config["JSON_SORT_KEYS"] = False
CORS(app, resources={r"/api/*": {"origins": "*"}})  # Allow Vercel frontend

# ── Socket.IO ─────────────────────────────────────────────────────────────────
if SOCKETIO_AVAILABLE:
    socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading",
                        logger=False, engineio_logger=False)
else:
    socketio = None

# ── Rate Limiter ──────────────────────────────────────────────────────────────
if LIMITER_AVAILABLE:
    limiter = Limiter(get_remote_address, app=app,
                      default_limits=["200 per day", "60 per hour"],
                      storage_uri="memory://")
else:
    limiter = None

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR      = Path(__file__).parent
DOCUMENTS_DIR = BASE_DIR / "documents"
DB_PATH       = BASE_DIR / "citizen_service.db"

# ── Thresholds ────────────────────────────────────────────────────────────────
CONFIDENCE_THRESHOLD = 0.55
TOP_K_CHUNKS = 3

# ── Sentence transformer ──────────────────────────────────────────────────────
_LOCAL_MODEL_PATH = BASE_DIR / "models" / "all-MiniLM-L6-v2"
_MODEL_ID = str(_LOCAL_MODEL_PATH) if _LOCAL_MODEL_PATH.exists() else "all-MiniLM-L6-v2"
logger.info("Loading sentence-transformer model from: %s", _MODEL_ID)
EMBED_MODEL = SentenceTransformer(_MODEL_ID)
logger.info("Model loaded successfully.")

CHUNKS: list[dict] = []
CHUNK_EMBEDDINGS: Optional[np.ndarray] = None

DEPT_MAP = {
    "birth":      "Civil Registration Department",
    "ration":     "Food & Civil Supplies Department",
    "pension":    "Social Welfare Department",
    "income tax": "Income Tax Department (CBDT)",
    "widow":      "Social Welfare Department",
    "default":    "Citizen Services Helpdesk",
}

# ══════════════════════════════════════════════════════════════════════════════
# GOVERNMENT SOURCE METADATA  (curated offline — no scraping)
# All URLs verified as official government portals (.gov.in).
# ══════════════════════════════════════════════════════════════════════════════

GOV_SOURCES = {
    "birth_certificate": {
        "department": "Ministry of Home Affairs — Office of Registrar General of India",
        "document":   "Registration of Births and Deaths Act, 1969 (amended 2023)",
        "url":        "https://crsorgi.gov.in",
        "portal":     "Civil Registration System (CRS) Online Portal",
        "last_verified": "2024-01-15",
        "contact":    "1800-11-1555 (Toll Free)",
        "source_type": "official",
    },
    "ration_card": {
        "department": "Ministry of Consumer Affairs, Food & Public Distribution — Department of Food & Public Distribution",
        "document":   "National Food Security Act, 2013 (NFSA) — PDS Control Order 2015",
        "url":        "https://nfsa.gov.in",
        "portal":     "NFSA Public Distribution System Portal",
        "last_verified": "2024-01-15",
        "contact":    "1967 / 1800-11-4000 (Toll Free)",
        "source_type": "official",
    },
    "old_age_pension": {
        "department": "Ministry of Rural Development — Department of Rural Development",
        "document":   "National Social Assistance Programme (NSAP) — IGNOAPS Guidelines",
        "url":        "https://nsap.nic.in",
        "portal":     "NSAP — National Social Assistance Programme Portal",
        "last_verified": "2024-01-15",
        "contact":    "1800-11-8002 (NSAP Helpline)",
        "source_type": "official",
    },
    "widow_pension": {
        "department": "Ministry of Rural Development — Department of Rural Development",
        "document":   "National Social Assistance Programme (NSAP) — IGNWPS Guidelines",
        "url":        "https://nsap.nic.in",
        "portal":     "NSAP — National Social Assistance Programme Portal",
        "last_verified": "2024-01-15",
        "contact":    "1800-11-8002 (NSAP Helpline)",
        "source_type": "official",
    },
    "income_tax": {
        "department": "Ministry of Finance — Central Board of Direct Taxes (CBDT)",
        "document":   "Income Tax Act, 1961 — Section 87A (Rebate of Income Tax)",
        "url":        "https://incometax.gov.in",
        "portal":     "Income Tax e-Filing Portal",
        "last_verified": "2024-01-15",
        "contact":    "1800-103-0025 / 1800-419-0025 (Toll Free)",
        "source_type": "official",
    },
    "pension_general": {
        "department": "Ministry of Rural Development",
        "document":   "NSAP Guidelines",
        "url":        "https://nsap.nic.in",
        "portal":     "NSAP Portal",
        "last_verified": "2024-01-15",
        "contact":    "1800-11-8002",
        "source_type": "official",
    },
    "general": {
        "department": "Ministry of Electronics & Information Technology",
        "document":   "India Government Portal",
        "url":        "https://india.gov.in",
        "portal":     "National Portal of India",
        "last_verified": "2024-01-15",
        "contact":    "1800-11-1555",
        "source_type": "official",
    },
}

OFFICIAL_DOMAINS = [
    ".gov.in", ".nic.in", "india.gov.in", "digilocker.gov.in",
    "uidai.gov.in", "nsap.nic.in", "incometax.gov.in", "nfsa.gov.in",
    "crsorgi.gov.in", "umang.gov.in", "pgportal.gov.in",
]

def get_gov_source(topic: str) -> dict:
    """Return government source metadata for a topic."""
    return GOV_SOURCES.get(topic, GOV_SOURCES["general"])

def is_official_source(url: str) -> bool:
    """Check if a URL belongs to an official government domain."""
    url_lower = url.lower()
    return any(domain in url_lower for domain in OFFICIAL_DOMAINS)


# ══════════════════════════════════════════════════════════════════════════════
# DATABASE
# ══════════════════════════════════════════════════════════════════════════════

def init_db() -> None:
    """Create all tables if they don't exist."""
    with sqlite3.connect(DB_PATH) as conn:
        # ── Original tables (unchanged) ─────────────────────────────────────
        conn.execute("""
            CREATE TABLE IF NOT EXISTS interactions (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id       TEXT,
                query            TEXT,
                lang             TEXT,
                intent           TEXT,
                confidence       REAL,
                response_time_ms INTEGER,
                resolved         INTEGER,
                topic            TEXT,
                created_at       TEXT DEFAULT (datetime('now'))
            )
        """)

        # ── Escalations / Support Tickets (extended) ────────────────────────
        conn.execute("""
            CREATE TABLE IF NOT EXISTS escalations (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                ticket_id        TEXT UNIQUE,
                session_id       TEXT,
                query            TEXT,
                department       TEXT,
                status           TEXT DEFAULT 'open',
                created_at       TEXT DEFAULT (datetime('now')),
                user_name        TEXT,
                user_email       TEXT,
                subject          TEXT,
                category         TEXT,
                priority         TEXT DEFAULT 'normal',
                ai_summary       TEXT,
                ai_resolution    TEXT,
                live_agent_status TEXT DEFAULT 'pending',
                assigned_agent   TEXT,
                resolution_notes TEXT,
                updated_at       TEXT DEFAULT (datetime('now'))
            )
        """)

        # Add new columns to escalations if they don't exist (migration)
        existing_cols = [row[1] for row in
                         conn.execute("PRAGMA table_info(escalations)").fetchall()]
        migrations = [
            ("user_name",         "ALTER TABLE escalations ADD COLUMN user_name TEXT"),
            ("user_email",        "ALTER TABLE escalations ADD COLUMN user_email TEXT"),
            ("subject",           "ALTER TABLE escalations ADD COLUMN subject TEXT"),
            ("category",          "ALTER TABLE escalations ADD COLUMN category TEXT"),
            ("priority",          "ALTER TABLE escalations ADD COLUMN priority TEXT DEFAULT 'normal'"),
            ("ai_summary",        "ALTER TABLE escalations ADD COLUMN ai_summary TEXT"),
            ("ai_resolution",     "ALTER TABLE escalations ADD COLUMN ai_resolution TEXT"),
            ("live_agent_status", "ALTER TABLE escalations ADD COLUMN live_agent_status TEXT DEFAULT 'pending'"),
            ("assigned_agent",    "ALTER TABLE escalations ADD COLUMN assigned_agent TEXT"),
            ("resolution_notes",  "ALTER TABLE escalations ADD COLUMN resolution_notes TEXT"),
            ("updated_at",        "ALTER TABLE escalations ADD COLUMN updated_at TEXT DEFAULT (datetime('now'))"),
        ]
        for col, sql in migrations:
            if col not in existing_cols:
                try:
                    conn.execute(sql)
                except Exception:
                    pass

        # ── Ticket Messages ─────────────────────────────────────────────────
        conn.execute("""
            CREATE TABLE IF NOT EXISTS ticket_messages (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                ticket_id   TEXT NOT NULL,
                sender_type TEXT NOT NULL,   -- 'user' | 'agent' | 'system' | 'ai'
                sender_name TEXT,
                message     TEXT NOT NULL,
                is_internal INTEGER DEFAULT 0,  -- 1 = internal note (agent only)
                created_at  TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (ticket_id) REFERENCES escalations(ticket_id)
            )
        """)

        # ── Live Agents ─────────────────────────────────────────────────────
        conn.execute("""
            CREATE TABLE IF NOT EXISTS live_agents (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                agent_id    TEXT UNIQUE,
                name        TEXT,
                email       TEXT,
                status      TEXT DEFAULT 'offline',  -- 'online'|'busy'|'offline'
                last_seen   TEXT DEFAULT (datetime('now'))
            )
        """)

        # ── Email Configuration ─────────────────────────────────────────────
        conn.execute("""
            CREATE TABLE IF NOT EXISTS email_config (
                id      INTEGER PRIMARY KEY AUTOINCREMENT,
                key     TEXT UNIQUE,
                value   TEXT
            )
        """)

        # ── Eligibility Checks (extended) ───────────────────────────────────
        conn.execute("""
            CREATE TABLE IF NOT EXISTS eligibility_checks (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id      TEXT,
                full_name       TEXT,
                aadhaar_name    TEXT,
                pan_name        TEXT,
                dob             TEXT,
                age             INTEGER,
                gender          TEXT,
                state           TEXT,
                district        TEXT,
                income          REAL,
                category        TEXT,
                marital_status  TEXT,
                name_match_score REAL,
                name_match_status TEXT,
                scheme_results  TEXT,   -- JSON
                created_at      TEXT DEFAULT (datetime('now'))
            )
        """)

        conn.commit()
    logger.info("Database initialised at %s", DB_PATH)


def db_connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def sanitize(text: str, max_len: int = 2000) -> str:
    """Sanitize user input — strip HTML tags, limit length."""
    if not text:
        return ""
    text = str(text).strip()
    if BLEACH_AVAILABLE:
        text = bleach.clean(text, tags=[], strip=True)
    text = text[:max_len]
    return text


# ══════════════════════════════════════════════════════════════════════════════
# AGENT AUTHENTICATION
# ══════════════════════════════════════════════════════════════════════════════

AGENT_SECRET = os.environ.get("AGENT_SECRET_KEY", "changeme-agent-secret-2026")

def make_agent_token(agent_id: str) -> str:
    payload = f"{agent_id}:{AGENT_SECRET}:{datetime.date.today()}"
    return hashlib.sha256(payload.encode()).hexdigest()

def verify_agent_token(token: str, agent_id: str) -> bool:
    return token == make_agent_token(agent_id)

def agent_required(f):
    """Decorator to protect agent-only endpoints."""
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        auth = request.headers.get("X-Agent-Token", "")
        agent_id = request.headers.get("X-Agent-ID", "")
        if not auth or not agent_id or not verify_agent_token(auth, agent_id):
            return jsonify({"error": "Unauthorized. Agent login required."}), 401
        return f(*args, **kwargs)
    return decorated


# ══════════════════════════════════════════════════════════════════════════════
# EMAIL SERVICE
# ══════════════════════════════════════════════════════════════════════════════

def get_notification_emails() -> list[str]:
    """Return configured support email addresses (env vars + DB)."""
    emails = []
    for i in range(1, 4):
        e = os.environ.get(f"SUPPORT_EMAIL_{i}", "").strip()
        if e and "@" in e:
            emails.append(e)
    # Also check DB config
    try:
        with db_connect() as conn:
            rows = conn.execute(
                "SELECT value FROM email_config WHERE key LIKE 'support_email_%'"
            ).fetchall()
            for row in rows:
                e = (row["value"] or "").strip()
                if e and "@" in e and e not in emails:
                    emails.append(e)
    except Exception:
        pass
    return emails[:3]


def _send_email_sync(to_addresses: list[str], subject: str, html_body: str, text_body: str):
    """Send email via SMTP. Called from a background thread."""
    smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER", "").strip()
    smtp_pass = os.environ.get("SMTP_PASS", "").strip()

    if not smtp_user or not smtp_pass:
        logger.warning("Email not configured — SMTP_USER/SMTP_PASS missing. Skipping email.")
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"Citizen Service Assistant <{smtp_user}>"
        msg["To"] = ", ".join(to_addresses)
        msg.attach(MIMEText(text_body, "plain", "utf-8"))
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, to_addresses, msg.as_string())
        logger.info("Email sent to %s | Subject: %s", to_addresses, subject)
        return True
    except Exception as exc:
        logger.error("Email send failed: %s", exc)
        return False


def send_email_async(to_addresses: list[str], subject: str, html_body: str, text_body: str = ""):
    if not to_addresses:
        return
    threading.Thread(
        target=_send_email_sync,
        args=(to_addresses, subject, html_body, text_body),
        daemon=True
    ).start()


def _ticket_email_html(ticket: dict, action: str = "created") -> tuple[str, str]:
    """Generate ticket notification email HTML and text."""
    tid = ticket.get("ticket_id", "N/A")
    status = ticket.get("status", "open").upper()
    priority = ticket.get("priority", "normal").upper()
    created = ticket.get("created_at", datetime.datetime.now().isoformat())[:19]
    user_name = ticket.get("user_name") or "Anonymous"
    user_email = ticket.get("user_email") or "Not provided"
    category = ticket.get("category") or "General"
    subject = ticket.get("subject") or ticket.get("query", "")[:80]
    query = ticket.get("query") or ""
    ai_summary = ticket.get("ai_summary") or "Not available"
    ai_resolution = ticket.get("ai_resolution") or "Not resolved by AI"
    dept = ticket.get("department") or "Citizen Services"
    resolution = ticket.get("resolution_notes") or ""

    if action == "resolved":
        email_subject = f"[Ticket #{tid}] Resolved — Citizen Service Assistant"
        action_label = "RESOLVED"
        action_color = "#2e7d32"
    elif action == "created":
        email_subject = f"[Ticket #{tid}] New Support Request"
        action_label = "NEW TICKET"
        action_color = "#1558d6"
    else:
        email_subject = f"[Ticket #{tid}] Status Update"
        action_label = status
        action_color = "#e65100"

    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>
  body{{font-family:Arial,sans-serif;background:#f5f7fa;margin:0;padding:20px}}
  .card{{background:#fff;border-radius:8px;max-width:600px;margin:0 auto;padding:0;border:1px solid #dde3ef;box-shadow:0 2px 8px rgba(0,0,0,.08)}}
  .header{{background:#003366;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0}}
  .header h1{{margin:0;font-size:1.2rem}}
  .badge{{display:inline-block;background:{action_color};color:#fff;border-radius:4px;padding:3px 10px;font-size:.75rem;font-weight:700;margin-top:6px}}
  .body{{padding:24px}}
  .row{{display:flex;gap:12px;margin-bottom:12px}}
  .label{{color:#718096;font-size:.8rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;min-width:140px}}
  .value{{color:#1a2744;font-size:.88rem;flex:1}}
  .section-title{{font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#003366;border-bottom:1.5px solid #e2e8f0;padding-bottom:4px;margin:18px 0 10px}}
  .footer{{background:#f0f4f9;padding:14px 24px;border-radius:0 0 8px 8px;font-size:.75rem;color:#718096;text-align:center}}
  pre{{background:#f8faff;border:1px solid #e2e8f0;border-radius:4px;padding:10px;font-size:.8rem;white-space:pre-wrap;word-break:break-word}}
</style></head>
<body>
<div class="card">
  <div class="header">
    <h1>🏛️ Citizen Service Assistant — Support Ticket</h1>
    <span class="badge">{action_label}</span>
  </div>
  <div class="body">
    <div class="section-title">Ticket Information</div>
    <div class="row"><span class="label">Ticket ID</span><span class="value"><strong>{tid}</strong></span></div>
    <div class="row"><span class="label">Status</span><span class="value">{status}</span></div>
    <div class="row"><span class="label">Priority</span><span class="value">{priority}</span></div>
    <div class="row"><span class="label">Department</span><span class="value">{dept}</span></div>
    <div class="row"><span class="label">Category</span><span class="value">{category}</span></div>
    <div class="row"><span class="label">Created</span><span class="value">{created}</span></div>

    <div class="section-title">User Information</div>
    <div class="row"><span class="label">Name</span><span class="value">{user_name}</span></div>
    <div class="row"><span class="label">Email</span><span class="value">{user_email}</span></div>

    <div class="section-title">Issue</div>
    <div class="row"><span class="label">Subject</span><span class="value">{subject}</span></div>
    <div class="row"><span class="label">Original Query</span><span class="value">{query[:500]}</span></div>

    <div class="section-title">AI Analysis</div>
    <div class="row"><span class="label">AI Summary</span><span class="value">{ai_summary[:500]}</span></div>
    <div class="row"><span class="label">AI Resolution</span><span class="value">{ai_resolution[:300]}</span></div>
    {f'<div class="section-title">Resolution</div><pre>{resolution}</pre>' if resolution else ''}
  </div>
  <div class="footer">
    This is an automated message from the Citizen Service Assistant.<br>
    For support, call: <strong>1800-11-1555</strong> (Toll Free)
  </div>
</div>
</body>
</html>"""

    text = (
        f"Ticket #{tid} — {action_label}\n"
        f"{'='*50}\n"
        f"Status: {status}  |  Priority: {priority}\n"
        f"Department: {dept}\n"
        f"Created: {created}\n\n"
        f"USER: {user_name} <{user_email}>\n\n"
        f"ISSUE:\n{query[:500]}\n\n"
        f"AI SUMMARY:\n{ai_summary[:400]}\n\n"
        f"AI RESOLUTION:\n{ai_resolution[:300]}\n"
        + (f"\nRESOLUTION:\n{resolution}\n" if resolution else "")
    )

    return email_subject, html, text


def send_ticket_notification(ticket: dict, action: str = "created"):
    """Send ticket email to all configured support addresses."""
    try:
        subject, html, text = _ticket_email_html(ticket, action)
        recipients = get_notification_emails()
        if recipients:
            send_email_async(recipients, subject, html, text)
        # Also notify the user if they provided email
        user_email = ticket.get("user_email", "").strip()
        if user_email and "@" in user_email:
            send_email_async([user_email], subject, html, text)
    except Exception as exc:
        logger.error("Failed to send ticket notification: %s", exc)


# ══════════════════════════════════════════════════════════════════════════════
# NAME MATCHING ENGINE  (Features 5, 6, 7)
# ══════════════════════════════════════════════════════════════════════════════

def _normalize_name(name: str) -> str:
    """Normalize a name for comparison: uppercase, strip, collapse spaces."""
    name = str(name).upper().strip()
    name = re.sub(r"[^A-Z\s]", "", name)   # keep only letters and spaces
    name = re.sub(r"\s+", " ", name).strip()
    return name

def _tokenize_name(name: str) -> list[str]:
    return [t for t in _normalize_name(name).split() if t]

def _levenshtein(s1: str, s2: str) -> int:
    """Compute Levenshtein distance between two strings."""
    m, n = len(s1), len(s2)
    dp = list(range(n + 1))
    for i in range(1, m + 1):
        prev = dp[:]
        dp[0] = i
        for j in range(1, n + 1):
            cost = 0 if s1[i-1] == s2[j-1] else 1
            dp[j] = min(dp[j] + 1, dp[j-1] + 1, prev[j-1] + cost)
    return dp[n]

def _token_similarity(tokens_a: list[str], tokens_b: list[str]) -> float:
    """
    Compute token-level similarity between two name token lists.
    Handles initials (single characters matching first letter of full token).
    """
    if not tokens_a or not tokens_b:
        return 0.0

    total_weight = 0.0
    matched_weight = 0.0

    # For each token in A, find the best match in B
    for ta in tokens_a:
        best = 0.0
        for tb in tokens_b:
            if ta == tb:
                score = 1.0
            elif len(ta) == 1 and tb.startswith(ta):
                # ta is an initial matching the start of tb
                score = 0.75
            elif len(tb) == 1 and ta.startswith(tb):
                # tb is an initial matching the start of ta
                score = 0.75
            else:
                max_len = max(len(ta), len(tb))
                dist = _levenshtein(ta, tb)
                score = max(0.0, 1.0 - dist / max_len)
            best = max(best, score)
        weight = 1.0  # each token has equal weight
        matched_weight += best * weight
        total_weight += weight

    return matched_weight / total_weight if total_weight > 0 else 0.0

def _detect_initial_pattern(tokens_a: list[str], tokens_b: list[str]) -> list[str]:
    """Return descriptions of initial abbreviations found between two token lists."""
    notes = []
    for i, ta in enumerate(tokens_a):
        for j, tb in enumerate(tokens_b):
            if len(ta) == 1 and len(tb) > 1 and tb.startswith(ta):
                notes.append(
                    f"Name A uses initial '{ta}' while Name B has full name '{tb}'"
                )
            elif len(tb) == 1 and len(ta) > 1 and ta.startswith(tb):
                notes.append(
                    f"Name B uses initial '{tb}' while Name A has full name '{ta}'"
                )
    return notes

def compare_names(name_a: str, name_b: str) -> dict:
    """
    Compare two names and return a detailed match analysis.
    Returns: {score, status, explanation, notes, is_initial_difference}
    """
    if not name_a or not name_b:
        return {
            "score": 0,
            "status": "unknown",
            "explanation": "One or both names are missing.",
            "notes": [],
            "is_initial_difference": False,
        }

    norm_a = _normalize_name(name_a)
    norm_b = _normalize_name(name_b)

    # Exact match
    if norm_a == norm_b:
        return {
            "score": 100,
            "status": "strong_match",
            "explanation": "The names are identical after normalization.",
            "notes": [],
            "is_initial_difference": False,
        }

    tokens_a = _tokenize_name(name_a)
    tokens_b = _tokenize_name(name_b)

    # Token-level similarity
    sim = _token_similarity(tokens_a, tokens_b)
    score = int(round(sim * 100))

    # Detect initial patterns
    initial_notes = _detect_initial_pattern(tokens_a, tokens_b)
    is_initial = len(initial_notes) > 0

    # Build explanation
    notes = []
    explanations = []

    if is_initial:
        notes.extend(initial_notes)
        explanations.append(
            "One name uses initials while the other uses the full name form. "
            "This is a common formatting difference and may represent the same legal name. "
            "Please verify both documents belong to the same individual."
        )

    # Check name order differences
    sorted_a = sorted(tokens_a)
    sorted_b = sorted(tokens_b)
    if sorted_a == sorted_b and tokens_a != tokens_b:
        notes.append("Names contain the same words but in different order.")
        explanations.append(
            "The name tokens are the same but arranged differently "
            "(e.g., first/last name transposed). Verify the name order on each document."
        )

    # Check extra/missing tokens
    set_a, set_b = set(tokens_a), set(tokens_b)
    only_in_a = set_a - set_b - {t for t in set_b if len(t) == 1}
    only_in_b = set_b - set_a - {t for t in set_a if len(t) == 1}
    if only_in_a:
        notes.append(f"Name A contains words not found in Name B: {', '.join(only_in_a)}")
    if only_in_b:
        notes.append(f"Name B contains words not found in Name A: {', '.join(only_in_b)}")

    # Determine status
    if score >= 85:
        status = "strong_match"
        if not explanations:
            explanations.append(
                "The names are highly similar. Minor formatting differences detected."
            )
    elif score >= 60:
        status = "potential_difference"
        if not explanations:
            explanations.append(
                "There are noticeable differences between the two names. "
                "Please verify both documents carefully before submitting an application."
            )
    else:
        status = "significant_mismatch"
        if not explanations:
            explanations.append(
                "The names are significantly different. This may indicate two different individuals "
                "or a significant data entry error. Please contact the relevant authority to correct "
                "your records before submitting an application."
            )

    return {
        "score": score,
        "status": status,
        "explanation": " ".join(explanations),
        "notes": notes,
        "is_initial_difference": is_initial,
        "name_a_normalized": norm_a,
        "name_b_normalized": norm_b,
    }


# ══════════════════════════════════════════════════════════════════════════════
# DOCUMENT LOADING AND CHUNKING  (unchanged from original)
# ══════════════════════════════════════════════════════════════════════════════

def chunk_text(text: str, chunk_size: int = 400, overlap: int = 80) -> list[str]:
    words = text.split()
    chunks = []
    start = 0
    while start < len(words):
        end = min(start + chunk_size, len(words))
        chunks.append(" ".join(words[start:end]))
        if end == len(words):
            break
        start += chunk_size - overlap
    return chunks


def load_and_embed_documents() -> None:
    global CHUNKS, CHUNK_EMBEDDINGS
    if not DOCUMENTS_DIR.exists():
        logger.warning("Documents directory not found: %s", DOCUMENTS_DIR)
        return
    md_files = list(DOCUMENTS_DIR.glob("*.md"))
    if not md_files:
        logger.warning("No .md files found in %s", DOCUMENTS_DIR)
        return
    all_chunks = []
    for md_path in md_files:
        try:
            text = md_path.read_text(encoding="utf-8")
            parts = chunk_text(text)
            for part in parts:
                all_chunks.append({"text": part, "source": md_path.name})
            logger.info("Loaded %d chunks from %s", len(parts), md_path.name)
        except Exception as exc:
            logger.error("Error reading %s: %s", md_path, exc)
    if not all_chunks:
        return
    logger.info("Embedding %d total chunks…", len(all_chunks))
    texts = [c["text"] for c in all_chunks]
    embeddings = EMBED_MODEL.encode(texts, show_progress_bar=False, normalize_embeddings=True)
    for i, chunk in enumerate(all_chunks):
        chunk["embedding"] = embeddings[i]
    CHUNKS = all_chunks
    CHUNK_EMBEDDINGS = embeddings
    logger.info("Embedding complete. %d chunks ready.", len(CHUNKS))


# ══════════════════════════════════════════════════════════════════════════════
# LANGUAGE DETECTION AND TRANSLATION  (unchanged)
# ══════════════════════════════════════════════════════════════════════════════

LANG_CODE_MAP = {"en": "english", "hi": "hindi", "te": "telugu"}

def detect_language(text: str) -> str:
    if not LANGDETECT_AVAILABLE or not text.strip():
        return "en"
    try:
        detected = _langdetect(text)
        if detected == "hi": return "hi"
        if detected == "te": return "te"
        return "en"
    except LangDetectException:
        return "en"

def translate_to_english(text: str, source_lang: str) -> str:
    if source_lang == "en" or not TRANSLATOR_AVAILABLE:
        return text
    try:
        src = LANG_CODE_MAP.get(source_lang, "auto")
        return GoogleTranslator(source=src, target="english").translate(text) or text
    except Exception as exc:
        logger.error("Translation to English failed: %s", exc)
        return text

def translate_from_english(text: str, target_lang: str) -> str:
    if target_lang == "en" or not TRANSLATOR_AVAILABLE:
        return text
    try:
        tgt = LANG_CODE_MAP.get(target_lang, "english")
        return GoogleTranslator(source="english", target=tgt).translate(text) or text
    except Exception as exc:
        logger.error("Translation from English failed: %s", exc)
        return text


# ══════════════════════════════════════════════════════════════════════════════
# INTENT CLASSIFICATION  (unchanged)
# ══════════════════════════════════════════════════════════════════════════════

ELIGIBILITY_KEYWORDS = [
    r"\beligib", r"\bqualif", r"\bdo i get\b", r"\bam i entitl",
    r"\bcan i apply\b", r"\bcan i get\b", r"\bmy age\b", r"\bmy income\b",
    r"\bmy category\b", r"\bbpl\b", r"\bbelow poverty\b", r"\bsc\b.*\bst\b",
    r"\bcheck.*scheme", r"\bscheme.*for me\b", r"\bi am \d+ year",
    r"\beach.*\d+\s*rupee", r"\bearning.*rupee", r"\bmonthly income\b",
]

def classify_intent(query: str) -> str:
    q_lower = query.lower()
    for pattern in ELIGIBILITY_KEYWORDS:
        if re.search(pattern, q_lower):
            return "eligibility_check"
    return "general_query"

def extract_topic(query: str) -> str:
    q = query.lower()
    if any(w in q for w in ["birth", "certificate", "born", "child"]):
        return "birth_certificate"
    if any(w in q for w in ["ration", "bpl", "pds", "food", "grain"]):
        return "ration_card"
    if any(w in q for w in ["widow", "widowed", "husband died", "ignwps"]):
        return "widow_pension"
    if any(w in q for w in ["old age", "senior", "elderly", "ignoaps", "old pension"]):
        return "old_age_pension"
    if any(w in q for w in ["income tax", "itr", "tds", "pan", "refund", "80c", "deduction"]):
        return "income_tax"
    if any(w in q for w in ["pension", "monthly", "allowance"]):
        return "pension_general"
    return "general"

def get_department_for_topic(topic: str) -> str:
    mapping = {
        "birth_certificate": "Civil Registration Department",
        "ration_card":       "Food & Civil Supplies Department",
        "widow_pension":     "Social Welfare Department",
        "old_age_pension":   "Social Welfare Department",
        "income_tax":        "Income Tax Department (CBDT)",
        "pension_general":   "Social Welfare Department",
    }
    return mapping.get(topic, DEPT_MAP["default"])


# ══════════════════════════════════════════════════════════════════════════════
# RAG RETRIEVAL  (unchanged)
# ══════════════════════════════════════════════════════════════════════════════

def retrieve_chunks(query: str, top_k: int = TOP_K_CHUNKS) -> Tuple[list[dict], float]:
    if CHUNK_EMBEDDINGS is None or len(CHUNKS) == 0:
        return [], 0.0
    query_embedding = EMBED_MODEL.encode([query], normalize_embeddings=True)[0]
    similarities = np.dot(CHUNK_EMBEDDINGS, query_embedding)
    top_indices = np.argsort(similarities)[::-1][:top_k]
    results = [
        {"text": CHUNKS[idx]["text"], "source": CHUNKS[idx]["source"],
         "score": float(similarities[idx])}
        for idx in top_indices
    ]
    max_confidence = float(similarities[top_indices[0]]) if len(top_indices) > 0 else 0.0
    return results, max_confidence


# ══════════════════════════════════════════════════════════════════════════════
# LLM INTEGRATION  (unchanged)
# ══════════════════════════════════════════════════════════════════════════════

SYSTEM_PROMPT = (
    "You are a formal, professional government citizen service assistant for India. "
    "Answer ONLY from the provided document context. "
    "Be concise, accurate, and use formal government communication tone. "
    "Always cite the source filename at the end of your answer in brackets, e.g. [Source: ration_card_guidelines.md]. "
    "If the context does not contain enough information to answer the question fully, "
    "state clearly what is not covered rather than guessing. "
    "Do NOT add any information not present in the context. "
    "Format your response in clear paragraphs. Use numbered lists where steps are involved."
)

def call_llm(query: str, context_chunks: list[dict]) -> Tuple[str, Optional[str]]:
    context_text = "\n\n---\n\n".join(
        f"[Source: {c['source']}]\n{c['text']}" for c in context_chunks
    )
    user_message = f"Context:\n{context_text}\n\nCitizen's question: {query}"
    openai_key = os.environ.get("OPENAI_API_KEY", "").strip()
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()

    if openai_key and OPENAI_AVAILABLE:
        try:
            client = openai.OpenAI(api_key=openai_key)
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "system", "content": SYSTEM_PROMPT},
                          {"role": "user", "content": user_message}],
                max_tokens=600, temperature=0.1,
            )
            return response.choices[0].message.content.strip(), context_chunks[0]["source"] if context_chunks else None
        except Exception as exc:
            logger.error("OpenAI call failed: %s", exc)

    if anthropic_key and ANTHROPIC_AVAILABLE:
        try:
            client = anthropic_sdk.Anthropic(api_key=anthropic_key)
            message = client.messages.create(
                model="claude-3-haiku-20240307", max_tokens=600,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_message}],
            )
            return message.content[0].text.strip(), context_chunks[0]["source"] if context_chunks else None
        except Exception as exc:
            logger.error("Anthropic call failed: %s", exc)

    if context_chunks:
        best = context_chunks[0]
        snippet = best["text"][:800] + ("…" if len(best["text"]) > 800 else "")
        return (f"Based on our records:\n\n{snippet}\n\n[Source: {best['source']}]",
                best["source"])

    return ("I was unable to retrieve relevant information for your query at this time. "
            "Please contact the helpdesk for assistance.", None)


def generate_ai_summary(conversation_history: list[dict]) -> str:
    """Generate a brief AI handoff summary from a conversation history."""
    if not conversation_history:
        return "No conversation history available."
    lines = []
    for msg in conversation_history[-10:]:  # last 10 messages
        role = msg.get("role", "user").capitalize()
        text = str(msg.get("content", ""))[:200]
        lines.append(f"{role}: {text}")
    return "\n".join(lines)


# ══════════════════════════════════════════════════════════════════════════════
# ELIGIBILITY ENGINE  (unchanged from original)
# ══════════════════════════════════════════════════════════════════════════════

SCHEME_DEFINITIONS = {
    "Old Age Pension (IGNOAPS)": {
        "description": "Monthly pension for elderly BPL citizens aged 60+.",
        "official_url": "https://nsap.nic.in",
        "min_age": 60,
        "next_steps": [
            "Visit your Gram Panchayat (rural) or Ward Office (urban) to collect the application form.",
            "Attach: Aadhaar, age proof, BPL ration card, bank passbook (Aadhaar-linked), passport photo.",
            "Submit the completed form and note your acknowledgement number.",
            "A field verification will be conducted within 30 days.",
            "Pension is credited directly to your Aadhaar-linked bank account upon approval.",
        ],
    },
    "Widow Pension (IGNWPS)": {
        "description": "Monthly pension for widowed women from BPL households aged 40–79.",
        "official_url": "https://nsap.nic.in",
        "next_steps": [
            "Collect the application form from your Gram Panchayat / Ward Office.",
            "Attach: Aadhaar, husband's death certificate, age proof, BPL ration card, bank passbook (in your name, Aadhaar-linked), recent passport photo.",
            "Submit at the Gram Panchayat / Ward Office.",
            "A field verification officer will visit to confirm widowhood and address.",
            "Pension disbursement begins within 30–60 days of approval.",
        ],
    },
    "BPL Ration Card (PHH/AAY)": {
        "description": "Subsidised food grains under the National Food Security Act for BPL households.",
        "official_url": "https://nfsa.gov.in",
        "next_steps": [
            "Visit your state's Food & Civil Supplies portal or the nearest District Supply Office.",
            "Fill the ration card application form with all family member details and Aadhaar numbers.",
            "Attach: Aadhaar copies of all family members, income certificate, residence proof, recent photos.",
            "Submit the form and await field verification (within 30–45 days).",
            "Upon approval, your digital ration card will be available for download or physical collection from the FPS.",
        ],
    },
    "Income Tax Rebate (Section 87A)": {
        "description": "Zero income tax liability for individuals with taxable income up to ₹7 lakh (new regime) or ₹5 lakh (old regime).",
        "official_url": "https://incometax.gov.in",
        "next_steps": [
            "File your Income Tax Return (ITR) on incometax.gov.in.",
            "Select the new tax regime (default from FY 2023-24) if your income is ≤ ₹7 lakh.",
            "The system automatically applies the Section 87A rebate — no separate application needed.",
            "Ensure Aadhaar-PAN linking is complete before filing.",
            "E-verify your return using Aadhaar OTP after submission.",
        ],
    },
}

def _check_field_present(value, field_name: str):
    if value is None or str(value).strip() == "":
        return field_name
    return None

def evaluate_scheme_old_age_pension(age, income, category, marital_status):
    reasons_not_eligible, missing_fields = [], []
    missing = _check_field_present(age, "age")
    if missing:
        missing_fields.append("age (required to verify minimum 60-year criterion)")
    elif int(age) < 60:
        reasons_not_eligible.append(
            f"Age requirement not met: minimum 60 years required; your age is {age} years.")
    missing = _check_field_present(income, "income")
    if missing:
        missing_fields.append("annual income (required to assess BPL status)")
    else:
        try:
            income_val = float(str(income).replace(",", ""))
            if income_val > 100000:
                reasons_not_eligible.append(
                    f"Income exceeds BPL limit: annual household income must be ≤ ₹1,00,000; "
                    f"declared income is ₹{int(income_val):,}.")
        except ValueError:
            missing_fields.append("valid annual income figure")
    if missing_fields:
        return {"status": "partially_eligible",
                "reason": "Cannot confirm eligibility — missing: " + "; ".join(missing_fields) + "."}
    if reasons_not_eligible:
        return {"status": "not_eligible", "reason": " ".join(reasons_not_eligible)}
    return {"status": "eligible", "reason": None}

def evaluate_scheme_widow_pension(age, income, category, marital_status):
    reasons_not_eligible, missing_fields = [], []
    missing = _check_field_present(marital_status, "marital_status")
    if missing:
        missing_fields.append("marital status — required to verify widowhood")
    else:
        ms = str(marital_status).lower().strip()
        if ms not in ("widow", "widowed"):
            reasons_not_eligible.append(
                f"Marital status not eligible: this scheme is exclusively for widowed women. "
                f"Provided status: '{marital_status}'.")
    missing = _check_field_present(age, "age")
    if missing:
        missing_fields.append("age (required to verify 40–79-year range)")
    elif int(age) < 40:
        reasons_not_eligible.append(
            f"Age requirement not met: central IGNWPS requires minimum 40 years; your age is {age}.")
    elif int(age) >= 80:
        return {"status": "partially_eligible",
                "reason": f"Your age ({age}) is 80+. Transition to IGNOAPS (Old Age Pension) is recommended."}
    missing = _check_field_present(income, "income")
    if missing:
        missing_fields.append("annual income (required to assess BPL status)")
    else:
        try:
            income_val = float(str(income).replace(",", ""))
            if income_val > 100000:
                reasons_not_eligible.append(
                    f"Income exceeds BPL limit: ≤ ₹1,00,000 required; declared ₹{int(income_val):,}.")
        except ValueError:
            missing_fields.append("valid annual income figure")
    if missing_fields:
        return {"status": "partially_eligible",
                "reason": "Cannot confirm eligibility — missing: " + "; ".join(missing_fields) + "."}
    if reasons_not_eligible:
        return {"status": "not_eligible", "reason": " ".join(reasons_not_eligible)}
    return {"status": "eligible", "reason": None}

def evaluate_scheme_bpl_ration_card(age, income, category, marital_status):
    reasons_not_eligible, missing_fields = [], []
    missing = _check_field_present(income, "income")
    if missing:
        missing_fields.append("annual household income (required to determine BPL eligibility)")
    else:
        try:
            income_val = float(str(income).replace(",", ""))
            if income_val > 150000:
                reasons_not_eligible.append(
                    f"Income exceeds BPL threshold: typically ≤ ₹1,20,000–₹1,50,000; "
                    f"declared ₹{int(income_val):,}. You may qualify for APL ration card instead.")
        except ValueError:
            missing_fields.append("valid annual income figure")
    if missing_fields:
        return {"status": "partially_eligible",
                "reason": "Cannot confirm eligibility — missing: " + "; ".join(missing_fields) + "."}
    if reasons_not_eligible:
        return {"status": "not_eligible", "reason": " ".join(reasons_not_eligible)}
    return {"status": "eligible", "reason": None}

def evaluate_scheme_income_tax_rebate(age, income, category, marital_status):
    reasons_not_eligible, missing_fields = [], []
    missing = _check_field_present(income, "income")
    if missing:
        missing_fields.append("annual income (required to determine rebate eligibility)")
    else:
        try:
            income_val = float(str(income).replace(",", ""))
            if income_val > 700000:
                reasons_not_eligible.append(
                    f"Income exceeds rebate threshold: Section 87A rebate requires ≤ ₹7,00,000; "
                    f"declared ₹{int(income_val):,}.")
        except ValueError:
            missing_fields.append("valid annual income figure")
    if missing_fields:
        return {"status": "partially_eligible",
                "reason": "Cannot confirm eligibility — missing: " + "; ".join(missing_fields) + "."}
    if reasons_not_eligible:
        return {"status": "not_eligible", "reason": " ".join(reasons_not_eligible)}
    return {"status": "eligible",
            "reason": "Your declared income is within the ₹7,00,000 threshold under the new tax regime. "
                      "You qualify for the Section 87A rebate — your income tax liability is effectively zero."}

def run_eligibility_engine(age, income, category, marital_status) -> list[dict]:
    evaluators = [
        ("Old Age Pension (IGNOAPS)", evaluate_scheme_old_age_pension),
        ("Widow Pension (IGNWPS)",    evaluate_scheme_widow_pension),
        ("BPL Ration Card (PHH/AAY)", evaluate_scheme_bpl_ration_card),
        ("Income Tax Rebate (Section 87A)", evaluate_scheme_income_tax_rebate),
    ]
    results = []
    for scheme_name, evaluator in evaluators:
        result = evaluator(age, income, category, marital_status)
        scheme_info = SCHEME_DEFINITIONS[scheme_name]
        results.append({
            "scheme":       scheme_name,
            "description":  scheme_info["description"],
            "official_url": scheme_info.get("official_url", ""),
            "status":       result["status"],
            "reason":       result.get("reason"),
            "next_steps":   scheme_info["next_steps"] if result["status"] == "eligible" else [],
        })
    return results


# ══════════════════════════════════════════════════════════════════════════════
# DATABASE HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def log_interaction(session_id, query, lang, intent, confidence,
                    response_time_ms, resolved, topic):
    def _write():
        try:
            with sqlite3.connect(DB_PATH) as conn:
                conn.execute(
                    "INSERT INTO interactions "
                    "(session_id,query,lang,intent,confidence,response_time_ms,resolved,topic) "
                    "VALUES (?,?,?,?,?,?,?,?)",
                    (session_id, query, lang, intent, confidence,
                     response_time_ms, int(resolved), topic)
                )
                conn.commit()
        except Exception as exc:
            logger.error("Failed to log interaction: %s", exc)
    threading.Thread(target=_write, daemon=True).start()

def create_escalation(session_id, query, department):
    ticket_id = "TKT-" + uuid.uuid4().hex[:8].upper()
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute(
                "INSERT INTO escalations (ticket_id,session_id,query,department) VALUES (?,?,?,?)",
                (ticket_id, session_id, query, department)
            )
            conn.commit()
    except Exception as exc:
        logger.error("Failed to create escalation: %s", exc)
    return ticket_id

def get_ticket_dict(ticket_id: str) -> Optional[dict]:
    try:
        with db_connect() as conn:
            row = conn.execute(
                "SELECT * FROM escalations WHERE ticket_id = ?", (ticket_id,)
            ).fetchone()
            if row:
                return dict(row)
    except Exception as exc:
        logger.error("get_ticket_dict error: %s", exc)
    return None

def get_ticket_messages(ticket_id: str) -> list[dict]:
    try:
        with db_connect() as conn:
            rows = conn.execute(
                "SELECT * FROM ticket_messages WHERE ticket_id = ? AND is_internal = 0 "
                "ORDER BY created_at ASC",
                (ticket_id,)
            ).fetchall()
            return [dict(r) for r in rows]
    except Exception:
        return []

def add_ticket_message(ticket_id: str, sender_type: str, sender_name: str,
                       message: str, is_internal: bool = False) -> dict:
    msg_id = uuid.uuid4().hex[:8]
    created_at = datetime.datetime.now().isoformat()
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute(
                "INSERT INTO ticket_messages (ticket_id,sender_type,sender_name,message,is_internal,created_at) "
                "VALUES (?,?,?,?,?,?)",
                (ticket_id, sender_type, sender_name, message, int(is_internal), created_at)
            )
            conn.execute(
                "UPDATE escalations SET updated_at = ? WHERE ticket_id = ?",
                (created_at, ticket_id)
            )
            conn.commit()
    except Exception as exc:
        logger.error("add_ticket_message error: %s", exc)
    return {
        "id": msg_id, "ticket_id": ticket_id, "sender_type": sender_type,
        "sender_name": sender_name, "message": message,
        "is_internal": is_internal, "created_at": created_at,
    }


# ══════════════════════════════════════════════════════════════════════════════
# ROUTES — EXISTING (preserved exactly)
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/chat", methods=["POST"])
def chat():
    t_start = time.time()
    try:
        data = request.get_json(force=True, silent=True) or {}
    except Exception:
        data = {}

    query = sanitize(str(data.get("query", "")))
    lang_hint = str(data.get("lang", "")).strip().lower()
    session_id = str(data.get("session_id", uuid.uuid4().hex))

    if not query:
        return jsonify({"error": "Query cannot be empty."}), 400

    detected_lang = detect_language(query)
    user_lang = lang_hint if lang_hint in ("en", "hi", "te") else detected_lang
    english_query = translate_to_english(query, user_lang)
    intent = classify_intent(english_query)
    topic = extract_topic(english_query)

    # Build government source card for this topic
    gov_source = get_gov_source(topic)

    if intent == "eligibility_check":
        nudge_msg = (
            "It looks like you want to check your eligibility for a government scheme. "
            "Please use the **'Check My Eligibility'** form on this page — "
            "enter your age, income, and category, and I'll evaluate your profile against "
            "all available schemes, including what you qualify for and why you may not qualify for others."
        )
        translated_nudge = translate_from_english(nudge_msg, user_lang)
        elapsed_ms = int((time.time() - t_start) * 1000)
        log_interaction(session_id, query, user_lang, intent, 1.0, elapsed_ms, True, topic)
        return jsonify({
            "response": translated_nudge,
            "source": None,
            "intent": intent,
            "confidence": 1.0,
            "escalated": False,
            "ticket_id": None,
            "gov_source": gov_source,
            "source_verified": True,
        })

    chunks, confidence = retrieve_chunks(english_query)
    source_file = chunks[0]["source"] if chunks else None
    department = get_department_for_topic(topic)

    if confidence >= CONFIDENCE_THRESHOLD:
        answer_en, source_file = call_llm(english_query, chunks)
        answer = translate_from_english(answer_en, user_lang)
        escalated = False
        ticket_id = None
        resolved = True
        source_verified = True
    else:
        ticket_id = create_escalation(session_id, query, department)
        escalation_msg = (
            f"I do not have verified information on this specific query in my knowledge base. "
            f"To ensure you receive accurate and official information, your query has been forwarded "
            f"to the **{department}** helpdesk.\n\n"
            f"**Your Ticket ID: {ticket_id}**\n\n"
            f"A helpdesk officer will review your query and respond within 2–3 working days. "
            f"You may quote this ticket ID when following up. "
            f"Alternatively, you can call the **National Citizen Services Helpline: 1800-11-1555** (toll-free).\n\n"
            f"You can also **Connect to a Live Agent** using the button below for immediate assistance."
        )
        answer = translate_from_english(escalation_msg, user_lang)
        escalated = True
        resolved = False
        source_verified = False

    elapsed_ms = int((time.time() - t_start) * 1000)
    log_interaction(session_id, query, user_lang, intent, confidence, elapsed_ms, resolved, topic)

    return jsonify({
        "response": answer,
        "source": source_file,
        "intent": intent,
        "confidence": round(confidence, 3),
        "escalated": escalated,
        "ticket_id": ticket_id,
        "gov_source": gov_source,
        "source_verified": source_verified,
    })


@app.route("/api/eligibility", methods=["POST"])
def eligibility():
    t_start = time.time()
    try:
        data = request.get_json(force=True, silent=True) or {}
    except Exception:
        data = {}

    age           = data.get("age") or None
    income        = data.get("income") or None
    category      = data.get("category") or None
    marital_status = data.get("marital_status") or None
    session_id    = str(data.get("session_id", uuid.uuid4().hex))
    # New extended fields
    full_name     = sanitize(data.get("full_name", ""), 100)
    aadhaar_name  = sanitize(data.get("aadhaar_name", ""), 100)
    pan_name      = sanitize(data.get("pan_name", ""), 100)
    dob           = sanitize(data.get("dob", ""), 20)
    gender        = sanitize(data.get("gender", ""), 20)
    state         = sanitize(data.get("state", ""), 50)
    district      = sanitize(data.get("district", ""), 50)

    try:
        if age is not None:
            age = int(float(str(age).replace(",", "")))
            if age < 0 or age > 150:
                return jsonify({"error": "Invalid age value."}), 400
    except (ValueError, TypeError):
        return jsonify({"error": "Age must be a valid number."}), 400

    results = run_eligibility_engine(age, income, category, marital_status)

    # Name mismatch check
    name_match = None
    if aadhaar_name and pan_name:
        name_match = compare_names(aadhaar_name, pan_name)

    elapsed_ms = int((time.time() - t_start) * 1000)
    log_interaction(
        session_id,
        f"Eligibility check: age={age}, income={income}, category={category}",
        "en", "eligibility_check", 1.0, elapsed_ms, True, "eligibility"
    )

    # Store eligibility check
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute(
                "INSERT INTO eligibility_checks "
                "(session_id,full_name,aadhaar_name,pan_name,dob,age,gender,state,district,"
                "income,category,marital_status,name_match_score,name_match_status,scheme_results) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (session_id, full_name, aadhaar_name, pan_name, dob, age, gender, state, district,
                 income, category, marital_status,
                 name_match["score"] if name_match else None,
                 name_match["status"] if name_match else None,
                 json.dumps(results))
            )
            conn.commit()
    except Exception as exc:
        logger.error("Failed to store eligibility check: %s", exc)

    return jsonify({
        "results": results,
        "name_match": name_match,
        "profile": {
            "full_name": full_name,
            "state": state,
            "district": district,
            "gender": gender,
            "age": age,
            "income": income,
            "category": category,
            "marital_status": marital_status,
        }
    })


@app.route("/api/analytics", methods=["GET"])
def analytics():
    try:
        with db_connect() as conn:
            total = conn.execute("SELECT COUNT(*) as n FROM interactions").fetchone()["n"]
            resolved = conn.execute(
                "SELECT COUNT(*) as n FROM interactions WHERE resolved = 1"
            ).fetchone()["n"]
            resolution_rate = round((resolved / total * 100), 1) if total > 0 else 0.0
            avg_rt = conn.execute("SELECT AVG(response_time_ms) as avg FROM interactions").fetchone()["avg"]
            rows = conn.execute(
                "SELECT topic, COUNT(*) as cnt FROM interactions GROUP BY topic ORDER BY cnt DESC LIMIT 5"
            ).fetchall()
            top_5_topics = [{"topic": r["topic"], "count": r["cnt"]} for r in rows]
            lang_rows = conn.execute(
                "SELECT lang, COUNT(*) as cnt FROM interactions GROUP BY lang"
            ).fetchall()
            queries_by_language = {r["lang"]: r["cnt"] for r in lang_rows}
            # Ticket stats
            ticket_stats = {}
            for status in ("open", "in_progress", "waiting_for_user", "resolved", "closed"):
                n = conn.execute(
                    "SELECT COUNT(*) as n FROM escalations WHERE status = ?", (status,)
                ).fetchone()["n"]
                ticket_stats[status] = n
            ticket_stats["total"] = conn.execute(
                "SELECT COUNT(*) as n FROM escalations"
            ).fetchone()["n"]
        return jsonify({
            "total_queries":        total,
            "resolution_rate":      resolution_rate,
            "avg_response_time_ms": round(avg_rt or 0, 1),
            "top_5_topics":         top_5_topics,
            "queries_by_language":  queries_by_language,
            "ticket_stats":         ticket_stats,
        })
    except Exception as exc:
        logger.error("Analytics query failed: %s", exc)
        return jsonify({
            "total_queries": 0, "resolution_rate": 0.0,
            "avg_response_time_ms": 0.0, "top_5_topics": [],
            "queries_by_language": {}, "ticket_stats": {},
        })


# ══════════════════════════════════════════════════════════════════════════════
# ROUTES — NEW
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/api/name-compare", methods=["POST"])
def name_compare():
    """Feature 5/6/7: Compare two names and return a similarity score."""
    try:
        data = request.get_json(force=True, silent=True) or {}
    except Exception:
        data = {}
    name_a = sanitize(data.get("name_a", ""), 100)
    name_b = sanitize(data.get("name_b", ""), 100)
    if not name_a or not name_b:
        return jsonify({"error": "Both name_a and name_b are required."}), 400
    result = compare_names(name_a, name_b)
    return jsonify(result)


@app.route("/api/gov-source/<service>", methods=["GET"])
def gov_source(service: str):
    """Return official government source metadata for a service."""
    safe_service = re.sub(r"[^a-z_]", "", service.lower())
    source = get_gov_source(safe_service)
    return jsonify(source)


@app.route("/api/ticket", methods=["POST"])
def create_ticket():
    """Create a full support ticket with all metadata."""
    try:
        data = request.get_json(force=True, silent=True) or {}
    except Exception:
        data = {}

    ticket_id = "TKT-" + uuid.uuid4().hex[:8].upper()
    session_id   = sanitize(str(data.get("session_id", uuid.uuid4().hex)), 64)
    query        = sanitize(data.get("query", ""), 2000)
    user_name    = sanitize(data.get("user_name", ""), 100)
    user_email   = sanitize(data.get("user_email", ""), 100)
    subject      = sanitize(data.get("subject", query[:80]), 200)
    category     = sanitize(data.get("category", "general"), 50)
    priority     = data.get("priority", "normal")
    if priority not in ("low", "normal", "high", "urgent"):
        priority = "normal"
    ai_summary   = sanitize(data.get("ai_summary", ""), 2000)
    ai_resolution = sanitize(data.get("ai_resolution", ""), 2000)
    topic        = sanitize(data.get("topic", "general"), 50)
    department   = get_department_for_topic(topic)

    if not query and not subject:
        return jsonify({"error": "query or subject is required."}), 400

    now = datetime.datetime.now().isoformat()
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute(
                "INSERT INTO escalations "
                "(ticket_id,session_id,query,department,status,user_name,user_email,subject,"
                "category,priority,ai_summary,ai_resolution,live_agent_status,created_at,updated_at) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (ticket_id, session_id, query, department, "open",
                 user_name, user_email, subject, category, priority,
                 ai_summary, ai_resolution, "pending", now, now)
            )
            conn.commit()
    except Exception as exc:
        logger.error("create_ticket DB error: %s", exc)
        return jsonify({"error": "Failed to create ticket."}), 500

    # Add opening message
    if query:
        add_ticket_message(ticket_id, "user", user_name or "User", query)
    if ai_resolution:
        add_ticket_message(ticket_id, "ai", "AI Assistant",
                           f"AI attempted resolution:\n{ai_resolution}")

    ticket = get_ticket_dict(ticket_id)
    # Send email notifications
    send_ticket_notification(ticket, "created")

    return jsonify({"ticket_id": ticket_id, "ticket": ticket}), 201


@app.route("/api/ticket/<ticket_id>", methods=["GET"])
def get_ticket(ticket_id: str):
    """Get ticket details + messages."""
    ticket_id = re.sub(r"[^A-Z0-9\-]", "", ticket_id.upper())
    ticket = get_ticket_dict(ticket_id)
    if not ticket:
        return jsonify({"error": "Ticket not found."}), 404
    messages = get_ticket_messages(ticket_id)
    return jsonify({"ticket": ticket, "messages": messages})


@app.route("/api/ticket/<ticket_id>/message", methods=["POST"])
def post_ticket_message(ticket_id: str):
    """Add a message to a ticket (user-facing)."""
    ticket_id = re.sub(r"[^A-Z0-9\-]", "", ticket_id.upper())
    if not get_ticket_dict(ticket_id):
        return jsonify({"error": "Ticket not found."}), 404
    try:
        data = request.get_json(force=True, silent=True) or {}
    except Exception:
        data = {}
    message     = sanitize(data.get("message", ""), 2000)
    sender_type = data.get("sender_type", "user")
    sender_name = sanitize(data.get("sender_name", ""), 100)
    if sender_type not in ("user", "agent", "system", "ai"):
        sender_type = "user"
    if not message:
        return jsonify({"error": "message is required."}), 400

    msg = add_ticket_message(ticket_id, sender_type, sender_name, message)

    # Broadcast via Socket.IO if available
    if socketio and SOCKETIO_AVAILABLE:
        try:
            socketio.emit("new_message", msg, room=f"ticket_{ticket_id}")
        except Exception:
            pass

    return jsonify({"message": msg}), 201


@app.route("/api/ticket/<ticket_id>/resolve", methods=["POST"])
@agent_required
def resolve_ticket(ticket_id: str):
    """Resolve a ticket (agent only)."""
    ticket_id = re.sub(r"[^A-Z0-9\-]", "", ticket_id.upper())
    ticket = get_ticket_dict(ticket_id)
    if not ticket:
        return jsonify({"error": "Ticket not found."}), 404
    try:
        data = request.get_json(force=True, silent=True) or {}
    except Exception:
        data = {}
    resolution_notes = sanitize(data.get("resolution_notes", ""), 2000)
    agent_id = request.headers.get("X-Agent-ID", "")
    now = datetime.datetime.now().isoformat()
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute(
                "UPDATE escalations SET status='resolved', resolution_notes=?, "
                "assigned_agent=?, live_agent_status='resolved', updated_at=? "
                "WHERE ticket_id=?",
                (resolution_notes, agent_id, now, ticket_id)
            )
            conn.commit()
    except Exception as exc:
        logger.error("resolve_ticket error: %s", exc)
        return jsonify({"error": "Failed to resolve ticket."}), 500

    add_ticket_message(ticket_id, "agent", agent_id,
                       f"✅ Ticket resolved.\n\nResolution: {resolution_notes}", False)

    ticket = get_ticket_dict(ticket_id)
    send_ticket_notification(ticket, "resolved")

    if socketio and SOCKETIO_AVAILABLE:
        try:
            socketio.emit("ticket_resolved", {"ticket_id": ticket_id},
                          room=f"ticket_{ticket_id}")
        except Exception:
            pass

    return jsonify({"ticket": ticket})


@app.route("/api/ticket/<ticket_id>/status", methods=["POST"])
@agent_required
def update_ticket_status(ticket_id: str):
    """Update ticket status (agent only)."""
    ticket_id = re.sub(r"[^A-Z0-9\-]", "", ticket_id.upper())
    if not get_ticket_dict(ticket_id):
        return jsonify({"error": "Ticket not found."}), 404
    try:
        data = request.get_json(force=True, silent=True) or {}
    except Exception:
        data = {}
    new_status = data.get("status", "")
    valid_statuses = ("open","assigned","in_progress","waiting_for_user","resolved","closed")
    if new_status not in valid_statuses:
        return jsonify({"error": f"Invalid status. Must be one of: {valid_statuses}"}), 400
    agent_id = request.headers.get("X-Agent-ID", "")
    now = datetime.datetime.now().isoformat()
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute(
                "UPDATE escalations SET status=?, assigned_agent=?, updated_at=? WHERE ticket_id=?",
                (new_status, agent_id, now, ticket_id)
            )
            conn.commit()
    except Exception as exc:
        logger.error("update_ticket_status error: %s", exc)
        return jsonify({"error": "Failed to update status."}), 500
    add_ticket_message(ticket_id, "system", "System",
                       f"Status updated to '{new_status}' by agent {agent_id}.", True)
    return jsonify({"ticket": get_ticket_dict(ticket_id)})


@app.route("/api/tickets", methods=["GET"])
@agent_required
def list_tickets():
    """List all tickets with optional filter/search (agent only)."""
    status   = request.args.get("status", "")
    priority = request.args.get("priority", "")
    search   = sanitize(request.args.get("q", ""), 200)
    limit    = min(int(request.args.get("limit", 50)), 200)

    query_parts = ["SELECT * FROM escalations WHERE 1=1"]
    params: list = []
    if status:
        query_parts.append("AND status = ?")
        params.append(status)
    if priority:
        query_parts.append("AND priority = ?")
        params.append(priority)
    if search:
        query_parts.append("AND (query LIKE ? OR user_name LIKE ? OR ticket_id LIKE ? OR subject LIKE ?)")
        like = f"%{search}%"
        params.extend([like, like, like, like])
    query_parts.append("ORDER BY updated_at DESC LIMIT ?")
    params.append(limit)

    try:
        with db_connect() as conn:
            rows = conn.execute(" ".join(query_parts), params).fetchall()
            tickets = [dict(r) for r in rows]
        return jsonify({"tickets": tickets, "total": len(tickets)})
    except Exception as exc:
        logger.error("list_tickets error: %s", exc)
        return jsonify({"error": "Failed to list tickets."}), 500


@app.route("/api/escalate-to-agent", methods=["POST"])
def escalate_to_agent():
    """Escalate AI conversation to a live agent — creates/updates ticket."""
    try:
        data = request.get_json(force=True, silent=True) or {}
    except Exception:
        data = {}

    session_id       = sanitize(str(data.get("session_id", uuid.uuid4().hex)), 64)
    query            = sanitize(data.get("query", ""), 2000)
    user_name        = sanitize(data.get("user_name", ""), 100)
    user_email       = sanitize(data.get("user_email", ""), 100)
    conversation     = data.get("conversation_history", [])
    escalation_reason = sanitize(data.get("escalation_reason", "User requested live agent"), 500)
    elig_info        = data.get("eligibility_info", {})
    name_match_info  = data.get("name_match_info", {})

    # Build AI handoff summary
    conv_text = generate_ai_summary(conversation)
    elig_text = json.dumps(elig_info, indent=2) if elig_info else "Not collected"
    name_text = (
        f"Aadhaar name: {name_match_info.get('name_a','N/A')}, "
        f"PAN name: {name_match_info.get('name_b','N/A')}, "
        f"Score: {name_match_info.get('score','N/A')}%, "
        f"Status: {name_match_info.get('status','N/A')}"
        if name_match_info else "Not checked"
    )

    ai_summary = (
        f"=== AI HANDOFF SUMMARY ===\n\n"
        f"USER ISSUE:\n{query}\n\n"
        f"ESCALATION REASON:\n{escalation_reason}\n\n"
        f"ELIGIBILITY INFORMATION:\n{elig_text}\n\n"
        f"DOCUMENT NAME CHECK:\n{name_text}\n\n"
        f"CONVERSATION HISTORY (last 10):\n{conv_text}"
    )

    # Check if agent available
    agent_available = False
    try:
        with db_connect() as conn:
            agent_row = conn.execute(
                "SELECT COUNT(*) as n FROM live_agents WHERE status = 'online'"
            ).fetchone()
            agent_available = agent_row["n"] > 0
    except Exception:
        pass

    # Create ticket
    ticket_id = "TKT-" + uuid.uuid4().hex[:8].upper()
    now = datetime.datetime.now().isoformat()
    topic = extract_topic(query) if query else "general"
    department = get_department_for_topic(topic)

    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute(
                "INSERT INTO escalations "
                "(ticket_id,session_id,query,department,status,user_name,user_email,subject,"
                "category,priority,ai_summary,live_agent_status,created_at,updated_at) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (ticket_id, session_id, query, department, "open",
                 user_name, user_email, query[:80] or "Support Request",
                 "escalation", "high", ai_summary,
                 "active" if agent_available else "pending", now, now)
            )
            conn.commit()
    except Exception as exc:
        logger.error("escalate_to_agent DB error: %s", exc)
        return jsonify({"error": "Failed to create escalation ticket."}), 500

    add_ticket_message(ticket_id, "system", "System", ai_summary)
    if query:
        add_ticket_message(ticket_id, "user", user_name or "User", query)

    ticket = get_ticket_dict(ticket_id)
    send_ticket_notification(ticket, "created")

    # Notify agents via Socket.IO
    if socketio and SOCKETIO_AVAILABLE:
        try:
            socketio.emit("new_escalation", {
                "ticket_id": ticket_id,
                "user_name": user_name,
                "query": query[:100],
                "ai_summary": ai_summary[:200],
            }, room="agents")
        except Exception:
            pass

    return jsonify({
        "ticket_id": ticket_id,
        "agent_available": agent_available,
        "message": (
            "A live agent is being connected. Please wait." if agent_available
            else "No agents are currently available. Your ticket has been created and "
                 "support will follow up within 2–3 working days. "
                 "Call 1800-11-1555 for urgent assistance."
        ),
    })


# ── Agent Login ──────────────────────────────────────────────────────────────

@app.route("/api/agent/login", methods=["POST"])
def agent_login():
    """Simple agent authentication."""
    try:
        data = request.get_json(force=True, silent=True) or {}
    except Exception:
        data = {}
    agent_id = sanitize(data.get("agent_id", ""), 50)
    password  = data.get("password", "")

    if not agent_id or not password:
        return jsonify({"error": "agent_id and password are required."}), 400

    # In production: look up agent in DB with hashed password.
    # For hackathon: use a single shared secret key.
    if password != AGENT_SECRET:
        return jsonify({"error": "Invalid credentials."}), 401

    token = make_agent_token(agent_id)

    # Register agent as online
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute(
                "INSERT OR REPLACE INTO live_agents (agent_id,name,email,status,last_seen) "
                "VALUES (?,?,?,?,datetime('now'))",
                (agent_id, agent_id, f"{agent_id}@support.gov.in", "online")
            )
            conn.commit()
    except Exception as exc:
        logger.error("agent_login DB error: %s", exc)

    if socketio and SOCKETIO_AVAILABLE:
        try:
            socketio.emit("agent_online", {"agent_id": agent_id}, room="agents")
        except Exception:
            pass

    return jsonify({
        "token": token,
        "agent_id": agent_id,
        "message": "Login successful.",
    })


@app.route("/api/agent/status", methods=["GET"])
@agent_required
def agent_status():
    """Return current agent status."""
    agent_id = request.headers.get("X-Agent-ID", "")
    try:
        with db_connect() as conn:
            row = conn.execute(
                "SELECT * FROM live_agents WHERE agent_id = ?", (agent_id,)
            ).fetchone()
            agent = dict(row) if row else {}
    except Exception:
        agent = {}
    return jsonify({"agent": agent, "authenticated": True})


@app.route("/api/agent/heartbeat", methods=["POST"])
@agent_required
def agent_heartbeat():
    """Keep agent marked as online."""
    agent_id = request.headers.get("X-Agent-ID", "")
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute(
                "UPDATE live_agents SET status='online', last_seen=datetime('now') WHERE agent_id=?",
                (agent_id,)
            )
            conn.commit()
    except Exception:
        pass
    return jsonify({"ok": True})


# ── Email Configuration ───────────────────────────────────────────────────────

@app.route("/api/email-config", methods=["GET"])
@agent_required
def get_email_config():
    """Return currently configured support emails."""
    emails = get_notification_emails()
    # Also get from DB
    db_emails = []
    try:
        with db_connect() as conn:
            rows = conn.execute(
                "SELECT key, value FROM email_config WHERE key LIKE 'support_email_%'"
            ).fetchall()
            db_emails = [r["value"] for r in rows if r["value"]]
    except Exception:
        pass
    smtp_host = os.environ.get("SMTP_HOST", "").strip()
    smtp_user = os.environ.get("SMTP_USER", "").strip()
    smtp_pass = os.environ.get("SMTP_PASS", "").strip()
    smtp_configured = bool(smtp_user and smtp_pass)
    return jsonify({
        "emails_from_env":  [e for e in emails if e not in db_emails],
        "emails_from_db":   db_emails,
        "all_emails":       emails,
        "smtp_host":        smtp_host or "smtp.gmail.com",
        "smtp_user":        smtp_user if smtp_user else "Not configured",
        "smtp_configured":  smtp_configured,
    })


@app.route("/api/email-config", methods=["POST"])
@agent_required
def set_email_config():
    """Configure up to 3 support email addresses (stored in DB)."""
    try:
        data = request.get_json(force=True, silent=True) or {}
    except Exception:
        data = {}
    emails = data.get("emails", [])
    if not isinstance(emails, list):
        return jsonify({"error": "emails must be a list."}), 400
    emails = [sanitize(e, 100) for e in emails if "@" in str(e)][:3]
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute("DELETE FROM email_config WHERE key LIKE 'support_email_%'")
            for i, email in enumerate(emails, 1):
                conn.execute(
                    "INSERT OR REPLACE INTO email_config (key, value) VALUES (?,?)",
                    (f"support_email_{i}", email)
                )
            conn.commit()
    except Exception as exc:
        logger.error("set_email_config error: %s", exc)
        return jsonify({"error": "Failed to save configuration."}), 500
    return jsonify({"emails": emails, "message": "Email configuration saved."})


# ── Agent Dashboard Page ──────────────────────────────────────────────────────

@app.route("/agent")
def agent_dashboard():
    return render_template("agent_dashboard.html")


@app.route("/api/test-email", methods=["POST"])
@agent_required
def test_email():
    """Send a test email to verify SMTP configuration (agent only)."""
    try:
        data = request.get_json(force=True, silent=True) or {}
    except Exception:
        data = {}

    recipient = sanitize(data.get("email", ""), 100)
    if not recipient or "@" not in recipient:
        return jsonify({"error": "A valid email address is required."}), 400

    smtp_user = os.environ.get("SMTP_USER", "").strip()
    smtp_pass = os.environ.get("SMTP_PASS", "").strip()
    smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))

    if not smtp_user or not smtp_pass:
        return jsonify({
            "success": False,
            "error": "SMTP_USER and SMTP_PASS are not set in the environment. "
                     "Please add them to your .env file and restart the server."
        }), 400

    html = f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>body{{font-family:Arial,sans-serif;background:#f0f4f9;padding:30px}}
.card{{background:#fff;border-radius:12px;padding:30px;max-width:500px;margin:0 auto;
       border-left:5px solid #003366;box-shadow:0 4px 12px rgba(0,51,102,.12)}}
h2{{color:#003366;margin-top:0}}p{{color:#4a5568;line-height:1.6}}
.badge{{background:#dcfce7;color:#16a34a;padding:6px 14px;border-radius:20px;
        font-weight:700;display:inline-block;margin-top:10px}}</style></head>
<body><div class="card">
<h2>🏛️ Citizen Service Assistant</h2>
<p>This is a <strong>test email</strong> from your Citizen Service Assistant platform.</p>
<p>If you received this, your SMTP email configuration is working correctly!</p>
<div class="badge">✅ Email Delivery Confirmed</div>
<p style="margin-top:20px;font-size:.8rem;color:#718096">
  Sent at: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}<br>
  Server: {smtp_host}:{smtp_port}<br>
  From: {smtp_user}
</p>
</div></body></html>"""

    text = (
        "Citizen Service Assistant — Test Email\n"
        "=" * 40 + "\n"
        "This is a test email. If you received this, your SMTP configuration is working.\n\n"
        f"Sent at: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
        f"Server: {smtp_host}:{smtp_port}\n"
        f"From: {smtp_user}"
    )

    # Test SMTP connection directly (synchronous for immediate feedback)
    try:
        import smtplib
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText as _MIMEText
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "✅ Test Email — Citizen Service Assistant"
        msg["From"] = f"Citizen Service Assistant <{smtp_user}>"
        msg["To"] = recipient
        msg.attach(_MIMEText(text, "plain", "utf-8"))
        msg.attach(_MIMEText(html, "html", "utf-8"))
        with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, [recipient], msg.as_string())
        logger.info("Test email sent to %s", recipient)
        return jsonify({
            "success": True,
            "message": f"Test email successfully sent to {recipient}. Check your inbox!",
            "smtp_host": smtp_host,
            "smtp_port": smtp_port,
            "smtp_user": smtp_user,
        })
    except smtplib.SMTPAuthenticationError:
        return jsonify({
            "success": False,
            "error": "Authentication failed. Check your SMTP_USER and SMTP_PASS. "
                     "If using Gmail, make sure you are using an App Password "
                     "(not your regular Gmail password).",
            "help_url": "https://myaccount.google.com/apppasswords",
        }), 400
    except smtplib.SMTPConnectError as exc:
        return jsonify({
            "success": False,
            "error": f"Could not connect to {smtp_host}:{smtp_port}. "
                     f"Check SMTP_HOST and SMTP_PORT. Details: {exc}",
        }), 400
    except Exception as exc:
        logger.error("Test email error: %s", exc)
        return jsonify({
            "success": False,
            "error": str(exc),
        }), 500


# ══════════════════════════════════════════════════════════════════════════════
# SOCKET.IO EVENTS (Live Agent Chat)
# ══════════════════════════════════════════════════════════════════════════════

if SOCKETIO_AVAILABLE and socketio:

    @socketio.on("connect")
    def on_connect():
        logger.info("Socket.IO client connected: %s", request.sid)

    @socketio.on("disconnect")
    def on_disconnect():
        logger.info("Socket.IO client disconnected: %s", request.sid)

    @socketio.on("join_ticket")
    def on_join_ticket(data):
        """User or agent joins a ticket room."""
        ticket_id = re.sub(r"[^A-Z0-9\-]", "", str(data.get("ticket_id", "")).upper())
        if not ticket_id:
            return
        room = f"ticket_{ticket_id}"
        join_room(room)
        # Send history
        messages = get_ticket_messages(ticket_id)
        emit("message_history", {"messages": messages})
        emit("joined", {"room": room, "ticket_id": ticket_id})
        logger.info("Client %s joined room %s", request.sid, room)

    @socketio.on("agent_join_room")
    def on_agent_join(data):
        """Agent joins ticket room and agent broadcast room."""
        join_room("agents")
        ticket_id = re.sub(r"[^A-Z0-9\-]", "", str(data.get("ticket_id", "")).upper())
        if ticket_id:
            join_room(f"ticket_{ticket_id}")
            emit("agent_joined", {
                "agent_id": data.get("agent_id", "Agent"),
                "ticket_id": ticket_id,
            }, room=f"ticket_{ticket_id}")

    @socketio.on("send_message")
    def on_send_message(data):
        """Broadcast a new chat message within a ticket room."""
        ticket_id   = re.sub(r"[^A-Z0-9\-]", "", str(data.get("ticket_id", "")).upper())
        message     = sanitize(str(data.get("message", "")), 2000)
        sender_type = data.get("sender_type", "user")
        sender_name = sanitize(str(data.get("sender_name", "")), 100)
        if not ticket_id or not message:
            return
        if sender_type not in ("user", "agent", "system", "ai"):
            sender_type = "user"
        msg = add_ticket_message(ticket_id, sender_type, sender_name, message)
        emit("new_message", msg, room=f"ticket_{ticket_id}")

    @socketio.on("typing")
    def on_typing(data):
        """Broadcast typing indicator."""
        ticket_id = re.sub(r"[^A-Z0-9\-]", "", str(data.get("ticket_id", "")).upper())
        if ticket_id:
            emit("typing", {
                "sender_type": data.get("sender_type", "user"),
                "sender_name": data.get("sender_name", ""),
            }, room=f"ticket_{ticket_id}", include_self=False)

    @socketio.on("agent_join_global")
    def on_agent_join_global(data):
        """Agent registers for global notifications."""
        join_room("agents")
        emit("agent_registered", {"agent_id": data.get("agent_id", "")})



# ══════════════════════════════════════════════════════════════════════════════
# STARTUP  — runs for both `python app.py` and `gunicorn app:app`
# ══════════════════════════════════════════════════════════════════════════════

init_db()
load_and_embed_documents()

if __name__ == "__main__":
    port  = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    logger.info("Starting Citizen Service Assistant on port %d", port)

    if SOCKETIO_AVAILABLE and socketio:
        socketio.run(app, host="0.0.0.0", port=port, debug=debug,
                     allow_unsafe_werkzeug=True)
    else:
        app.run(host="0.0.0.0", port=port, debug=debug)
