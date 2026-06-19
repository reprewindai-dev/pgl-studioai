import { AgentRecord, LedgerEvent, IncidentRecord } from "./types";

// Dynamic string hashing to simulate ledger hashing checks
export function computeEventHash(event: Omit<LedgerEvent, "event_hash">): string {
  const dataString = `${event.id}|${event.agent_id}|${event.timestamp}|${event.event_type}|${event.title}|${event.description}|${event.operator}|${event.prev_event_hash}`;
  let hash = 0;
  for (let i = 0; i < dataString.length; i++) {
    const char = dataString.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return "hash_" + Math.abs(hash).toString(16).padStart(8, "0") + "x9v2";
}

// Alpha Agent definition
export const DEMO_AGENT_ALPHA: AgentRecord = {
  id: "agent-alpha-001",
  name: "Aegis-Alpha (Clinical Summary Agent)",
  creator: "VEKLM Biotech Solutions",
  jurisdiction: "US-MA",
  created_at: "2026-05-10T10:00:00Z",
  is_revoked: false,
  parent_agent_ids: [],
  active_version: 2,
  genome: {
    model_family: "gemini-2.5-pro",
    model_version: "v1.1",
    architecture: "reflective-clinical-analyst",
    tools: ["ehr-database-fetcher", "medical-abbreviation-decoder"],
    permissions: ["read:patient_records", "write:summary_drafts"],
    safety_rules: ["pii-masking-active", "no-unapproved-diagnostics"],
    runtime_config: {
      temperature: 0.1,
      max_steps: 8
    },
    intended_use: "Summarization of patient admission reports and electronic health record charts.",
    risk_category: "high"
  },
  certificate: {
    id: "cert-alpha-9988",
    serial_number: "PGL-2026-A001-C7",
    issuance_date: "2026-05-10T10:05:00Z",
    genome_hash: "0f4b3c99a812e3e58983bbad2211eef2a91f",
    signature: "SIG_0x7ea92fc91238efde73b1a209930fca611a2de931e98bbcf"
  },
  genome_versions: [
    {
      version: 1,
      timestamp: "2026-05-10T10:00:00Z",
      genome: {
        model_family: "gemini-2.0-flash",
        model_version: "v1.0",
        architecture: "clinical-analyst-legacy",
        tools: ["ehr-database-fetcher"],
        permissions: ["read:patient_records"],
        safety_rules: ["pii-masking-active"],
        runtime_config: {
          temperature: 0.2,
          max_steps: 5
        },
        intended_use: "Summarization of patient charts (Prototype).",
        risk_category: "medium"
      },
      hash: "a43eef6a08412ff489df"
    },
    {
      version: 2,
      timestamp: "2026-05-24T14:30:00Z",
      genome: {
        model_family: "gemini-2.5-pro",
        model_version: "v1.1",
        architecture: "reflective-clinical-analyst",
        tools: ["ehr-database-fetcher", "medical-abbreviation-decoder"],
        permissions: ["read:patient_records", "write:summary_drafts"],
        safety_rules: ["pii-masking-active", "no-unapproved-diagnostics"],
        runtime_config: {
          temperature: 0.1,
          max_steps: 8
        },
        intended_use: "Summarization of patient admission reports and electronic health record charts.",
        risk_category: "high"
      },
      hash: "0f4b3c99a812e3e58983bbad2211eef2a91f"
    }
  ]
};

// Beta Agent (Forked from Alpha, focused on patient outreach and support)
export const DEMO_AGENT_BETA: AgentRecord = {
  id: "agent-beta-002",
  name: "Boreas-Beta (Patient Outreach Support)",
  creator: "VEKLM Care Networks",
  jurisdiction: "CA-ON",
  created_at: "2026-05-28T09:15:00Z",
  is_revoked: false,
  parent_agent_ids: ["agent-alpha-001"],
  active_version: 1,
  genome: {
    model_family: "gemini-2.5-flash",
    model_version: "v1.0",
    architecture: "conversational-care-navigator",
    tools: ["calendar-event-scheduler", "outreach-templated-emailer"],
    permissions: ["read:patient_contact", "write:appointments", "send:notifications"],
    safety_rules: ["human-in-the-loop-for-medical-advice", "empathy-guardrails-v2", "no-medical-diagnosing"],
    runtime_config: {
      temperature: 0.4,
      max_steps: 10
    },
    intended_use: "Proactively reach out to newly discharged patients to schedule follow-up diagnostic clinics.",
    risk_category: "critical"
  },
  certificate: {
    id: "cert-beta-1204",
    serial_number: "PGL-2026-B002-FA",
    issuance_date: "2026-05-28T09:20:00Z",
    genome_hash: "9312fe29ab34105fedcbb321da3b890aef43",
    signature: "SIG_0xca838fe12d0994fa734abce1287dfa32b919a3bb94da2de"
  },
  genome_versions: [
    {
      version: 1,
      timestamp: "2026-05-28T09:15:00Z",
      genome: {
        model_family: "gemini-2.5-flash",
        model_version: "v1.0",
        architecture: "conversational-care-navigator",
        tools: ["calendar-event-scheduler", "outreach-templated-emailer"],
        permissions: ["read:patient_contact", "write:appointments", "send:notifications"],
        safety_rules: ["human-in-the-loop-for-medical-advice", "empathy-guardrails-v2", "no-medical-diagnosing"],
        runtime_config: {
          temperature: 0.4,
          max_steps: 10
        },
        intended_use: "Proactively reach out to newly discharged patients to schedule follow-up diagnostic clinics.",
        risk_category: "critical"
      },
      hash: "9312fe29ab34105fedcbb321da3b890aef43"
    }
  ]
};

// Sentinel-Prime (Next-gen task autonomous operator descending of Beta)
export const DEMO_AGENT_SENTINEL: AgentRecord = {
  id: "agent-sentinel-003",
  name: "Sentinel-Prime (Integrations Operator)",
  creator: "VEKLM Platform Engineering",
  jurisdiction: "CA-ON",
  created_at: "2026-06-05T11:45:00Z",
  is_revoked: false,
  parent_agent_ids: ["agent-beta-002"],
  active_version: 1,
  genome: {
    model_family: "gemini-2.5-pro",
    model_version: "v2.0",
    architecture: "tool-using-agent",
    tools: ["crm-sync-client", "secure-web-browser", "corporate-email-gateway"],
    permissions: ["read:customer_profiles", "write:crm_records", "send:external_emails"],
    safety_rules: ["human-review-for-payments", "no-unapproved-data-export", "strict-domain-containment"],
    runtime_config: {
      temperature: 0.2,
      max_steps: 12
    },
    intended_use: "Automate administrative synchronization processes between patient registries and medical equipment CRM.",
    risk_category: "medium"
  },
  certificate: {
    id: "cert-sentinel-7422",
    serial_number: "PGL-2026-S003-E5",
    issuance_date: "2026-06-05T11:50:00Z",
    genome_hash: "28e78fa31599ade251e6002bbd097c0da98e",
    signature: "SIG_0xbf9c3b8da7ef10a904cf7ee9d8e7ae38fb193ed7a1ee92"
  },
  genome_versions: [
    {
      version: 1,
      timestamp: "2026-06-05T11:45:00Z",
      genome: {
        model_family: "gemini-2.5-pro",
        model_version: "v2.0",
        architecture: "tool-using-agent",
        tools: ["crm-sync-client", "secure-web-browser", "corporate-email-gateway"],
        permissions: ["read:customer_profiles", "write:crm_records", "send:external_emails"],
        safety_rules: ["human-review-for-payments", "no-unapproved-data-export", "strict-domain-containment"],
        runtime_config: {
          temperature: 0.2,
          max_steps: 12
        },
        intended_use: "Automate administrative synchronization processes between patient registries and medical equipment CRM.",
        risk_category: "medium"
      },
      hash: "28e78fa31599ade251e6002bbd097c0da98e"
    }
  ]
};

// Pre-seeded Ledger Events for the storyline with full hash coupling!
export const generateDemoLedger = (): LedgerEvent[] => {
  const events: LedgerEvent[] = [];

  // 1. Birth Event of Aegis-Alpha
  const ev1: LedgerEvent = {
    id: "evt-001",
    agent_id: "agent-alpha-001",
    timestamp: "2026-05-10T10:00:00Z",
    event_type: "birth",
    title: "Birth Certificate Registered",
    description: "Registry birth authorization complete. Genesis certificate issued under serial PGL-2026-A001-C7 of VEKLM Biotech Solutions.",
    operator: "notary-admin@veklom.com",
    prev_event_hash: "00000000000000000000000000000000",
    event_hash: ""
  };
  ev1.event_hash = computeEventHash(ev1);
  events.push(ev1);

  // 2. Deployment of Alpha v1.0
  const ev2: LedgerEvent = {
    id: "evt-002",
    agent_id: "agent-alpha-001",
    timestamp: "2026-05-11T08:15:00Z",
    event_type: "deployment",
    title: "Deployed to Production Cluster",
    description: "Instance spawned successfully on AWS EKS cluster pod ae-a101-92b8 in US-MA region. Active state: monitoring patient ingress drafts.",
    operator: "ops-engineer-4@veklom.com",
    prev_event_hash: ev1.event_hash,
    event_hash: ""
  };
  ev2.event_hash = computeEventHash(ev2);
  events.push(ev2);

  // 3. Incident with Alpha v1.0 (Minor medication unit hallucination corrected by human validation gate)
  const ev3: LedgerEvent = {
    id: "evt-003",
    agent_id: "agent-alpha-001",
    timestamp: "2026-05-18T16:42:00Z",
    event_type: "incident",
    title: "Medication Volume Abnormality Flagged",
    description: "The agent attempted to draft a chart requiring 500mg instead of 50mg of Aspirin. Intercepted by human-in-the-loop reviewing pharmacist. Severity low.",
    operator: "pharmacy-verifier-9@veklom.com",
    prev_event_hash: ev2.event_hash,
    event_hash: "",
    severity: "low"
  };
  ev3.event_hash = computeEventHash(ev3);
  events.push(ev3);

  // 4. Audit review of Alpha
  const ev4: LedgerEvent = {
    id: "evt-004",
    agent_id: "agent-alpha-001",
    timestamp: "2026-05-20T11:00:00Z",
    event_type: "audit",
    title: "Post-Incident Genome Audit Complete",
    description: "Security and stability audit of clinical-analyst-legacy. Recommended migrating to Gemini 2.5 Pro with self-reflection loop constraints and explicit dosage verification rules.",
    operator: "security-auditor@veklom.com",
    prev_event_hash: ev3.event_hash,
    event_hash: ""
  };
  ev4.event_hash = computeEventHash(ev4);
  events.push(ev4);

  // 5. Genome update of Alpha to v1.1
  const ev5: LedgerEvent = {
    id: "evt-005",
    agent_id: "agent-alpha-001",
    timestamp: "2026-05-24T14:30:00Z",
    event_type: "genome_update",
    title: "Genome Upgraded to v1.1",
    description: "Migrated brain model from gemini-2.0-flash to gemini-2.5-pro. Added safety rule 'no-unapproved-diagnostics' and EHR decoding tool. Re-hashed registry fingerprint.",
    operator: "lead-scientist@veklom.com",
    prev_event_hash: ev4.event_hash,
    event_hash: ""
  };
  ev5.event_hash = computeEventHash(ev5);
  events.push(ev5);

  // 6. Birth of Boreas-Beta (Forked lineage!)
  const ev6: LedgerEvent = {
    id: "evt-006",
    agent_id: "agent-beta-002",
    timestamp: "2026-05-28T09:15:00Z",
    event_type: "birth",
    title: "Birth Certificate Registered (Fork Lineage)",
    description: "Boreas-Beta birth certificate complete under serial PGL-2026-B002-FA. Genome inherits patient outreach goals and forked parent Aegis-Alpha ancestry.",
    operator: "notary-admin@veklom.com",
    prev_event_hash: "00000000000000000000000000000000", // Genesis for this agent
    event_hash: ""
  };
  ev6.event_hash = computeEventHash(ev6);
  events.push(ev6);

  // 7. Engagement deployment of Beta
  const ev7: LedgerEvent = {
    id: "evt-007",
    agent_id: "agent-beta-002",
    timestamp: "2026-05-29T10:00:00Z",
    event_type: "deployment",
    title: "Deployed Outreach Client",
    description: "Connected outreach templates engine to live active contact directory in CA-ON region.",
    operator: "patient-relations-lead@veklom.com",
    prev_event_hash: ev6.event_hash,
    event_hash: ""
  };
  ev7.event_hash = computeEventHash(ev7);
  events.push(ev7);

  // 8. Birth of Sentinel-Prime
  const ev8: LedgerEvent = {
    id: "evt-008",
    agent_id: "agent-sentinel-003",
    timestamp: "2026-06-05T11:45:00Z",
    event_type: "birth",
    title: "Birth Certificate Registered (Grandchild Lineage)",
    description: "Sentinel-Prime birth authorization complete under serial PGL-2026-S003-E5. Parent linked: Boreas-Beta.",
    operator: "notary-admin@veklom.com",
    prev_event_hash: "00000000000000000000000000000000", // Genesis for this agent
    event_hash: ""
  };
  ev8.event_hash = computeEventHash(ev8);
  events.push(ev8);

  // 9. Deployment of Sentinel-Prime
  const ev9: LedgerEvent = {
    id: "evt-009",
    agent_id: "agent-sentinel-003",
    timestamp: "2026-06-06T12:00:00Z",
    event_type: "deployment",
    title: "CRM Syncer Online",
    description: "Spanned background workers on Hetzner VM to begin automated pipeline synchronizations recursively.",
    operator: "ops-engineer-4@veklom.com",
    prev_event_hash: ev8.event_hash,
    event_hash: ""
  };
  ev9.event_hash = computeEventHash(ev9);
  events.push(ev9);

  return events;
};

// Preloaded Incident Records for alpha-beta
export const DEMO_INCIDENTS: IncidentRecord[] = [
  {
    id: "inc-001",
    agent_id: "agent-alpha-001",
    agent_name: "Aegis-Alpha (Clinical Summary Agent)",
    title: "Medication Volume Abnormality Flagged",
    description: "During summarization, Aegis-Alpha hallucinated transcription volume units on codeine prescriptions. Flagged by Pharmacist during safety checks.",
    severity: "medium",
    reported_at: "2026-05-18T16:42:00Z",
    status: "remediated",
    remediation_notes: "Upgraded genome brain to gemini-2.5-pro and enabled medical-abbreviation-decoder verification tool."
  },
  {
    id: "inc-002",
    agent_id: "agent-beta-002",
    agent_name: "Boreas-Beta (Patient Outreach Support)",
    title: "Patient Empathy Guardrail Triggered",
    description: "Customer support flagged a fast-paced interactive text sequence with high patient anxiety level. Tone constraint safety rules applied automatically to slow replies.",
    severity: "low",
    reported_at: "2026-06-04T22:10:00Z",
    status: "investigating",
    remediation_notes: "Adjusting calendar temperature settings in next genome patch update."
  }
];

export const DEMO_BILLING_STATUS: { [key: string]: typeof DEMO_AGENT_ALPHA } = {
  // Can expand if needed
};
