import type {
  AgentDetail,
  AuditReminder,
  AuditReminderFrequency,
  BillingUsage,
  BootstrapResponse,
  ExecutionIdentityV1,
  GoogleSheetsSyncConfig,
  GoogleSheetsSyncResult,
  IncidentRecord,
  IncidentSeverity,
  IncidentStatus,
  LedgerEvent,
  LineageTreeNode,
  NotaryChatRequest,
  NotaryChatResponse,
  SessionState,
  UsageLimit
} from "./gnomledgerTypes";

const API_ROOT = import.meta.env?.VITE_API_URL || "/api/v1";

function normalizeErrorMessage(raw: string, status: number) {
  if (!raw) {
    return `Request failed with status ${status}`;
  }

  try {
    const parsed = JSON.parse(raw) as { detail?: string };
    if (typeof parsed.detail === "string" && parsed.detail.trim()) {
      return parsed.detail;
    }
  } catch {
    return raw;
  }

  return raw;
}

async function request<T>(path: string, init?: RequestInit, session?: SessionState | null): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (session?.apiKey) {
    headers.set("x-api-key", session.apiKey);
  }

  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(normalizeErrorMessage(text, response.status));
  }

  return (await response.json()) as T;
}

export async function getHealth(): Promise<{ status: string; timestamp: string }> {
  const response = await fetch("/health");
  if (!response.ok) {
    throw new Error("Health check failed");
  }
  return (await response.json()) as { status: string; timestamp: string };
}

export function bootstrapAccount(payload: {
  bootstrap_token: string;
  account_name: string;
  account_tier: "free" | "launch" | "scale" | "enterprise";
  admin_name: string;
}) {
  return request<BootstrapResponse>("/admin/bootstrap", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function listAgents(session: SessionState) {
  return request<AgentDetail[]>("/agents", undefined, session);
}

export function createAgent(session: SessionState, payload: unknown) {
  return request<AgentDetail>("/agents", {
    method: "POST",
    body: JSON.stringify(payload)
  }, session);
}

export function getAgentHistory(session: SessionState, agentId: string) {
  return request<LedgerEvent[]>(`/ledger/agents/${agentId}`, undefined, session);
}

// NOTE: documented in gnomledger README API surface (POST /ledger/events) but
// was missing from this client — added here rather than left as a gap.
export function createLedgerEvent(
  session: SessionState,
  payload: {
    agent_id: string;
    event_type: "birth_registration" | "mutation_update" | "test_audit" | "deployment" | "incident" | "custom";
    actor: string;
    summary: string;
    details: Record<string, unknown>;
    idempotency_key?: string;
  }
) {
  return request<LedgerEvent>("/ledger/events", {
    method: "POST",
    body: JSON.stringify(payload)
  }, session);
}

// NOTE: documented in gnomledger README API surface (PATCH /agents/{agent_id}/genome)
// but was missing from this client — added here rather than left as a gap.
export function updateGenome(session: SessionState, agentId: string, genome: unknown) {
  return request<AgentDetail>(`/agents/${agentId}/genome`, {
    method: "PATCH",
    body: JSON.stringify({ genome })
  }, session);
}

export function verifyAgentHistory(session: SessionState, agentId: string) {
  return request<{
    valid: boolean;
    latest_event_hash: string | null;
    checked_events: number;
    first_event_at: string | null;
    last_event_at: string | null;
    errors: string[];
  }>(`/ledger/agents/${agentId}/verify`, undefined, session);
}

export function getLineageTree(session: SessionState, agentId: string) {
  return request<LineageTreeNode>(`/lineage/tree/${agentId}`, undefined, session);
}

export function getUsage(session: SessionState) {
  return request<BillingUsage[]>("/billing/usage", undefined, session);
}

export function getUsageLimit(session: SessionState, metric: string) {
  return request<UsageLimit>(`/billing/usage/${metric}/limit`, undefined, session);
}

// ---------------------------------------------------------------------------
// Notary (Gemini AI — server-side)
// ---------------------------------------------------------------------------

export function notaryChat(session: SessionState, payload: NotaryChatRequest) {
  return request<NotaryChatResponse>("/notary/chat", {
    method: "POST",
    body: JSON.stringify(payload)
  }, session);
}

// ---------------------------------------------------------------------------
// Incidents
// ---------------------------------------------------------------------------

export function listIncidents(session: SessionState, agentId?: string) {
  const qs = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : "";
  return request<IncidentRecord[]>(`/incidents${qs}`, undefined, session);
}

export function createIncident(
  session: SessionState,
  payload: { agent_id: string; severity: IncidentSeverity; title: string; description: string; reporter: string }
) {
  return request<IncidentRecord>("/incidents", {
    method: "POST",
    body: JSON.stringify(payload)
  }, session);
}

export function updateIncident(
  session: SessionState,
  incidentId: string,
  payload: { status: IncidentStatus; resolution_notes?: string | null }
) {
  return request<IncidentRecord>(`/incidents/${incidentId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  }, session);
}

// ---------------------------------------------------------------------------
// Audit Reminders
// ---------------------------------------------------------------------------

export function listAuditReminders(session: SessionState, agentId?: string) {
  const qs = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : "";
  return request<AuditReminder[]>(`/reminders${qs}`, undefined, session);
}

export function createAuditReminder(
  session: SessionState,
  payload: { agent_id: string; title: string; message: string; frequency: AuditReminderFrequency; next_trigger_at: string }
) {
  return request<AuditReminder>("/reminders", {
    method: "POST",
    body: JSON.stringify(payload)
  }, session);
}

export function deleteAuditReminder(session: SessionState, reminderId: string) {
  return request<void>(`/reminders/${reminderId}`, {
    method: "DELETE"
  }, session);
}

// ---------------------------------------------------------------------------
// Google Sheets Sync
// ---------------------------------------------------------------------------

export function googleSheetsSync(session: SessionState, config: GoogleSheetsSyncConfig) {
  return request<GoogleSheetsSyncResult>("/integrations/google-sheets/sync", {
    method: "POST",
    body: JSON.stringify(config)
  }, session);
}

// ---------------------------------------------------------------------------
// Execution Identity V1
// ---------------------------------------------------------------------------

export function getExecutionIdentity(session: SessionState, agentId: string) {
  return request<ExecutionIdentityV1>(`/agents/${agentId}/identity`, undefined, session);
}
