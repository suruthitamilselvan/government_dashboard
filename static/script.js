/**
 * Citizen Service Assistant — script.js
 *
 * Responsibilities:
 *  1. Chat interface: send messages, render bot/user bubbles, typing indicator
 *  2. Voice input: Web Speech API → auto-fill chat input
 *  3. Service tile clicks → prefill chat
 *  4. Eligibility form: submit → render per-scheme result cards
 *  5. Live analytics: fetch /api/analytics after every interaction, animate counters
 *  6. Language selection: pass lang to /api/chat
 *  7. Responsive eligibility panel / modal toggle
 *  8. Session management: generate & persist session_id in sessionStorage
 */

"use strict";

/* ═══════════════════════════════════════════════════════════════════════════
   CONSTANTS & STATE
═══════════════════════════════════════════════════════════════════════════ */

const API_BASE = "";  // same origin
let SESSION_ID = sessionStorage.getItem("csa_session_id") || generateSessionId();
sessionStorage.setItem("csa_session_id", SESSION_ID);

let isWaitingForBot = false;   // prevent double-sends
let isRecording = false;       // voice input state
let speechRecognition = null;  // Web Speech API instance

// Analytics previous values (for animated diff)
let prevAnalytics = { total: 0, resolution: 0, avgTime: 0, langs: 0 };

/* ═══════════════════════════════════════════════════════════════════════════
   DOCUMENTS DATA (eligible documents needed per service)
═══════════════════════════════════════════════════════════════════════════ */

