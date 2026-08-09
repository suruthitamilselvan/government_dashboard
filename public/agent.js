/**
 * agent.js — Agent Dashboard JavaScript
 * Handles: login, ticket management, live chat (Socket.IO), settings
 */

"use strict";

/* ════════════════════════════════════════════════════
   STATE
════════════════════════════════════════════════════ */
let agentId    = "";
let agentToken = "";
let socket     = null;
let selectedTicketId = null;
let activeLiveTicket = null;
let refreshInterval  = null;

/* ════════════════════════════════════════════════════
   ELEMENT REFS
════════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);

const loginOverlay  = $("login-overlay");
const dashboard     = $("dashboard");
const loginForm     = $("login-form");
const loginError    = $("login-error");
const sidebarAgentId = $("sidebar-agent-id");

/* ════════════════════════════════════════════════════
   UTILS
════════════════════════════════════════════════════ */
function esc(s) {
  const d = document.createElement("div");
  d.textContent = String(s || "");
  return d.innerHTML;
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  } catch { return iso; }
}

function showToast(msg) {
  const toast = $("escalation-toast");
  $("toast-msg").textContent = msg;
  toast.removeAttribute("hidden");
  setTimeout(() => toast.setAttribute("hidden", ""), 8000);
}

$("toast-close").addEventListener("click", () => {
  $("escalation-toast").setAttribute("hidden", "");
});

/* ════════════════════════════════════════════════════
   API HELPERS
════════════════════════════════════════════════════ */
async function apiRequest(method, path, body = null) {
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Agent-ID":    agentId,
      "X-Agent-Token": agentToken,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/* ════════════════════════════════════════════════════
   LOGIN
════════════════════════════════════════════════════ */
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.setAttribute("hidden", "");
  const id  = $("agent-id-input").value.trim();
  const pwd = $("agent-pass-input").value;
  const btn = $("login-btn");
  btn.textContent = "Logging in…";
  btn.disabled = true;
  try {
    const data = await fetch("/api/agent/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_id: id, password: pwd }),
    }).then(r => r.json());
    if (data.error) throw new Error(data.error);
    agentId    = data.agent_id;
    agentToken = data.token;
    loginOverlay.setAttribute("hidden", "");
    dashboard.removeAttribute("hidden");
    sidebarAgentId.textContent = agentId;
    $("info-agent-id").textContent = agentId;
    initDashboard();
  } catch (err) {
    loginError.textContent = err.message || "Login failed.";
    loginError.removeAttribute("hidden");
  } finally {
    btn.textContent = "Login to Dashboard";
    btn.disabled = false;
  }
});

/* ════════════════════════════════════════════════════
   LOGOUT
════════════════════════════════════════════════════ */
$("btn-logout").addEventListener("click", () => {
  agentId = "";
  agentToken = "";
  selectedTicketId = null;
  if (refreshInterval) clearInterval(refreshInterval);
  if (socket) socket.disconnect();
  loginOverlay.removeAttribute("hidden");
  dashboard.setAttribute("hidden", "");
  $("login-form").reset();
});

/* ════════════════════════════════════════════════════
   NAVIGATION
════════════════════════════════════════════════════ */
document.querySelectorAll(".nav-item").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const panel = btn.getAttribute("data-panel");
    document.querySelectorAll(".panel").forEach(p => {
      if (p.id === `panel-${panel}`) {
        p.classList.add("active");
        p.removeAttribute("hidden");
      } else {
        p.classList.remove("active");
        p.setAttribute("hidden", "");
      }
    });
    if (panel === "settings") loadEmailConfig();
  });
});

/* ════════════════════════════════════════════════════
   TABS (ticket detail)
════════════════════════════════════════════════════ */
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.getAttribute("data-tab");
    document.querySelectorAll(".tab-panel").forEach(p => {
      if (p.id === `tab-${tab}`) p.classList.add("active");
      else p.classList.remove("active");
    });
  });
});

