// pglService.ts
// DROP-IN REPLACEMENT for dbService.ts.
// Same exported function names/signatures App.tsx already calls — only the
// import line in App.tsx needs to change (see bottom of this file for the
// one-line swap). Internals are backed by the real gnomledger FastAPI
// backend (pgl-jade.vercel.app) via gnomledgerApi.ts, instead of Firestore.
//
// KNOWN GAP: gnomledger has no /incidents or /reminders routes yet (types
// exist, backend routes don't). Those functions below are honest no-op /
// local-only stubs — they will NOT silently pretend to persist to a real
// backend. See inline TODOs.

import {
  AgentRecord,
  LedgerEvent,
  IncidentRecord,
  BillingUsage,
  AuditReminder
} from "./types";
import * as pgl from "./gnomledgerApi";
import type { AgentDetail, LedgerEvent as GLLedgerEvent, BillingUsage as GLBillingUsage, IncidentRecord as GLIncidentRecord, AuditReminder as GLAuditReminder } from "./gnomledgerTypes";
import { getOrCreateSession } from "./pglSession";

// ---------------------------------------------------------------------------
// Field mapping: gnomledger shapes -> pgl-studioai UI shapes
// ---------------------------------------------------------------------------

function mapAgent(a: AgentDetail): AgentRecord {
  return {
    id: a.agent_id,
    name: a.name,
    creator: a.creator,
    jurisdiction: a.jurisdiction,
    created_at: a.created_at,
    is_revoked: a.status === "revoked",
    parent_agent_ids: a.parent_agent_ids,
    genome: a.genome,
    certificate: {
      serial_number: a.certificate_id,
      genome_hash: a.latest_genome_hash,
      signature: a.certificate_uri ?? ""
    },
    active_version: a.version_count,
    genome_versions: [] // populated on-demand via ledger/version history if the UI drills in
  } as AgentRecord;
}

function mapLedgerEvent(e: GLLedgerEvent, agentId: string): LedgerEvent {
  return {
    id: e.event_id,
    agent_id: agentId,
    timestamp: e.created_at,
    event_type: (e.event_type as LedgerEvent["event_type"]) ?? "custom",
    title: e.summary,
    description: JSON.stringify(e.details ?? {}),
    operator: e.actor,
    prev_event_hash: e.prev_event_hash ?? "",
    event_hash: e.event_hash
  };
}

// Backend severity includes "critical", frontend UI type doesn't — maps down
// to "high" on read. Write path passes the real value through unchanged.
function mapIncidentSeverityForUI(s: "low" | "medium" | "high" | "critical"): "low" | "medium" | "high" {
  return s === "critical" ? "high" : s;
}

function mapIncidentStatusForUI(s: "open" | "investigating" | "resolved" | "closed"): "open" | "remediated" | "investigating" {
  if (s === "resolved" || s === "closed") return "remediated";
  return s;
}

function mapIncident(inc: GLIncidentRecord, agentNameById: Map<string, string>): IncidentRecord {
  return {
    id: inc.incident_id,
    agent_id: inc.agent_id,
    agent_name: agentNameById.get(inc.agent_id) ?? inc.agent_id,
    title: inc.title,
    description: inc.description,
    severity: mapIncidentSeverityForUI(inc.severity),
    reported_at: inc.created_at,
    status: mapIncidentStatusForUI(inc.status),
    remediation_notes: inc.resolution_notes ?? undefined
  };
}