const DOCUMENTS_DATA = {
  birth: {
    icon: "❌📋",
    title: "Birth Certificate",
    subtitle: "Civil Registration System (CRS) — crsorgi.gov.in",
    applyUrl: "https://crsorgi.gov.in",
    applyLabel: "🌐 Apply at crsorgi.gov.in",
    altUrl: "https://umang.gov.in",
    altLabel: "📱 UMANG App",
    mandatory: [
      { icon: "🏥", text: "Hospital Discharge Summary", note: "For institutional births — issued by hospital at time of discharge" },
      { icon: "🏠", text: "Declaration of Birth (Form 1)", note: "For home births — signed by head of household or midwife" },
      { icon: "🪧", text: "Aadhaar Card of both parents", note: "12-digit Aadhaar; if unavailable, Voter ID or Passport accepted" },
      { icon: "📍", text: "Proof of Residence (any one)", note: "Aadhaar / electricity bill / water bill / rental agreement (not older than 6 months)" },
      { icon: "💍", text: "Parents\u2019 Marriage Certificate", note: "Recommended; mandatory in some states (Maharashtra, Tamil Nadu)" },
      { icon: "\u270f\ufe0f", text: "Signed application form", note: "Form No. 1 — available at registrar office or crsorgi.gov.in" },
    ],
    optional: [
      { icon: "⚠\ufe0f", text: "Affidavit on stamp paper", note: "Required only if registration is delayed beyond 30 days" },
      { icon: "\u2696\ufe0f", text: "Court order", note: "Required only if registration is delayed beyond 1 year" },
      { icon: "📷", text: "Passport-size photograph of parents", note: "Some states require 2 copies" },
    ],
    tips: [
      { icon: "⏰", text: "Register within 21 days", note: "FREE of cost and fastest. Late fees apply after 21 days." },
      { icon: "📱", text: "DigiLocker accepted", note: "Digital copies of Aadhaar from DigiLocker are accepted at most offices" },
      { icon: "\u2714\ufe0f", text: "Names must match exactly", note: "Parent name on Aadhaar must match hospital records to avoid rejection" },
    ],
    rejection: [
      "Incomplete form — child\u2019s exact time/place of birth or parent details left blank",
      "Name mismatch between Aadhaar and hospital records (submit affidavit)",
      "Delayed registration submitted without affidavit on stamp paper",
      "Wrong ward office jurisdiction — apply at the office covering the birth address",
      "Hospital birth report not yet submitted by the hospital — follow up with hospital first",
    ],
  },

  ration: {
    icon: "🍾",
    title: "Ration Card (PHH / AAY / BPL)",
    subtitle: "National Food Security Act — nfsa.gov.in / State PDS portal",
    applyUrl: "https://nfsa.gov.in",
    applyLabel: "🌐 Apply at nfsa.gov.in",
    altUrl: "https://umang.gov.in",
    altLabel: "📱 UMANG App",
    mandatory: [
      { icon: "🪧", text: "Aadhaar card of ALL family members", note: "12-digit Aadhaar is mandatory for every member to be added to the card" },
      { icon: "💰", text: "Income Certificate", note: "Issued by Tehsildar / Revenue Officer — self-declarations not accepted" },
      { icon: "📍", text: "Proof of Residence (any one)", note: "Aadhaar / electricity bill / water bill / rental agreement" },
      { icon: "👤", text: "Proof of Identity — Head of household", note: "Aadhaar / Voter ID / PAN card / Passport" },
      { icon: "📷", text: "Passport-size photographs", note: "2\u20134 copies of head of household (recent, white background)" },
      { icon: "\u270f\ufe0f", text: "Completed application form", note: "Available at District Supply Office or state PDS portal" },
      { icon: "📝", text: "Self-declaration of non-possession", note: "Declares that no ration card exists in any state in family\u2019s name" },
    ],
    optional: [
      { icon: "💍", text: "Marriage certificate", note: "For newly married couples forming a new household" },
      { icon: "🎟\ufe0f", text: "Surrender certificate", note: "Required if you held a ration card in another state (migration cases)" },
      { icon: "♿", text: "Disability certificate", note: "If applicable — may entitle to priority" },
      { icon: "🏡", text: "Caste certificate (SC/ST/OBC)", note: "For claiming category priority in some states" },
    ],
    tips: [
      { icon: "📱", text: "One Nation One Ration Card (ONORC)", note: "Your card works at any FPS in India if Aadhaar is seeded" },
      { icon: "🏦", text: "Aadhaar-bank account must be linked", note: "Required for DBT subsidy transfers; link at your bank or UIDAI portal" },
      { icon: "\u2714\ufe0f", text: "Names must match exactly across all documents", note: "Mismatches are the #1 cause of rejection — get affidavit if names differ" },
    ],
    rejection: [
      "Income exceeds BPL limit — declared income > \u20b91,20,000/year",
      "Duplicate application — another card exists with same Aadhaar",
      "Aadhaar not seeded / Aadhaar details mismatch with UIDAI records",
      "Address proof older than 6 months or not matching current address",
      "Income certificate not from a competent authority (Tehsildar)",
      "Field verification officer found no one at stated address",
      "Asset ownership (land / vehicle) exceeds state-prescribed limit",
    ],
  },

  pension: {
    icon: "🏗\ufe0f",
    title: "Pension Schemes (IGNOAPS / IGNWPS)",
    subtitle: "National Social Assistance Programme — nsap.nic.in",
    applyUrl: "https://nsap.nic.in",
    applyLabel: "🌐 Apply at nsap.nic.in",
    altUrl: "https://umang.gov.in",
    altLabel: "📱 UMANG App",
    mandatory: [
      { icon: "🪧", text: "Aadhaar card of applicant", note: "Mandatory for DBT bank transfer — must be linked to bank account" },
      { icon: "📅", text: "Age proof (any one)", note: "Birth certificate / school leaving certificate / Aadhaar with DOB / medical certificate from Civil Surgeon" },
      { icon: "🏦", text: "Bank passbook (Aadhaar-linked)", note: "Pension credited via DBT — account must be in applicant\u2019s own name" },
      { icon: "🍾", text: "BPL Ration card (PHH / AAY)", note: "Primary proof of BPL status; or SECC 2011 inclusion certificate" },
      { icon: "📍", text: "Proof of residence", note: "Aadhaar / voter ID / ration card with current address" },
      { icon: "📷", text: "Passport-size photograph", note: "2 recent copies, white background" },
      { icon: "\u270f\ufe0f", text: "Completed application form", note: "Available at Gram Panchayat (rural) or Ward Office (urban)" },
      { icon: "📝", text: "Self-declaration of no other pension", note: "Declares that no government pension is received from any other scheme" },
    ],
    optional: [
      { icon: "\u26b0\ufe0f", text: "Death certificate of husband", note: "MANDATORY for Widow Pension (IGNWPS) — not optional for that scheme" },
      { icon: "💍", text: "Marriage certificate / witness declaration", note: "Some states require marriage proof for IGNWPS" },
      { icon: "♿", text: "Disability certificate", note: "If claiming under disability-specific state pension scheme" },
    ],
    tips: [
      { icon: "📅", text: "Annual Life Certificate (Jeevan Pramaan)", note: "Submit every November to continue pension without interruption — via bank, post office, or Jeevan Pramaan app" },
      { icon: "🏦", text: "Bank account must be in applicant\u2019s name only", note: "Joint accounts with deceased spouse will cause DBT failure" },
      { icon: "\u2714\ufe0f", text: "Widow Pension: report remarriage", note: "Continued receipt of pension after remarriage is a criminal offence" },
    ],
    rejection: [
      "Age proof not conclusive — voter ID alone often insufficient for age verification",
      "Not on BPL list / SECC 2011 database — apply for correction at Gram Sabha",
      "Aadhaar not linked to bank account — link at bank branch before applying",
      "Already receiving another government pension (check state rules for exemptions)",
      "Bank account is joint account with deceased or in another person\u2019s name",
      "Death certificate of husband not submitted (for Widow Pension)",
      "Applicant divorced / separated — IGNWPS is for widows only (apply for Destitute Women scheme instead)",
    ],
  },

  tax: {
    icon: "💰",
    title: "Income Tax (ITR Filing)",
    subtitle: "Central Board of Direct Taxes — incometax.gov.in",
    applyUrl: "https://incometax.gov.in",
    applyLabel: "🌐 File at incometax.gov.in",
    altUrl: "https://eportal.incometax.gov.in",
    altLabel: "\ud83d\udcbb e-Filing Portal",
    mandatory: [
      { icon: "🪧", text: "PAN card", note: "Permanent Account Number — mandatory for all tax transactions; must be linked with Aadhaar" },
      { icon: "🪧", text: "Aadhaar card", note: "Required for PAN-Aadhaar linking (mandatory since July 2023) and e-verification of ITR" },
      { icon: "💳", text: "Form 16 / Salary Slip", note: "Issued by employer — shows salary paid and TDS deducted for the financial year" },
      { icon: "🏦", text: "Bank account details", note: "All active bank account numbers + IFSC code; pre-validate at least one for refund" },
      { icon: "📄", text: "Form 26AS / AIS", note: "Download from incometax.gov.in — shows all TDS credits, income reported by third parties" },
      { icon: "\ud83d\udcb0", text: "Interest certificates", note: "From banks for FD/savings interest; required to report \u2018Income from Other Sources\u2019" },
    ],
    optional: [
      { icon: "🏠", text: "Home loan interest certificate", note: "For claiming deduction u/s 24(b) — up to \u20b92,00,000 for self-occupied property" },
      { icon: "💹", text: "Investment proofs for 80C", note: "LIC receipts, PPF passbook, ELSS statement, school fee receipts, home loan principal" },
      { icon: "🏥", text: "Health insurance premium receipts", note: "For 80D deduction — up to \u20b950,000 for senior citizens" },
      { icon: "🏫", text: "Education loan interest certificate", note: "For 80E deduction on interest — full interest deductible for 8 years" },
      { icon: "📝", text: "Donation receipts (80G)", note: "With NGO\u2019s PAN and 80G registration number" },
      { icon: "🏠", text: "Rent receipts + landlord PAN", note: "For HRA exemption — landlord PAN mandatory if rent > \u20b91 lakh/year" },
      { icon: "💱", text: "Capital gains statement", note: "From broker / mutual fund — for reporting equity/debt fund gains (ITR-2)" },
    ],
    tips: [
      { icon: "\u23f0", text: "Deadline: 31 July of Assessment Year", note: "Late fee \u20b91,000\u20135,000 applies u/s 234F if filed after deadline" },
      { icon: "🔗", text: "Link PAN and Aadhaar FIRST", note: "PAN becomes inoperative if not linked; TDS deducted at 20% on all income" },
      { icon: "✅", text: "87A Rebate = zero tax up to \u20b97 lakh", note: "New regime (default): total taxable income \u2264 \u20b97,00,000 = zero tax, no filing required beyond return" },
    ],
    rejection: [
      "ITR defective u/s 139(9) — wrong ITR form or missing schedules (respond within 15 days)",
      "Income mismatch with AIS / Form 26AS — review AIS and file revised return",
      "Refund not credited — bank account not pre-validated or Aadhaar-PAN link pending",
      "TDS not reflected — employer / bank has not deposited TDS; raise grievance with deductor",
      "Late fee u/s 234F is mandatory and cannot be waived except in natural calamity cases",
    ],
  },

  eligibility: {
    icon: "🎯",
    title: "Scheme Eligibility — All Criteria",
    subtitle: "Evaluate your profile against all 4 government welfare schemes",
    applyUrl: "https://umang.gov.in",
    applyLabel: "🌐 Access All Schemes via UMANG",
    altUrl: "https://myscheme.gov.in",
    altLabel: "🔍 myScheme.gov.in",
    mandatory: [
      { icon: "👥", text: "Age (years)", note: "IGNOAPS: 60+  \u2022  IGNWPS: 40\u201379  \u2022  Ration Card: any age  \u2022  IT Rebate 87A: any age" },
      { icon: "💰", text: "Annual household income (\u20b9)", note: "Pension & Ration Card: \u2264 \u20b91,00,000 (BPL threshold)  \u2022  IT Rebate: \u2264 \u20b97,00,000 (new regime)" },
      { icon: "🍾", text: "BPL status", note: "For IGNOAPS, IGNWPS, Ration Card — must appear in SECC 2011 database or hold BPL ration card" },
      { icon: "💍", text: "Marital status", note: "IGNWPS requires widowed status — divorced / separated do NOT qualify (apply for Destitute Women scheme)" },
    ],
    optional: [
      { icon: "🏡", text: "Social category (SC / ST / OBC)", note: "SC/ST/OBC get priority in Ration Card allocation (AAY) and some state pension schemes" },
      { icon: "\u2642\ufe0f/\u2640\ufe0f", text: "Gender", note: "IGNWPS is exclusively for women; IGNOAPS is for all genders" },
      { icon: "♿", text: "Disability status", note: "Persons with disability may qualify for state-specific disability pensions" },
    ],
    tips: [
      { icon: "🔍", text: "Use myScheme.gov.in", note: "Official Government of India portal to discover ALL schemes you qualify for based on your profile" },
      { icon: "📱", text: "UMANG App", note: "One app for 1,200+ government services including scheme applications, status tracking, and document downloads" },
      { icon: "\u2705", text: "Check eligibility for ALL 4 schemes", note: "Use the \u2018Check My Eligibility\u2019 form on this page to get detailed per-scheme results with rejection reasons" },
    ],
    rejection: [],
  },
};