/* ════════════════════════════════════════════════════
   INIT DASHBOARD
════════════════════════════════════════════════════ */
function initDashboard() {
  initSocketIO();
  loadStats();
  loadTickets();
  startHeartbeat();
  // Refresh every 30s
  refreshInterval = setInterval(() => {
    loadStats();
    if (document.getElementById("panel-tickets").classList.contains("active")) {
      loadTickets(false);
    }
  }, 30000);
}

/* ════════════════════════════════════════════════════
   SOCKET.IO INIT
════════════════════════════════════════════════════ */
function initSocketIO() {
  try {
    socket = io({ transports: ["websocket", "polling"] });

    socket.on("connect", () => {
      console.log("Agent Socket.IO connected:", socket.id);
      socket.emit("agent_join_global", { agent_id: agentId });
    });

    socket.on("disconnect", () => {
      console.log("Agent Socket.IO disconnected");
    });

    socket.on("new_escalation", (data) => {
      showToast(`New escalation — Ticket ${data.ticket_id}: ${data.query}`);
      $("nav-open-count").textContent =
        (parseInt($("nav-open-count").textContent || "0") + 1).toString();
      loadTickets(false);
    });

    socket.on("new_message", (msg) => {
      if (msg.ticket_id === selectedTicketId) {
        appendMessageBubble(msg, "detail-messages");
      }
      if (msg.ticket_id === activeLiveTicket) {
        appendMessageBubble(msg, "live-messages");
      }
    });

    socket.on("typing", (data) => {
      if (data.sender_type === "user") {
        const el = $("user-typing");
        if (el) {
          el.removeAttribute("hidden");
          setTimeout(() => el.setAttribute("hidden", ""), 3000);
        }
      }
    });

    socket.on("ticket_resolved", (data) => {
      if (data.ticket_id === selectedTicketId) {
        loadTicketDetail(selectedTicketId);
      }
    });

    socket.on("agent_online", (data) => {
      console.log("Agent online:", data.agent_id);
    });

  } catch (err) {
    console.warn("Socket.IO unavailable:", err.message);
  }
}

/* ════════════════════════════════════════════════════
   STATS
════════════════════════════════════════════════════ */
async function loadStats() {
  try {
    const data = await fetch("/api/analytics").then(r => r.json());
    const ts = data.ticket_stats || {};
    $("stat-total").textContent    = ts.total     || 0;
    $("stat-open").textContent     = ts.open      || 0;
    $("stat-progress").textContent = ts.in_progress || 0;
    $("stat-waiting").textContent  = ts.waiting_for_user || 0;
    $("stat-resolved").textContent = ts.resolved  || 0;
    $("stat-closed").textContent   = ts.closed    || 0;
    $("nav-open-count").textContent = ts.open || 0;
  } catch (err) {
    console.error("loadStats error:", err);
  }
}

/* ════════════════════════════════════════════════════
   TICKET LIST
════════════════════════════════════════════════════ */
async function loadTickets(showLoader = true) {
  const list = $("ticket-list");
  if (showLoader) {
    list.innerHTML = `<div class="ticket-list-loading"><div class="spinner"></div> Loading tickets…</div>`;
  }
  const status   = $("filter-status").value;
  const priority = $("filter-priority").value;
  const search   = $("search-tickets").value;
  let url = "/api/tickets?limit=100";
  if (status)   url += `&status=${encodeURIComponent(status)}`;
  if (priority) url += `&priority=${encodeURIComponent(priority)}`;
  if (search)   url += `&q=${encodeURIComponent(search)}`;
  try {
    const data = await apiRequest("GET", url);
    renderTicketList(data.tickets || []);
  } catch (err) {
    list.innerHTML = `<div class="ticket-list-loading" style="color:#dc2626">Error: ${esc(err.message)}</div>`;
  }
}

