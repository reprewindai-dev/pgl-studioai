export type UserRole = "owner" | "admin" | "operator" | "viewer";

export interface GenomePayload {
  model_family: string;
  model_version: string;
  architecture: string;
  tools: string[];
  permissions: string[];
  safety_rules: string[];
  runtime_config: {
    temperature: number;
    max_steps: number;
    [key: string]: any;
  };
  intended_use: string;
  risk_category: "low" | "medium" | "high" | "critical";
}

export interface CertificateMetadata {
  id: string;
  serial_number: string;
  issuance_date: string;
  genome_hash: string;
  signature: string; // Simulated PKI notary proof
}

export interface AgentRecord {
  id: string;
  name: string;
  creator: string;
  jurisdiction: string;
  created_at: string;
  is_revoked: boolean;
  revocation_reason?: string;
  parent_agent_ids: string[];
  genome: GenomePayload;
  certificate: CertificateMetadata;
  active_version: number;
  genome_versions: {
    version: number;
    timestamp: string;
    genome: GenomePayload;
    hash: string;
  }[];
}

export interface LedgerEvent {
  id: string;
  agent_id: string;
  timestamp: string;
  event_type: "birth" | "deployment" | "audit" | "incident" | "custom" | "genome_update";
  title: string;
  description: string;
  operator: string;
  prev_event_hash: string;
  event_hash: string;
  severity?: "low" | "medium" | "high";
  metadata?: {
    [key: string]: any;
  };
}

export interface BillingUsage {
  tier: "launch" | "scale" | "enterprise";
  active_agents: number;
  agent_limit: number;
  ledger_storage_mb: number;
  storage_limit_mb: number;
  lineage_renders: number;
  renders_limit: number;
  price_monthly: number;
  overage_agent_fee: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface IncidentRecord {
  id: string;
  agent_id: string;
  agent_name: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
  reported_at: string;
  status: "open" | "remediated" | "investigating";
  remediation_notes?: string;
}

export interface AuditReminder {
  id: string;
  agentId: string;
  agentName: string;
  days: number;
  scheduledAt: string;
  targetTime: string; // ISO string
  triggered: boolean;
}