function mapReminder(rem: GLAuditReminder, agentNameById: Map<string, string>): AuditReminder {
  const target = new Date(rem.next_trigger_at).getTime();
  const created = new Date(rem.created_at).getTime();
  const daysRemaining = Math.max(0, Math.round((target - Date.now()) / 86_400_000));
  return {
    id: rem.reminder_id,
    agentId: rem.agent_id,
    agentName: agentNameById.get(rem.agent_id) ?? rem.agent_id,
    days: daysRemaining,
    scheduledAt: rem.created_at,
    targetTime: rem.next_trigger_at,
    triggered: rem.last_triggered_at !== null
  };
}
// Real backend billing is per-metric time series (metric, amount, period_start,
// period_end). The UI wants a single tier-dashboard object. This aggregates the
// real data into that shape rather than guessing — tier limits are config
// (see TIER_LIMITS below), everything else is computed from real usage rows.
// Real pricing, decided 2026 — replaces inherited mock/demo numbers.
// Free tier for adoption, Starter for solo/small teams, Growth for production
// usage, Enterprise custom. See x402PricingClient.ts for the pay-per-call
// alternative for machine callers that don't want a subscription at all.
const TIER_LIMITS: Record<BillingUsage["tier"], Omit<BillingUsage, "tier" | "active_agents" | "ledger_storage_mb" | "lineage_renders">> = {
  free: { agent_limit: 3, storage_limit_mb: 250, renders_limit: 50, price_monthly: 0, overage_agent_fee: 0 }, // hard cap, no overage
  launch: { agent_limit: 25, storage_limit_mb: 5000, renders_limit: 1000, price_monthly: 49, overage_agent_fee: 2 },
  scale: { agent_limit: 250, storage_limit_mb: 50000, renders_limit: 10000, price_monthly: 199, overage_agent_fee: 1 },
  enterprise: { agent_limit: 999999, storage_limit_mb: 1000000, renders_limit: 999999, price_monthly: 0, overage_agent_fee: 0 } // custom quote, not self-serve
};

function aggregateBilling(rows: GLBillingUsage[], tier: BillingUsage["tier"]): BillingUsage {
  const sum = (metric: string) => rows.filter(r => r.metric === metric).reduce((acc, r) => acc + r.amount, 0);
  const limits = TIER_LIMITS[tier];
  return {
    tier,
    active_agents: sum("active_agents"),
    ledger_storage_mb: sum("ledger_storage_mb"),
    lineage_renders: sum("lineage_renders"),
    ...limits
  };
}

// ---------------------------------------------------------------------------
// bootstrapDatabaseIfEmpty -> now "load real state from gnomledger"
// Name kept identical to dbService.ts so App.tsx doesn't need to change its
// call site — only the import line changes.
// ---------------------------------------------------------------------------