function renderTicketList(tickets) {
  const list = $("ticket-list");
  if (!tickets.length) {
    list.innerHTML = `<div class="ticket-list-loading">No tickets found.</div>`;
    return;
  }
  list.innerHTML = tickets.map(t => {
    const selected = t.ticket_id === selectedTicketId ? "selected" : "";
    return `
      <div class="ticket-item ${selected}" data-id="${esc(t.ticket_id)}" tabindex="0"
           onclick="selectTicket('${esc(t.ticket_id)}')" onkeydown="if(event.key==='Enter')selectTicket('${esc(t.ticket_id)}')">
        <div class="ticket-item-header">
          <span class="ticket-item-id">${esc(t.ticket_id)}</span>
          <span class="ticket-item-priority priority-${esc(t.priority || "normal")}">${esc(t.priority || "normal")}</span>
        </div>
        <div class="ticket-item-subject">${esc(t.subject || t.query || "No subject")}</div>
        <div class="ticket-item-meta">
          <span class="ticket-item-status status-${esc(t.status)}">${esc(t.status)}</span>
          <span>${esc(t.user_name || "Unknown user")}</span>
          <span>${formatDate(t.created_at).split(",")[0]}</span>
        </div>
      </div>`;
  }).join("");
}

// Filter/search listeners
$("filter-status").addEventListener("change", () => loadTickets());
$("filter-priority").addEventListener("change", () => loadTickets());
$("search-tickets").addEventListener("input", debounce(() => loadTickets(), 400));
$("btn-refresh-tickets").addEventListener("click", () => { loadStats(); loadTickets(); });

function debounce(fn, delay) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

/* ════════════════════════════════════════════════════
   TICKET DETAIL
════════════════════════════════════════════════════ */
function selectTicket(ticketId) {
  selectedTicketId = ticketId;
  // Highlight in list
  document.querySelectorAll(".ticket-item").forEach(el => {
    el.classList.toggle("selected", el.dataset.id === ticketId);
  });
  $("ticket-detail-empty").setAttribute("hidden", "");
  $("ticket-detail-content").removeAttribute("hidden");
  loadTicketDetail(ticketId);

  // Join Socket.IO room for this ticket
  if (socket) {
    socket.emit("agent_join_room", { ticket_id: ticketId, agent_id: agentId });
  }
}

async function loadTicketDetail(ticketId) {
  try {
    const data = await apiRequest("GET", `/api/ticket/${ticketId}`);
    const t = data.ticket;
    const messages = data.messages || [];

    $("detail-ticket-id").textContent = t.ticket_id;
    $("detail-subject").textContent = t.subject || t.query || "No subject";
    $("detail-user-name").textContent = t.user_name || "Anonymous";
    $("detail-user-email").textContent = t.user_email || "Not provided";
    $("detail-dept").textContent = t.department || "General";
    $("detail-created").textContent = formatDate(t.created_at);
    $("detail-status-badge").textContent = t.status;
    $("detail-status-badge").className = `badge-status status-${t.status}`;
    $("detail-priority-badge").textContent = t.priority || "normal";
    $("detail-ai-summary").textContent = t.ai_summary || "No AI summary available.";
    $("detail-ai-resolution").textContent = t.resolution_notes ? `Resolution: ${t.resolution_notes}` : "";
    $("action-status-select").value = t.status;

    // Render messages
    const msgsEl = $("detail-messages");
    msgsEl.innerHTML = "";
    messages.forEach(msg => appendMessageBubble(msg, "detail-messages"));
    msgsEl.scrollTop = msgsEl.scrollHeight;

  } catch (err) {
    console.error("loadTicketDetail error:", err);
  }
}