/* ═══════════════════════════════════════════════════════════════════════════
   UTILITY
═══════════════════════════════════════════════════════════════════════════ */

function generateSessionId() {
  return "sess-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function getCurrentLang() {
  return document.getElementById("lang-select").value || "en";
}

function getCurrentTime() {
  return new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Escape HTML entities to prevent XSS when rendering bot text.
 * Bot text is then enriched with safe markdown-like patterns.
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Very lightweight markdown-to-HTML for bot messages.
 * Supports: **bold**, *italic*, `code`, numbered/bulleted lists, line breaks.
 */
function renderMarkdown(text) {
  let html = escapeHtml(text);
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Inline code
  html = html.replace(/`(.+?)`/g, "<code style='background:#f0f4f9;padding:1px 5px;border-radius:4px;font-size:0.85em;'>$1</code>");
  // Numbered list lines: "1. text"
  html = html.replace(/^(\d+)\.\s+(.+)$/gm, "<div style='margin:2px 0 2px 12px;'>$1. $2</div>");
  // Bullet lines: "- text" or "• text"
  html = html.replace(/^[-•]\s+(.+)$/gm, "<div style='margin:2px 0 2px 12px;'>• $1</div>");
  // Line breaks
  html = html.replace(/\n/g, "<br/>");
  return html;
}

/**
 * Animate a numeric counter from old value to new value.
 */
function animateCounter(el, newVal, formatter = (v) => v) {
  const oldVal = parseFloat(el.dataset.val || "0");
  if (oldVal === newVal) return;
  const duration = 600;
  const steps = 30;
  const interval = duration / steps;
  let step = 0;
  const timer = setInterval(() => {
    step++;
    const progress = step / steps;
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    const current = oldVal + (newVal - oldVal) * eased;
    el.textContent = formatter(current);
    if (step >= steps) {
      clearInterval(timer);
      el.textContent = formatter(newVal);
      el.dataset.val = newVal;
      el.classList.add("flash");
      setTimeout(() => el.classList.remove("flash"), 700);
    }
  }, interval);
  el.dataset.val = oldVal;
}

/* ═══════════════════════════════════════════════════════════════════════════
   DOM REFS
═══════════════════════════════════════════════════════════════════════════ */

const chatMessages        = document.getElementById("chat-messages");
const chatInput           = document.getElementById("chat-input");
const sendBtn             = document.getElementById("send-btn");
const micBtn              = document.getElementById("mic-btn");
const clearChatBtn        = document.getElementById("clear-chat-btn");
const langSelect          = document.getElementById("lang-select");
const workspace           = document.querySelector(".workspace");
const eligibilityPanel    = document.getElementById("eligibility-panel");
const closeEligibilityBtn = document.getElementById("close-eligibility-btn");
const eligibilityForm     = document.getElementById("eligibility-form");
const eligibilityResults  = document.getElementById("eligibility-results");
const eligibilitySubmitBtn= document.getElementById("eligibility-submit-btn");
const eligibilitySubmitTxt= document.getElementById("eligibility-submit-text");
const eligibilityModal    = document.getElementById("eligibility-modal");
const modalCloseBtn       = document.getElementById("modal-close-btn");
const confidenceWrap      = document.getElementById("confidence-bar-wrap");
const confidenceBarFill   = document.getElementById("confidence-bar-fill");
const confidencePct       = document.getElementById("confidence-pct");

// Analytics elements
const valTotal    = document.getElementById("val-total");
const valResolved = document.getElementById("val-resolved");
const valTime     = document.getElementById("val-time");
const valLangs    = document.getElementById("val-langs");

/* ═══════════════════════════════════════════════════════════════════════════
   WELCOME MESSAGE
═══════════════════════════════════════════════════════════════════════════ */

function showWelcomeMessage() {
  const t = (typeof I18N !== 'undefined')
    ? (I18N[getCurrentLang()] || I18N.en)
    : null;
  const lines = t ? t.welcome : [
    "🙏 **Namaste!** Welcome to the Government of India Citizen Service Assistant.",
    "","I can help you with:",
    "• Birth certificates, ration cards, pension schemes",
    "• Income tax filing, rebates, and refunds",
    "• Checking your eligibility for government welfare schemes",
    "• Application rejection reasons and appeals",
    "","You may type in **English, हिन्दी, or తెలుగు**. Use the 🎤 mic button for voice input.",
    "","**How can I assist you today?**"
  ];
  appendBotMessage(lines.join("\n"), null, false, null);
}

/* ═══════════════════════════════════════════════════════════════════════════
   CHAT MESSAGE RENDERING
═══════════════════════════════════════════════════════════════════════════ */

function appendUserMessage(text) {
  const row = document.createElement("div");
  row.className = "msg-row user";
  row.innerHTML = `
    <div class="msg-avatar" aria-label="You" role="img">🙋</div>
    <div class="msg-body">
      <div class="msg-bubble">${escapeHtml(text)}</div>
      <div class="msg-time">${getCurrentTime()}</div>
    </div>
  `;
  chatMessages.appendChild(row);
  scrollToBottom();
}

/**
 * Append a bot message bubble with optional source tag and escalation styling.
 * @param {string}  text        - The response text (may contain simple markdown)
 * @param {string|null} source  - Source filename for RAG citation
 * @param {boolean} escalated   - Whether this is an escalation response
 * @param {string|null} ticketId - Escalation ticket ID
 */
function appendBotMessage(text, source = null, escalated = false, ticketId = null, govSource = null) {
  const row = document.createElement("div");
  row.className = "msg-row bot";

  const bubbleClass = escalated ? "msg-bubble escalation" : "msg-bubble";

  let extras = "";
  if (source) {
    extras += `<div class="source-tag">📄 ${escapeHtml(source)}</div>`;
  }
  if (ticketId) {
    extras += `<div class="ticket-badge">🎫 Ticket: ${escapeHtml(ticketId)}</div>`;
  }

  row.innerHTML = `
    <div class="msg-avatar" aria-label="Bot" role="img">🤖</div>
    <div class="msg-body">
      <div class="${bubbleClass}" role="article">${renderMarkdown(text)}</div>
      ${extras}
      <div class="msg-time">${getCurrentTime()}</div>
    </div>
  `;
  chatMessages.appendChild(row);

  // Gov Source Card (official government source)
  if (govSource && govSource.url && govSource.source_type === "official") {
    const card = document.createElement("div");
    card.className = "gov-source-card";
    card.innerHTML = `
      <div class="gov-source-card-header">
        🏛️ Official Source
        <span class="gov-source-verified-badge">✓ Verified</span>
      </div>
      <div class="gov-source-row"><strong>Department:</strong> ${escapeHtml(govSource.department || '')}</div>
      <div class="gov-source-row"><strong>Document:</strong> ${escapeHtml(govSource.document || '')}</div>
      <div class="gov-source-row"><strong>Portal:</strong> ${escapeHtml(govSource.portal || '')}</div>
      <div class="gov-source-row"><strong>Helpline:</strong> ${escapeHtml(govSource.contact || '')}</div>
      <button class="gov-source-btn" onclick="showRedirectPopup('${escapeHtml(govSource.url)}','${escapeHtml(govSource.portal || 'Official Portal')}','${escapeHtml(govSource.url || '')}')"
              aria-label="Visit official government portal">
        🌐 Visit Official Portal
      </button>`;
    row.appendChild(card);
  }

  // Escalation CTA
  if (escalated) {
    const ctaBtn = document.createElement("button");
    ctaBtn.className = "escalation-cta";
    ctaBtn.textContent = "👤 Connect to Live Agent";
    ctaBtn.addEventListener("click", () => openLiveAgentModal());
    row.appendChild(ctaBtn);
  }

  scrollToBottom();
}

function showTypingIndicator() {
  const row = document.createElement("div");
  row.className = "msg-row bot";
  row.id = "typing-indicator-row";
  row.setAttribute("aria-label", "Bot is typing");
  row.innerHTML = `
    <div class="msg-avatar" aria-label="Bot" role="img">🤖</div>
    <div class="msg-body">
      <div class="typing-indicator" role="status" aria-live="polite">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>
  `;
  chatMessages.appendChild(row);
  scrollToBottom();
}

function hideTypingIndicator() {
  const el = document.getElementById("typing-indicator-row");
  if (el) el.remove();
}

function scrollToBottom() {
  chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: "smooth" });
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONFIDENCE BAR
═══════════════════════════════════════════════════════════════════════════ */

