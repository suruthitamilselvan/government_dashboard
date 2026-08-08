// Central API client — all calls to Flask backend
const BASE = '';

async function req(method, path, body, signal) {
  const opts = { method, headers: { 'Content-Type': 'application/json' }, signal };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  chat:          (body)           => req('POST', '/api/chat', body),
  eligibility:   (body)           => req('POST', '/api/eligibility', body),
  nameCompare:   (body)           => req('POST', '/api/name-compare', body),
  analytics:     ()               => req('GET',  '/api/analytics'),
  govSource:     (service)        => req('GET',  `/api/gov-source/${service}`),
  createTicket:  (body)           => req('POST', '/api/ticket', body),
  getTicket:     (id)             => req('GET',  `/api/ticket/${id}`),
  addMessage:    (id, body)       => req('POST', `/api/ticket/${id}/message`, body),
  escalate:      (body)           => req('POST', '/api/escalate-to-agent', body),
  agentLogin:    (body)           => req('POST', '/api/agent/login', body),
  listTickets:   (headers)        => fetch('/api/tickets', { headers }).then(r => r.json()),
  updateStatus:  (id, body, h)    => fetch(`/api/ticket/${id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body) }).then(r => r.json()),
  resolveTicket: (id, body, h)    => fetch(`/api/ticket/${id}/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body) }).then(r => r.json()),
  getEmailConfig:(headers)        => fetch('/api/email-config', { headers }).then(r => r.json()),
  setEmailConfig:(body, headers)  => fetch('/api/email-config', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }).then(r => r.json()),
  heartbeat:     (headers)        => fetch('/api/agent/heartbeat', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: '{}' }).then(r => r.json()),
  testEmail:     (body, headers)  => fetch('/api/test-email', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }).then(r => r.json()),
};