export async function bootstrapDatabaseIfEmpty(): Promise<{
  agents: AgentRecord[];
  events: LedgerEvent[];
  incidents: IncidentRecord[];
  billing: BillingUsage;
}> {
  const session = await getOrCreateSession();

  const glAgents = await pgl.listAgents(session);
  const agents = glAgents.map(mapAgent);

  const eventLists = await Promise.all(
    glAgents.map(a => pgl.getAgentHistory(session, a.agent_id))
  );
  const events = eventLists
    .flatMap((list, i) => list.map(e => mapLedgerEvent(e, glAgents[i].agent_id)))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const usageRows = await pgl.getUsage(session);
  const billing = aggregateBilling(usageRows, "free"); // TODO: read real tier from account once that field exists on SessionState

  const agentNameById = new Map(glAgents.map(a => [a.agent_id, a.name]));
  const glIncidents = await pgl.listIncidents(session);
  const incidents = glIncidents.map(i => mapIncident(i, agentNameById));

  agents.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return { agents, events, incidents, billing };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function saveAgentToFirestore(agent: AgentRecord): Promise<boolean> {
  try {
    const session = await getOrCreateSession();
    await pgl.createAgent(session, {
      name: agent.name,
      creator: agent.creator,
      jurisdiction: agent.jurisdiction,
      genome: agent.genome,
      parent_agent_ids: agent.parent_agent_ids
    });
    return true;
  } catch (err) {
    console.error("pglService.saveAgentToFirestore failed:", err);
    return false;
  }
}

export async function saveLedgerEventToFirestore(event: LedgerEvent): Promise<boolean> {
  // gnomledger's ledger events are written server-side as a byproduct of
  // agent/genome mutations (see certificate_service.py), not posted directly
  // by the client in most flows. If App.tsx calls this for a genuinely
  // custom/manual event, wire it to POST /ledger/events here:
  try {
    const session = await getOrCreateSession();
    await pgl.createLedgerEvent(session, {
      agent_id: event.agent_id,
      event_type: "custom",
      actor: event.operator,
      summary: event.title,
      details: { description: event.description }
    });
    return true;
  } catch (err) {
    console.error("pglService.saveLedgerEventToFirestore failed:", err);
    return false;
  }
}

export async function updateAgentInFirestore(agent: AgentRecord): Promise<boolean> {
  try {
    const session = await getOrCreateSession();
    await pgl.updateGenome(session, agent.id, agent.genome);
    return true;
  } catch (err) {
    console.error("pglService.updateAgentInFirestore failed:", err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Incidents / Reminders — NO BACKEND ROUTE YET.
// These are honest local-session-only stubs (not Firestore, not persisted
// server-side) so the UI doesn't crash. They log a warning so this gap stays
// visible instead of silently "working." Wire these to real endpoints once
// backend/app/routes/incidents.py and reminders.py exist.
// ---------------------------------------------------------------------------

export async function saveIncidentToFirestore(inc: IncidentRecord): Promise<boolean> {
  try {
    const session = await getOrCreateSession();
    await pgl.createIncident(session, {
      agent_id: inc.agent_id,
      // "critical" is a valid backend severity but not in the UI's type union;
      // this cast is safe since the UI never actually produces "critical".
      severity: inc.severity as "low" | "medium" | "high" | "critical",
      title: inc.title,
      description: inc.description,
      // App.tsx doesn't track a reporter field on IncidentRecord (it only
      // embeds the operator on the paired ledger event). Using a fixed
      // studio-identity label, consistent with admin_name in pglSession.ts.
      reporter: "pgl-studio-operator"
    });
    return true;
  } catch (err) {
    console.error("pglService.saveIncidentToFirestore failed:", err);
    return false;
  }
}

export async function remediateIncidentInFirestore(
  incId: string,
  status: "remediated" | "investigating",
  notes: string
): Promise<boolean> {
  try {
    const session = await getOrCreateSession();
    // Backend uses "resolved"/"closed"/"investigating"/"open"; UI's "remediated" maps to "resolved".
    await pgl.updateIncident(session, incId, {
      status: status === "remediated" ? "resolved" : "investigating",
      resolution_notes: notes
    });
    return true;
  } catch (err) {
    console.error("pglService.remediateIncidentInFirestore failed:", err);
    return false;
  }
}

export async function updateBillingInFirestore(billing: BillingUsage): Promise<boolean> {
  // Real billing is derived from usage events server-side, not client-writable.
  console.warn("pglService: billing is computed from real usage server-side and is not directly writable.");
  return false;
}

export async function getRemindersFromFirestore(): Promise<AuditReminder[]> {
  try {
    const session = await getOrCreateSession();
    const [glReminders, glAgents] = await Promise.all([
      pgl.listAuditReminders(session),
      pgl.listAgents(session)
    ]);
    const agentNameById = new Map(glAgents.map(a => [a.agent_id, a.name]));
    return glReminders.map(r => mapReminder(r, agentNameById));
  } catch (err) {
    console.error("pglService.getRemindersFromFirestore failed:", err);
    return [];
  }
}

export async function saveReminderToFirestore(reminder: AuditReminder): Promise<boolean> {
  try {
    const session = await getOrCreateSession();
    // App.tsx's AuditReminder has no title/message/frequency fields — this is
    // a one-shot "verification due in N days" reminder, reconstructed here
    // from the fields that do exist (agentName, days, targetTime).
    await pgl.createAuditReminder(session, {
      agent_id: reminder.agentId,
      title: `Verification Reminder: ${reminder.agentName}`,
      message: `Scheduled agent verification/audit check for ${reminder.agentName}, due in ${reminder.days} day(s).`,
      frequency: "once",
      next_trigger_at: reminder.targetTime
    });
    return true;
  } catch (err) {
    console.error("pglService.saveReminderToFirestore failed:", err);
    return false;
  }
}

export async function deleteReminderFromFirestore(reminderId: string): Promise<boolean> {
  try {
    const session = await getOrCreateSession();
    await pgl.deleteAuditReminder(session, reminderId);
    return true;
  } catch (err) {
    console.error("pglService.deleteReminderFromFirestore failed:", err);
    return false;
  }
}