function updateConfidenceBar(confidence) {
  if (confidence === null || confidence === undefined) {
    confidenceWrap.setAttribute("aria-hidden", "true");
    return;
  }
  const pct = Math.round(confidence * 100);
  confidenceBarFill.style.width = pct + "%";
  confidencePct.textContent = pct + "%";
  confidenceWrap.setAttribute("aria-hidden", "false");
  confidenceWrap.setAttribute("aria-label", `Response confidence: ${pct}%`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   API CALLS
═══════════════════════════════════════════════════════════════════════════ */

async function sendChatMessage(query) {
  if (isWaitingForBot || !query.trim()) return;
  isWaitingForBot = true;
  sendBtn.disabled = true;

  appendUserMessage(query);
  chatInput.value = "";
  autoResizeTextarea();
  showTypingIndicator();

  try {
    const resp = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: query,
        lang: getCurrentLang(),
        session_id: SESSION_ID,
      }),
    });

    hideTypingIndicator();

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      appendBotMessage(
        `⚠️ Service error (${resp.status}): ${errData.error || "Please try again."}`,
        null, false, null
      );
      return;
    }

    const data = await resp.json();
    appendBotMessage(data.response, data.source, data.escalated, data.ticket_id, data.gov_source);
    updateConfidenceBar(data.confidence);
    fetchAndUpdateAnalytics();
    // Store last response data for escalation
    window._lastChatResponse = data;
    chatHistory.push({ role: "user", content: query });
    chatHistory.push({ role: "assistant", content: data.response });

  } catch (err) {
    hideTypingIndicator();
    appendBotMessage(
      "⚠️ Unable to connect to the server. Please check your internet connection and try again.",
      null, false, null
    );
    console.error("Chat API error:", err);
  } finally {
    isWaitingForBot = false;
    sendBtn.disabled = false;
    chatInput.focus();
  }
}