function appendMessageBubble(msg, containerId) {
  const container = $(containerId);
  if (!container) return;
  const div = document.createElement("div");
  div.className = `msg-bubble ${esc(msg.sender_type)}`;
  div.innerHTML = `
    <div>${esc(msg.message)}</div>
    <div class="msg-meta">
      <strong>${esc(msg.sender_name || msg.sender_type)}</strong>
      · ${formatDate(msg.created_at)}
    </div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

/* ── Send Reply ── */
$("btn-send-reply").addEventListener("click", async () => {
  if (!selectedTicketId) return;
  const input = $("agent-reply-input");
  const isInternal = $("is-internal-note").checked;
  const message = input.value.trim();
  if (!message) return;
  try {
    await apiRequest("POST", `/api/ticket/${selectedTicketId}/message`, {
      message,
      sender_type: "agent",
      sender_name: agentId,
      is_internal: isInternal,
    });
    input.value = "";
    $("is-internal-note").checked = false;
  } catch (err) {
    alert(`Failed to send: ${err.message}`);
  }
});

/* ── Update Status ── */
$("btn-update-status").addEventListener("click", async () => {
  if (!selectedTicketId) return;
  const newStatus = $("action-status-select").value;
  try {
    await apiRequest("POST", `/api/ticket/${selectedTicketId}/status`, { status: newStatus });
    loadTicketDetail(selectedTicketId);
    loadTickets(false);
    loadStats();
  } catch (err) {
    alert(`Failed to update status: ${err.message}`);
  }
});

/* ── Resolve Ticket ── */
$("btn-resolve-ticket").addEventListener("click", async () => {
  if (!selectedTicketId) return;
  const notes = $("resolution-notes").value.trim();
  if (!notes) {
    alert("Please enter resolution notes before resolving.");
    return;
  }
  try {
    await apiRequest("POST", `/api/ticket/${selectedTicketId}/resolve`, { resolution_notes: notes });
    $("resolution-notes").value = "";
    loadTicketDetail(selectedTicketId);
    loadTickets(false);
    loadStats();
  } catch (err) {
    alert(`Failed to resolve ticket: ${err.message}`);
  }
});

/* ── Open Live Chat ── */
$("btn-open-live-chat").addEventListener("click", () => {
  if (!selectedTicketId) return;
  openLiveChatForTicket(selectedTicketId);
  // Switch to live chat panel
  document.querySelector("[data-panel='live-chat']").click();
});

/* ════════════════════════════════════════════════════
   LIVE CHAT PANEL
════════════════════════════════════════════════════ */
function openLiveChatForTicket(ticketId) {
  activeLiveTicket = ticketId;
  $("chat-window-empty").style.display = "none";
  $("live-chat-active").removeAttribute("hidden");
  $("live-ticket-id").textContent = ticketId;
  $("live-user-name").textContent = "User — " + ticketId;
  $("live-messages").innerHTML    = "";

  // Join Socket.IO room
  if (socket) {
    socket.emit("agent_join_room", { ticket_id: ticketId, agent_id: agentId });
  }

  // Add to sessions list
  const list = $("active-sessions-list");
  const noSessions = list.querySelector(".no-sessions");
  if (noSessions) noSessions.remove();
  if (!list.querySelector(`[data-ticket="${ticketId}"]`)) {
    const item = document.createElement("div");
    item.className = "session-item active";
    item.setAttribute("data-ticket", ticketId);
    item.innerHTML = `
      <div class="session-ticket-id">${esc(ticketId)}</div>
      <div class="session-user">Active session</div>`;
    item.addEventListener("click", () => openLiveChatForTicket(ticketId));
    list.appendChild(item);
    $("nav-live-count").textContent =
      (parseInt($("nav-live-count").textContent || "0") + 1).toString();
  }
}

/* Send live message */
$("btn-live-send").addEventListener("click", sendLiveMessage);
$("live-agent-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendLiveMessage(); }
});

function sendLiveMessage() {
  if (!activeLiveTicket) return;
  const input = $("live-agent-input");
  const message = input.value.trim();
  if (!message) return;
  if (socket) {
    socket.emit("send_message", {
      ticket_id: activeLiveTicket,
      message,
      sender_type: "agent",
      sender_name: agentId,
    });
  }
  input.value = "";
}

$("live-agent-input").addEventListener("input", () => {
  if (!activeLiveTicket || !socket) return;
  socket.emit("typing", {
    ticket_id: activeLiveTicket,
    sender_type: "agent",
    sender_name: agentId,
  });
});

$("btn-end-chat").addEventListener("click", () => {
  if (!activeLiveTicket || !socket) return;
  socket.emit("send_message", {
    ticket_id: activeLiveTicket,
    message: "The agent has ended this chat session. Your ticket remains open for follow-up.",
    sender_type: "system",
    sender_name: "System",
  });
  activeLiveTicket = null;
  $("live-chat-active").setAttribute("hidden", "");
  $("chat-window-empty").style.display = "";
});

/* ════════════════════════════════════════════════════
   SETTINGS — EMAIL CONFIG
════════════════════════════════════════════════════ */
async function loadEmailConfig() {
  try {
    const data = await apiRequest("GET", "/api/email-config");
    const all = data.all_emails || [];
    $("email-1").value = all[0] || "";
    $("email-2").value = all[1] || "";
    $("email-3").value = all[2] || "";

    // Populate SMTP info (just host/user — no password shown)
    const smtpUser = data.smtp_user || "";
    const smtpHost = data.smtp_host || "";
    const smtpConfigured = data.smtp_configured || false;
    $("smtp-display-host").textContent = smtpHost || "Not configured";
    $("smtp-display-user").textContent = smtpUser || "Not configured";
    $("smtp-display-status").textContent = smtpConfigured ? "✅ Configured" : "⚠️ Not configured";
    $("smtp-display-status").style.color = smtpConfigured ? "var(--success)" : "var(--warning)";

    // Pre-fill test email from configured email
    if (!$("test-email-addr").value && all[0]) {
      $("test-email-addr").value = all[0];
    }
  } catch (err) {
    console.error("loadEmailConfig error:", err);
  }
}

$("btn-save-emails").addEventListener("click", async () => {
  const emails = [
    $("email-1").value.trim(),
    $("email-2").value.trim(),
    $("email-3").value.trim(),
  ].filter(e => e && e.includes("@"));

  const statusEl = $("email-config-status");
  try {
    await apiRequest("POST", "/api/email-config", { emails });
    statusEl.textContent = "✅ Email configuration saved.";
    statusEl.style.color = "var(--success)";
  } catch (err) {
    statusEl.textContent = `❌ Failed: ${err.message}`;
    statusEl.style.color = "var(--danger)";
  }
  setTimeout(() => statusEl.textContent = "", 4000);
});

/* ── Test Email ── */
document.addEventListener("DOMContentLoaded", () => {
  const testBtn = $("btn-test-email");
  if (!testBtn) return;
  testBtn.addEventListener("click", async () => {
    const addr = $("test-email-addr").value.trim();
    const statusEl = $("test-email-status");
    if (!addr || !addr.includes("@")) {
      statusEl.textContent = "❌ Enter a valid email address.";
      statusEl.style.color = "var(--danger)";
      return;
    }
    testBtn.textContent = "Sending…";
    testBtn.disabled = true;
    statusEl.textContent = "";
    try {
      const data = await apiRequest("POST", "/api/test-email", { email: addr });
      if (data.success) {
        statusEl.innerHTML = `✅ <strong>${data.message}</strong>`;
        statusEl.style.color = "var(--success)";
      } else {
        statusEl.innerHTML = `❌ ${data.error || "Unknown error"}`;
        if (data.help_url) {
          statusEl.innerHTML += ` <a href="${data.help_url}" target="_blank" rel="noopener" style="color:var(--accent)">Get App Password →</a>`;
        }
        statusEl.style.color = "var(--danger)";
      }
    } catch (err) {
      statusEl.textContent = `❌ ${err.message}`;
      statusEl.style.color = "var(--danger)";
    } finally {
      testBtn.textContent = "Send Test Email";
      testBtn.disabled = false;
    }
  });
});

/* ════════════════════════════════════════════════════
   HEARTBEAT — keep agent marked online
════════════════════════════════════════════════════ */
function startHeartbeat() {
  setInterval(async () => {
    try {
      await apiRequest("POST", "/api/agent/heartbeat");
    } catch { /* silent */ }
  }, 60000);
}