async function submitEligibility(age, income, category, maritalStatus, extraFields = {}) {
  try {
    const resp = await fetch(`${API_BASE}/api/eligibility`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        age: age || null,
        income: income || null,
        category: category || null,
        marital_status: maritalStatus || null,
        session_id: SESSION_ID,
        ...extraFields,
      }),
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      return { error: errData.error || `Server error (${resp.status})` };
    }

    return await resp.json();
  } catch (err) {
    console.error("Eligibility API error:", err);
    return { error: "Unable to connect to server. Please try again." };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   ANALYTICS
═══════════════════════════════════════════════════════════════════════════ */

async function fetchAndUpdateAnalytics() {
  try {
    const resp = await fetch(`${API_BASE}/api/analytics`);
    if (!resp.ok) return;
    const data = await resp.json();

    const langCount = Object.keys(data.queries_by_language || {}).length;

    animateCounter(valTotal, data.total_queries, (v) => Math.round(v).toLocaleString("en-IN"));
    animateCounter(valResolved, data.resolution_rate, (v) => v.toFixed(1) + "%");
    animateCounter(valTime, data.avg_response_time_ms / 1000, (v) => v.toFixed(2) + "s");
    animateCounter(valLangs, langCount, (v) => Math.round(v));

  } catch (err) {
    console.warn("Analytics fetch failed:", err);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   ELIGIBILITY RESULTS RENDERING
═══════════════════════════════════════════════════════════════════════════ */

const STATUS_CONFIG = {
  eligible: {
    icon: "✅",
    label: "Eligible",
    className: "eligible",
  },
  not_eligible: {
    icon: "❌",
    label: "Not Eligible",
    className: "not_eligible",
  },
  partially_eligible: {
    icon: "⚠️",
    label: "Needs Info",
    className: "partially_eligible",
  },
};

function renderEligibilityResults(results, container) {
  container.innerHTML = "";

  if (!results || results.length === 0) {
    container.innerHTML = `<p style="color:var(--text-muted);font-size:0.85rem;">No results returned.</p>`;
    return;
  }

  // Summary header
  const eligible    = results.filter(r => r.status === "eligible").length;
  const notEligible = results.filter(r => r.status === "not_eligible").length;
  const partial     = results.filter(r => r.status === "partially_eligible").length;

  const summary = document.createElement("div");
  summary.style.cssText = `
    background: var(--navy);
    color: white;
    border-radius: var(--radius-md);
    padding: 12px 14px;
    margin-bottom: 4px;
    font-size: 0.82rem;
  `;
  summary.innerHTML = `
    <div style="font-weight:700;margin-bottom:6px;">Eligibility Summary (${results.length} schemes evaluated)</div>
    <div style="display:flex;gap:14px;flex-wrap:wrap;">
      <span style="color:#81c784;">✅ Eligible: <strong>${eligible}</strong></span>
      <span style="color:#ef9a9a;">❌ Not Eligible: <strong>${notEligible}</strong></span>
      <span style="color:#ffcc80;">⚠️ Needs Info: <strong>${partial}</strong></span>
    </div>
  `;
  container.appendChild(summary);

  // Per-scheme cards
  results.forEach((scheme, idx) => {
    const cfg = STATUS_CONFIG[scheme.status] || STATUS_CONFIG.partially_eligible;
    const card = document.createElement("div");
    card.className = `scheme-card ${cfg.className}`;
    card.style.animationDelay = (idx * 0.08) + "s";
    card.setAttribute("role", "article");
    card.setAttribute("aria-label", `${scheme.scheme}: ${cfg.label}`);

    // Next steps HTML
    let nextStepsHtml = "";
    if (scheme.next_steps && scheme.next_steps.length > 0) {
      const items = scheme.next_steps
        .map(s => `<li>${escapeHtml(s)}</li>`)
        .join("");
      nextStepsHtml = `
        <div class="scheme-next-steps">
          <div class="scheme-next-steps-title">✔ Next Steps to Apply</div>
          <ol class="scheme-steps-list">${items}</ol>
        </div>
      `;
    }

    // Reason / message
    let reasonHtml = "";
    if (scheme.status === "eligible" && scheme.reason) {
      reasonHtml = `<p class="scheme-reason">${escapeHtml(scheme.reason)}</p>`;
    } else if (scheme.status === "not_eligible" && scheme.reason) {
      reasonHtml = `<p class="scheme-reason"><strong>Reason:</strong> ${escapeHtml(scheme.reason)}</p>`;
    } else if (scheme.status === "partially_eligible" && scheme.reason) {
      reasonHtml = `<p class="scheme-reason"><strong>Missing info:</strong> ${escapeHtml(scheme.reason)}</p>`;
    }

    card.innerHTML = `
      <div class="scheme-card-header">
        <span class="scheme-status-icon" aria-hidden="true">${cfg.icon}</span>
        <span class="scheme-card-title">${escapeHtml(scheme.scheme)}</span>
        <span class="scheme-status-label">${cfg.label}</span>
      </div>
      <div class="scheme-card-body">
        <p class="scheme-description">${escapeHtml(scheme.description)}</p>
        ${reasonHtml}
        ${nextStepsHtml}
      </div>
    `;
    container.appendChild(card);
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   VOICE INPUT (Web Speech API)
═══════════════════════════════════════════════════════════════════════════ */

function initVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    micBtn.title = "Voice input not supported in this browser";
    micBtn.style.opacity = "0.4";
    micBtn.disabled = true;
    return;
  }

  speechRecognition = new SpeechRecognition();
  speechRecognition.continuous = false;
  speechRecognition.interimResults = true;
  speechRecognition.maxAlternatives = 1;

  speechRecognition.onstart = () => {
    isRecording = true;
    micBtn.classList.add("recording");
    micBtn.setAttribute("aria-label", "Stop voice recording");
    chatInput.placeholder = "🎤 Listening…";
  };

  speechRecognition.onresult = (event) => {
    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    chatInput.value = transcript;
    autoResizeTextarea();
  };

  speechRecognition.onend = () => {
    isRecording = false;
    micBtn.classList.remove("recording");
    micBtn.setAttribute("aria-label", "Start voice input");
    chatInput.placeholder = "Type your question or speak using the mic… (English, हिन्दी, తెలుగు)";
    // Auto-send if there's content
    if (chatInput.value.trim()) {
      setTimeout(() => sendChatMessage(chatInput.value.trim()), 400);
    }
  };

  speechRecognition.onerror = (event) => {
    console.warn("Speech recognition error:", event.error);
    isRecording = false;
    micBtn.classList.remove("recording");
    micBtn.setAttribute("aria-label", "Start voice input");
    chatInput.placeholder = "Type your question or speak using the mic…";
    if (event.error !== "no-speech") {
      appendBotMessage(`⚠️ Voice input error: ${event.error}. Please type your question instead.`);
    }
  };

  micBtn.addEventListener("click", () => {
    if (!speechRecognition) return;
    if (isRecording) {
      speechRecognition.stop();
    } else {
      // Set recognition language based on UI language selection
      const lang = getCurrentLang();
      const langMap = { en: "en-IN", hi: "hi-IN", te: "te-IN" };
      speechRecognition.lang = langMap[lang] || "en-IN";
      try {
        speechRecognition.start();
      } catch (e) {
        // Already running
        speechRecognition.stop();
      }
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   TEXTAREA AUTO-RESIZE
═══════════════════════════════════════════════════════════════════════════ */

function autoResizeTextarea() {
  chatInput.style.height = "auto";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";
}

/* ═══════════════════════════════════════════════════════════════════════════
   ELIGIBILITY PANEL / MODAL MANAGEMENT
═══════════════════════════════════════════════════════════════════════════ */

function isNarrowScreen() {
  return window.innerWidth < 1100;
}

function openEligibilityPanel() {
  if (isNarrowScreen()) {
    // On small screens use modal
    eligibilityModal.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
    // Focus the first form field in modal after a short delay
    setTimeout(() => {
      const firstInput = eligibilityModal.querySelector("input, select");
      if (firstInput) firstInput.focus();
    }, 100);
  } else {
    // On wide screens use sidebar panel
    eligibilityPanel.removeAttribute("hidden");
    workspace.classList.add("with-eligibility");
    setTimeout(() => {
      const firstInput = eligibilityPanel.querySelector("input, select");
      if (firstInput) firstInput.focus();
    }, 100);
  }
}

function closeEligibilityPanelFn() {
  eligibilityPanel.setAttribute("hidden", "");
  workspace.classList.remove("with-eligibility");
}

function closeEligibilityModalFn() {
  eligibilityModal.setAttribute("hidden", "");
  document.body.style.overflow = "";
}

/* ═══════════════════════════════════════════════════════════════════════════
   ELIGIBILITY FORM SUBMISSION
═══════════════════════════════════════════════════════════════════════════ */

async function handleEligibilitySubmit(event) {
  event.preventDefault();

  const age          = document.getElementById("elig-age").value.trim();
  const income       = document.getElementById("elig-income").value.trim();
  const category     = document.getElementById("elig-category").value.trim();
  const maritalStatus= document.getElementById("elig-marital").value.trim();
  // New extended fields
  const fullName     = (document.getElementById("elig-full-name")?.value || "").trim();
  const aadhaarName  = (document.getElementById("elig-aadhaar-name")?.value || "").trim();
  const panName      = (document.getElementById("elig-pan-name")?.value || "").trim();
  const dob          = (document.getElementById("elig-dob")?.value || "").trim();
  const gender       = (document.getElementById("elig-gender")?.value || "").trim();
  const state        = (document.getElementById("elig-state")?.value || "").trim();
  const district     = (document.getElementById("elig-district")?.value || "").trim();

  // Basic validation
  if (!age) {
    alert("Please enter your age to continue.");
    document.getElementById("elig-age").focus();
    return;
  }

  const ageNum = parseInt(age, 10);
  if (isNaN(ageNum) || ageNum < 0 || ageNum > 120) {
    alert("Please enter a valid age between 0 and 120.");
    document.getElementById("elig-age").focus();
    return;
  }

  // Show loading state
  eligibilitySubmitBtn.disabled = true;
  eligibilitySubmitTxt.textContent = "Evaluating…";
  eligibilityResults.innerHTML = `
    <div style="text-align:center;padding:20px;color:var(--text-muted);">
      <div style="font-size:1.8rem;margin-bottom:8px;">⏳</div>
      <div style="font-size:0.85rem;">Evaluating your profile against all schemes…</div>
    </div>
  `;

  const result = await submitEligibility(age, income, category, maritalStatus);

  eligibilitySubmitBtn.disabled = false;
  eligibilitySubmitTxt.textContent = "Check All Schemes →";

  if (result.error) {
    eligibilityResults.innerHTML = `
      <div style="background:#fce4ec;border:1.5px solid #e53935;border-radius:var(--radius-md);padding:14px;font-size:0.85rem;color:#b71c1c;">
        ⚠️ Error: ${escapeHtml(result.error)}
      </div>
    `;
    return;
  }

  renderEligibilityResults(result.results, eligibilityResults);
  fetchAndUpdateAnalytics();

  // Scroll results into view
  eligibilityResults.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* ═══════════════════════════════════════════════════════════════════════════
   EVENT LISTENERS
═══════════════════════════════════════════════════════════════════════════ */

// Send message
sendBtn.addEventListener("click", () => {
  const q = chatInput.value.trim();
  if (q) sendChatMessage(q);
});

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    const q = chatInput.value.trim();
    if (q) sendChatMessage(q);
  }
});

chatInput.addEventListener("input", autoResizeTextarea);

// Clear chat
clearChatBtn.addEventListener("click", () => {
  chatMessages.innerHTML = "";
  showWelcomeMessage();
  updateConfidenceBar(null);
  confidenceBarFill.style.width = "0%";
  confidencePct.textContent = "—";
  chatInput.focus();
});

// Service tiles
document.querySelectorAll(".service-tile[data-query]").forEach((tile) => {
  tile.addEventListener("click", () => {
    const query = tile.getAttribute("data-query");
    chatInput.value = query;
    autoResizeTextarea();
    sendChatMessage(query);
    chatInput.focus();
  });
});

// Eligibility tile
document.getElementById("tile-eligibility").addEventListener("click", openEligibilityPanel);

// Close eligibility panel / modal
closeEligibilityBtn.addEventListener("click", closeEligibilityPanelFn);
modalCloseBtn.addEventListener("click", closeEligibilityModalFn);

// Close modal on overlay click
eligibilityModal.addEventListener("click", (e) => {
  if (e.target === eligibilityModal) closeEligibilityModalFn();
});

// Close modal on Escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!eligibilityModal.hasAttribute("hidden")) closeEligibilityModalFn();
    if (!eligibilityPanel.hasAttribute("hidden")) closeEligibilityPanelFn();
  }
});

// Eligibility form submission — attach to both panel and modal forms
eligibilityForm.addEventListener("submit", handleEligibilitySubmit);

// Keep modal body in sync with the panel form (clone approach)
// On mobile, we render a new form in the modal dynamically
document.getElementById("modal-body").addEventListener("click", () => {});

function syncModalWithPanel() {
  if (!isNarrowScreen()) return;
  const modalBody = document.getElementById("modal-body");
  // Clone the panel content (form + results) into modal
  modalBody.innerHTML = "";
  const clone = document.querySelector(".eligibility-panel").cloneNode(true);
  clone.removeAttribute("hidden");
  clone.style.height = "auto";
  clone.style.maxHeight = "70vh";
  clone.style.border = "none";
  clone.style.boxShadow = "none";
  clone.style.borderRadius = "0";
  // Hide the panel header (already shown in modal header)
  const hdr = clone.querySelector(".eligibility-header");
  if (hdr) hdr.style.display = "none";
  modalBody.appendChild(clone);

  // Re-attach form submit to cloned form
  const clonedForm = clone.querySelector("#eligibility-form");
  if (clonedForm) {
    clonedForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const ageEl    = clone.querySelector("#elig-age");
      const incEl    = clone.querySelector("#elig-income");
      const catEl    = clone.querySelector("#elig-category");
      const marEl    = clone.querySelector("#elig-marital");
      const subBtn   = clone.querySelector(".eligibility-submit-btn");
      const subTxt   = clone.querySelector("#eligibility-submit-text");
      const resDiv   = clone.querySelector("#eligibility-results");

      const age = ageEl ? ageEl.value.trim() : "";
      if (!age) { alert("Please enter your age."); return; }

      if (subBtn) { subBtn.disabled = true; }
      if (subTxt) { subTxt.textContent = "Evaluating…"; }

      const result = await submitEligibility(
        age,
        incEl ? incEl.value.trim() : "",
        catEl ? catEl.value.trim() : "",
        marEl ? marEl.value.trim() : ""
      );

      if (subBtn) { subBtn.disabled = false; }
      if (subTxt) { subTxt.textContent = "Check All Schemes →"; }

      if (result.error) {
        if (resDiv) resDiv.innerHTML = `<div style="color:red;padding:12px;">${escapeHtml(result.error)}</div>`;
        return;
      }
      if (resDiv) renderEligibilityResults(result.results, resDiv);
      fetchAndUpdateAnalytics();
    });
  }
}

// Rebuild modal content when it's opened (for freshness)
document.getElementById("tile-eligibility").addEventListener("click", () => {
  if (isNarrowScreen()) {
    syncModalWithPanel();
  }
});

// Language selector change — update speech recognition language too
langSelect.addEventListener("change", () => {
  const lang = langSelect.value;
  const hintMap = {
    en: "Type your question or speak using the mic… (English, हिन्दी, తెలుగు)",
    hi: "अपना प्रश्न टाइप करें या माइक बटन से बोलें…",
    te: "మీ ప్రశ్నను టైప్ చేయండి లేదా మైక్ బటన్‌ను ఉపయోగించండి…",
  };
  chatInput.placeholder = hintMap[lang] || hintMap.en;
});

/* ═══════════════════════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════════════════════ */

function init() {
  // Apply i18n first so UI is in correct language before welcome
  if (typeof applyI18n === 'function') applyI18n();
  showWelcomeMessage();
  initVoiceInput();
  fetchAndUpdateAnalytics();
  setInterval(fetchAndUpdateAnalytics, 30000);
  chatInput.focus();
  initLiveAgentModal();
  initPreRedirectPopup();
  initMismatchModal();
  initSocketIO();
}

// Language switcher — re-apply translations and refresh welcome
if (langSelect) {
  langSelect.addEventListener("change", () => {
    if (typeof applyI18n === 'function') applyI18n();
    // Update voice recognition language
    if (speechRecognition) {
      const lm = { en: "en-IN", hi: "hi-IN", te: "te-IN" };
      speechRecognition.lang = lm[getCurrentLang()] || "en-IN";
    }
  });
}

// Run when DOM is fully ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

/* ═══════════════════════════════════════════════════════════
   V2 FEATURE ADDITIONS
   Gov Source Cards, Name Match, Live Agent, Pre-redirect, Socket.IO
═══════════════════════════════════════════════════════════ */

// Chat history buffer for escalation summaries
const chatHistory = [];

// appendBotMessage now handles gov source cards directly (see definition above)

/* ── Name Match Card Renderer ── */
function renderNameMatchCard(nameMatch, aadhaarName, panName) {
  const score = nameMatch.score || 0;
  let scoreClass = score >= 85 ? "score-green" : score >= 60 ? "score-yellow" : "score-red";
  let statusClass = nameMatch.status === "strong_match" ? "match-strong"
    : nameMatch.status === "potential_difference" ? "match-potential" : "match-mismatch";
  let statusLabel = nameMatch.status === "strong_match" ? "✅ Strong Match"
    : nameMatch.status === "potential_difference" ? "⚠️ Potential Difference"
    : "❌ Significant Mismatch";

  const card = document.createElement("div");
  card.className = "name-match-card";
  const notesHtml = (nameMatch.notes || []).map(n =>
    `<li>${escapeHtml(n)}</li>`
  ).join("");
  card.innerHTML = `
    <div class="name-match-header">
      <span class="name-match-title">🔍 Document Name Comparison</span>
      <span class="name-match-score-badge ${scoreClass}">${score}%</span>
    </div>
    <div class="name-compare-row">
      <div class="name-compare-box">
        <div class="nc-label">Aadhaar Name</div>
        <div class="nc-value">${escapeHtml(aadhaarName || '—')}</div>
      </div>
      <div class="name-compare-box">
        <div class="nc-label">PAN Name</div>
        <div class="nc-value">${escapeHtml(panName || '—')}</div>
      </div>
    </div>
    <span class="name-match-status ${statusClass}">${statusLabel}</span>
    <div class="name-match-explanation">${escapeHtml(nameMatch.explanation || '')}</div>
    ${notesHtml ? `<ul class="name-match-notes">${notesHtml}</ul>` : ''}`;
  return card;
}

/* ── Mismatch Modal ── */
function initMismatchModal() {
  const modal = document.getElementById("mismatch-modal");
  document.getElementById("close-mismatch-modal")?.addEventListener("click", () => modal.setAttribute("hidden", ""));
  document.getElementById("mismatch-modal-dismiss")?.addEventListener("click", () => modal.setAttribute("hidden", ""));
  modal?.addEventListener("click", (e) => { if (e.target === modal) modal.setAttribute("hidden", ""); });
}

function showMismatchModal(nameMatch, nameA, nameB) {
  const modal = document.getElementById("mismatch-modal");
  const body  = document.getElementById("mismatch-modal-body");
  const score = nameMatch.score || 0;
  const scoreClass = score >= 85 ? "score-green" : score >= 60 ? "score-yellow" : "score-red";

  body.innerHTML = `
    <div style="margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <span class="name-match-score-badge ${scoreClass}" style="font-size:1.3rem">${score}%</span>
        <span style="font-size:.84rem;color:#1a2744">Name Similarity Score</span>
      </div>
      <div class="name-compare-row">
        <div class="name-compare-box"><div class="nc-label">Aadhaar</div><div class="nc-value">${escapeHtml(nameA)}</div></div>
        <div class="name-compare-box"><div class="nc-label">PAN</div><div class="nc-value">${escapeHtml(nameB)}</div></div>
      </div>
    </div>
    <p style="font-size:.83rem;color:#4a5568;line-height:1.6">${escapeHtml(nameMatch.explanation || '')}</p>
    ${nameMatch.notes?.length ? `
      <ul style="margin-top:10px;padding-left:18px;font-size:.8rem;color:#4a5568">
        ${nameMatch.notes.map(n => `<li>${escapeHtml(n)}</li>`).join("")}
      </ul>` : ''}
    <div class="mismatch-warning-inline" style="margin-top:14px">
      <strong>Action Required:</strong> Name differences can cause application rejection.
      Contact your nearest Aadhaar Seva Kendra (for Aadhaar name correction) or your
      assessing officer to reconcile the names before applying.
    </div>`;

  modal.removeAttribute("hidden");
}

/* ── Pre-Redirect Popup ── */
const REDIRECT_DOCS = {
  "crsorgi.gov.in": [
    { text: "Aadhaar Card of both parents", icon: "🩷", note: "Both parents' Aadhaar numbers required" },
    { text: "Hospital Discharge Summary / Birth Proof", icon: "🏥", note: "Original document from hospital/midwife" },
    { text: "Proof of Residence", icon: "📍", note: "Not older than 6 months" },
    { text: "Signed Application Form (Form 1)", icon: "✏️", note: "Available on the portal" },
    { text: "Parents' Marriage Certificate", icon: "💍", note: "Recommended; mandatory in some states", optional: true },
  ],
  "nfsa.gov.in": [
    { text: "Aadhaar of ALL family members", icon: "🩷", note: "Each member must have Aadhaar" },
    { text: "Income Certificate (from Tehsildar)", icon: "💰", note: "Official income certificate, not self-declaration" },
    { text: "Proof of Residence", icon: "📍", note: "Electricity/water bill or rental agreement" },
    { text: "Passport-size photograph (Head of household)", icon: "📷", note: "2–4 recent photos with white background" },
    { text: "Self-declaration of non-possession", icon: "📝", note: "Declares no other ration card exists" },
    { text: "Caste Certificate (if applicable)", icon: "🏦", note: "SC/ST/OBC priority", optional: true },
  ],
  "nsap.nic.in": [
    { text: "Aadhaar Card", icon: "🩷", note: "Must be linked to bank account for DBT" },
    { text: "Age Proof (any one)", icon: "🗓️", note: "Birth certificate / school certificate / medical officer certificate" },
    { text: "BPL Ration Card", icon: "🏠", note: "Proof of BPL household status" },
    { text: "Bank Passbook (first page)", icon: "🏦", note: "Account must be Aadhaar-linked" },
    { text: "Passport-size photograph", icon: "📷", note: "Recent, white background" },
    { text: "Death certificate of husband", icon: "📄", note: "For Widow Pension (IGNWPS) only", optional: true },
  ],
  "incometax.gov.in": [
    { text: "PAN Card", icon: "💳", note: "Your Permanent Account Number" },
    { text: "Aadhaar Card", icon: "🩷", note: "Must be linked to PAN before filing" },
    { text: "Form 16 from employer", icon: "🏢", note: "If you are a salaried employee" },
    { text: "Bank account details", icon: "🏦", note: "For refund credit (if any)" },
    { text: "Investment proofs", icon: "📊", note: "For claiming deductions (80C, 80D, etc.)", optional: true },
  ],
  "default": [
    { text: "Aadhaar Card", icon: "🩷", note: "India's primary ID proof" },
    { text: "Proof of Residence", icon: "📍", note: "Recent utility bill or rental agreement" },
    { text: "Passport-size photograph", icon: "📷", note: "Recent photo" },
  ],
};

function showRedirectPopup(url, portalName, fullUrl) {
  const modal = document.getElementById("redirect-confirm-modal");
  document.getElementById("redirect-portal-name").textContent = portalName || url;
  document.getElementById("redirect-confirm-link").href = fullUrl || url;

  // Select relevant docs based on URL
  const matchKey = Object.keys(REDIRECT_DOCS).find(k => url.includes(k)) || "default";
  const docs = REDIRECT_DOCS[matchKey];
  const listEl = document.getElementById("redirect-doc-list");
  listEl.innerHTML = docs.map(d => `
    <div class="redirect-doc-item${d.optional ? ' optional' : ''}">
      <span class="rd-icon">${d.icon}</span>
      <div>
        <div>${escapeHtml(d.text)}</div>
        <div class="rd-note">${d.optional ? 'Optional — ' : ''}${escapeHtml(d.note)}</div>
      </div>
    </div>`).join("");

  modal.removeAttribute("hidden");
}

function initPreRedirectPopup() {
  const modal = document.getElementById("redirect-confirm-modal");
  document.getElementById("close-redirect-modal")?.addEventListener("click", () => modal.setAttribute("hidden", ""));
  document.getElementById("redirect-cancel-btn")?.addEventListener("click", () => modal.setAttribute("hidden", ""));
  modal?.addEventListener("click", (e) => { if (e.target === modal) modal.setAttribute("hidden", ""); });

  // Intercept all tile "Apply Online" links
  document.querySelectorAll(".tile-btn--apply").forEach(link => {
    link.addEventListener("click", (e) => {
      const href = link.getAttribute("href");
      const label = link.getAttribute("aria-label") || link.textContent.trim();
      if (href && href.startsWith("http")) {
        e.preventDefault();
        showRedirectPopup(href, label, href);
      }
    });
  });
}

/* ── Live Agent Modal ── */
let liveSocket = null;
let liveTicketId = null;

function openLiveAgentModal() {
  const modal = document.getElementById("live-agent-modal");
  modal.removeAttribute("hidden");
  document.getElementById("live-agent-form-section").removeAttribute("hidden");
  document.getElementById("live-agent-ticket-section").setAttribute("hidden", "");
}

function initLiveAgentModal() {
  const modal = document.getElementById("live-agent-modal");
  document.getElementById("close-live-agent-modal")?.addEventListener("click", () => modal.setAttribute("hidden", ""));
  modal?.addEventListener("click", (e) => { if (e.target === modal) modal.setAttribute("hidden", ""); });

  document.getElementById("btn-connect-live-agent")?.addEventListener("click", openLiveAgentModal);

  document.getElementById("btn-escalate-submit")?.addEventListener("click", async () => {
    const userName  = document.getElementById("la-user-name").value.trim();
    const userEmail = document.getElementById("la-user-email").value.trim();
    const issue     = document.getElementById("la-issue").value.trim();
    const errEl     = document.getElementById("la-error");

    if (!issue) {
      errEl.textContent = "Please describe your issue.";
      errEl.removeAttribute("hidden");
      return;
    }
    errEl.setAttribute("hidden", "");

    const btn = document.getElementById("btn-escalate-submit");
    btn.textContent = "Connecting…";
    btn.disabled = true;

    try {
      const resp = await fetch("/api/escalate-to-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: SESSION_ID,
          query: issue,
          user_name: userName,
          user_email: userEmail,
          conversation_history: chatHistory.slice(-10),
          escalation_reason: "User clicked 'Connect to Live Agent' button",
          eligibility_info: window._lastEligibilityResult || {},
          name_match_info: window._lastEligibilityResult?.name_match || {},
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Failed to create ticket");

      liveTicketId = data.ticket_id;
      document.getElementById("la-ticket-id").textContent = `Ticket: ${liveTicketId}`;
      document.getElementById("la-agent-message").textContent = data.message;
      document.getElementById("live-agent-form-section").setAttribute("hidden", "");
      document.getElementById("live-agent-ticket-section").removeAttribute("hidden");

      // Join Socket.IO room for this ticket
      if (liveSocket) {
        liveSocket.emit("join_ticket", { ticket_id: liveTicketId });
      }

    } catch (err) {
      errEl.textContent = err.message || "Failed to connect. Please try again.";
      errEl.removeAttribute("hidden");
    } finally {
      btn.textContent = "Connect to Agent \u2192";
      btn.disabled = false;
    }
  });

  // Send live message
  document.getElementById("la-send-btn")?.addEventListener("click", sendLiveMessage);
  document.getElementById("la-chat-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendLiveMessage(); }
  });
  document.getElementById("la-chat-input")?.addEventListener("input", () => {
    if (liveSocket && liveTicketId) {
      liveSocket.emit("typing", { ticket_id: liveTicketId, sender_type: "user", sender_name: "User" });
    }
  });
}

function sendLiveMessage() {
  if (!liveTicketId) return;
  const input = document.getElementById("la-chat-input");
  const msg = input.value.trim();
  if (!msg) return;
  if (liveSocket) {
    liveSocket.emit("send_message", {
      ticket_id: liveTicketId, message: msg,
      sender_type: "user", sender_name: "User",
    });
  } else {
    // Fallback HTTP
    fetch(`/api/ticket/${liveTicketId}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg, sender_type: "user", sender_name: "User" }),
    });
    appendLiveMsg(msg, "user");
  }
  input.value = "";
}

function appendLiveMsg(text, type) {
  const msgs = document.getElementById("la-messages");
  if (!msgs) return;
  const div = document.createElement("div");
  div.className = `live-msg ${type}`;
  div.textContent = text;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

/* ── Socket.IO (citizen side) ── */
function initSocketIO() {
  try {
    liveSocket = io({ transports: ["websocket", "polling"] });

    liveSocket.on("connect", () => {
      console.log("Citizen Socket.IO connected");
    });

    liveSocket.on("new_message", (msg) => {
      if (msg.ticket_id !== liveTicketId) return;
      if (msg.sender_type === "agent") {
        appendLiveMsg(`${msg.sender_name || 'Agent'}: ${msg.message}`, "agent");
        // Hide typing
        const typingEl = document.getElementById("la-typing");
        if (typingEl) typingEl.setAttribute("hidden", "");
      } else if (msg.sender_type === "system") {
        appendLiveMsg(msg.message, "system");
      } else if (msg.sender_type === "user") {
        appendLiveMsg(msg.message, "user");
      }
    });

    liveSocket.on("typing", (data) => {
      if (data.sender_type === "agent") {
        const typingEl = document.getElementById("la-typing");
        if (typingEl) {
          typingEl.removeAttribute("hidden");
          setTimeout(() => typingEl.setAttribute("hidden", ""), 3000);
        }
      }
    });

    liveSocket.on("ticket_resolved", (data) => {
      if (data.ticket_id === liveTicketId) {
        appendLiveMsg("✅ Your ticket has been resolved. Thank you!", "system");
      }
    });

    liveSocket.on("message_history", (data) => {
      (data.messages || []).forEach(msg => {
        appendLiveMsg(`${msg.sender_name || msg.sender_type}: ${msg.message}`, msg.sender_type);
      });
    });

  } catch (err) {
    console.warn("Socket.IO not available:", err.message);
    liveSocket = null;
  }
}

// Make showRedirectPopup globally accessible for inline onclick
window.showRedirectPopup = showRedirectPopup;

/* ═══════════════════════════════════════════════════════════
   DOCUMENT CHECKLIST MODAL  (mandatory documents only)
════════════════════════════════════════════════════════════ */

function openDocModal(service) {
  const data = DOCUMENTS_DATA[service];
  if (!data) return;

  // Populate header
  document.getElementById("doc-modal-icon").textContent     = data.icon || "📋";
  document.getElementById("doc-modal-title").textContent    = data.title;
  document.getElementById("doc-modal-subtitle").textContent = data.subtitle || "";

  // Render mandatory documents
  const panel = document.getElementById("doc-panel-mandatory");
  const items = data.mandatory || [];
  panel.innerHTML = items.map((item, i) => `
    <div class="doc-item" style="animation-delay:${i * 0.05}s">
      <label class="doc-item-check">
        <input type="checkbox" class="doc-checkbox">
        <span class="doc-checkmark"></span>
      </label>
      <div class="doc-item-icon">${item.icon || "📄"}</div>
      <div class="doc-item-content">
        <div class="doc-item-text">${escapeHtml(item.text)}</div>
        <div class="doc-item-note">${escapeHtml(item.note || "")}</div>
      </div>
    </div>
  `).join("");

  // Set footer links
  const applyBtn = document.getElementById("doc-modal-apply-btn");
  const altBtn   = document.getElementById("doc-modal-alt-btn");
  applyBtn.href = data.applyUrl  || "#";
  altBtn.href   = data.altUrl    || "https://umang.gov.in";
  applyBtn.textContent = data.applyLabel || "🌐 Apply Online";
  altBtn.textContent   = data.altLabel   || "📱 UMANG App";

  // Show modal
  const modal = document.getElementById("doc-checklist-modal");
  modal.removeAttribute("hidden");
  document.body.style.overflow = "hidden";
}

function closeDocModal() {
  document.getElementById("doc-checklist-modal").setAttribute("hidden", "");
  document.body.style.overflow = "";
}

// Wire everything up after DOM is ready
document.addEventListener("DOMContentLoaded", function () {
  // Close buttons
  document.getElementById("close-doc-modal")
    .addEventListener("click", closeDocModal);
  document.getElementById("doc-modal-close-bottom")
    .addEventListener("click", closeDocModal);

  // Click outside overlay to close
  document.getElementById("doc-checklist-modal")
    .addEventListener("click", function (e) {
      if (e.target === this) closeDocModal();
    });

  // Escape key
  document.addEventListener("keydown", function (e) {
    const modal = document.getElementById("doc-checklist-modal");
    if (e.key === "Escape" && !modal.hasAttribute("hidden")) closeDocModal();
  });

  // Wire "📄 Documents" buttons on tiles
  document.querySelectorAll(".tile-btn--docs").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      openDocModal(btn.getAttribute("data-service"));
    });
  });

  // Apply Online / UMANG — show redirect popup instead of direct link
  document.getElementById("doc-modal-apply-btn").addEventListener("click", function (e) {
    e.preventDefault();
    const href = this.href;
    if (href && href !== location.href + "#") {
      closeDocModal();
      showRedirectPopup(href, this.textContent.trim(), href);
    }
  });
  document.getElementById("doc-modal-alt-btn").addEventListener("click", function (e) {
    e.preventDefault();
    const href = this.href;
    if (href && href !== location.href + "#") {
      closeDocModal();
      showRedirectPopup(href, this.textContent.trim(), href);
    }
  });
});



