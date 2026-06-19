import React, { useState, useMemo } from "react";
import { 
  Key, 
  ShieldCheck, 
  ShieldAlert, 
  Zap, 
  RefreshCw, 
  History, 
  Trash2, 
  Cpu, 
  DollarSign, 
  FileText, 
  Clock, 
  HelpCircle,
  AlertTriangle,
  Lock,
  ArrowRight,
  Sparkles,
  Layers,
  Fingerprint
} from "lucide-react";
import { AgentRecord, LedgerEvent, IncidentRecord, UserRole } from "../types";

// RFC 8785 Canonical Serialization Helper (JCS)
function canonicalizeJCS(obj: any): string {
  if (obj === null) return "null";
  if (typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return "[" + obj.map(item => canonicalizeJCS(item)).join(",") + "]";
  }
  const sortedKeys = Object.keys(obj).sort();
  const members = sortedKeys
    .filter(k => k !== "signature") // strip signature
    .map(k => `${JSON.stringify(k)}:${canonicalizeJCS(obj[k])}`);
  return "{" + members.join(",") + "}";
}

// Simple deterministic hash generator to simulate SHA-256 for browser visualization
function generateSimulatedHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return "sha256-" + hex.repeat(8).substring(0, 64);
}

// Structuring Token interface based on Specification
export interface ExecutionIdentityToken {
  ei_id: string;
  subject: {
    type: "agent" | "user" | "service";
    id: string;
  };
  tenant_id: string;
  run_id: string;
  capabilities: Array<{
    capability_id: string;
    resource_scope: {
      type: "dataset" | "service" | "environment" | "system" | "any";
      id: string;
      filters?: Record<string, any>;
    };
    max_calls: number;
    max_cost: number;
    max_latency_ms?: number;
  }>;
  issued_at: string;
  expires_at: string;
  authority_bundle_hash: string;
  policy_hash: string;
  pgl_certificate_id: string;
  delegation: {
    max_depth: number;
    parent_ei_id: string | null;
  };
  budget: {
    tokens: number;
    currency: string;
    max_spend: number;
  };
  status: "ISSUED" | "ACTIVE" | "REVOKED" | "EXPIRED" | "INVALID";
  signature: string;
}

interface ExecutionIdentityV1ControlProps {
  agents: AgentRecord[];
  ledgerEvents: LedgerEvent[];
  onAddLedgerEvent: (newEvent: LedgerEvent) => Promise<void>;
  onAddIncident: (newIncident: IncidentRecord, incidentEvent: LedgerEvent) => Promise<void>;
  selectedRole: UserRole;
}

export default function ExecutionIdentityV1Control({
  agents,
  ledgerEvents,
  onAddLedgerEvent,
  onAddIncident,
  selectedRole
}: ExecutionIdentityV1ControlProps) {
  // Primary States
  const [selectedAgent, setSelectedAgent] = useState<AgentRecord | null>(agents[0] || null);
  const [uuidTenant, setUuidTenant] = useState("d0411b5e-049e-4e4b-8e2b-2a7e4bfa0d1a");
  const [uuidRun, setUuidRun] = useState(() => "cfbd5ef8-16ef-466d-8a03-7" + Math.floor(10000000000 + Math.random() * 90000000000).toString());
  const [ttlSeconds, setTtlSeconds] = useState(300);
  const [maxDepth, setMaxDepth] = useState(0);
  
  // Scopes Checkboxes
  const [selectedScopes, setSelectedScopes] = useState({
    workspace_write: true,
    http_request: false,
    database_read: true,
    payment_routing: false,
  });

  const [scopeMaxCalls, setScopeMaxCalls] = useState(50);
  const [scopeMaxCost, setScopeMaxCost] = useState(5.00); // in cents or dollars
  
  // Budget values
  const [tokenBudget, setTokenBudget] = useState(50000);
  const [maxSpendDollar, setMaxSpendDollar] = useState(10.00);

  // Active Signed Tokens (Prepopulated with Standard records aligned with demo database)
  const [tokens, setTokens] = useState<ExecutionIdentityToken[]>(() => {
    return [
      {
        ei_id: "9f140683-fcf1-4547-8bbf-7489bb12891f",
        subject: { type: "agent", id: "agent-alpha-001" },
        tenant_id: "d0411b5e-049e-4e4b-8e2b-2a7e4bfa0d1a",
        run_id: "cfbd5ef8-16ef-466d-8a03-7cf5d5d8515c",
        capabilities: [
          {
            capability_id: "workspace_write",
            resource_scope: { type: "dataset", id: "project-alpha-results" },
            max_calls: 50,
            max_cost: 5.0
          },
          {
            capability_id: "database_read",
            resource_scope: { type: "service", id: "customer-leads-db" },
            max_calls: 100,
            max_cost: 2.5
          }
        ],
        issued_at: new Date(Date.now() - 3600000).toISOString(),
        expires_at: new Date(Date.now() + 3600000 * 2).toISOString(),
        authority_bundle_hash: "sha256-dfa312ad91ec67eb94811f726715fbcde832efc29a8d9a2478e91f092301824f",
        policy_hash: "sha256-34a098ef918eeffcc329fbcbb019e0fabdeca7bdeefacbc881ef93217acdc99a",
        pgl_certificate_id: "cert-alpha-9988",
        delegation: { max_depth: 0, parent_ei_id: null },
        budget: { tokens: 40000, currency: "USD", max_spend: 10.0 },
        status: "ACTIVE",
        signature: "Ed25519_Sig_77a90bBcbACee010ffecdf2380a912bb09cde87271bcffee11bcdd82fa08cc"
      },
      {
        ei_id: "52a912f2-d8f9-411a-8bb7-f65519e48bc2",
        subject: { type: "agent", id: "agent-beta-002" },
        tenant_id: "d0411b5e-049e-4e4b-8e2b-2a7e4bfa0d1a",
        run_id: "ae881cf7-14ee-49de-ae03-911cbfa7723a",
        capabilities: [
          {
            capability_id: "http_request",
            resource_scope: { type: "environment", id: "*" },
            max_calls: 10,
            max_cost: 1.0
          }
        ],
        issued_at: new Date(Date.now() - 7200000).toISOString(),
        expires_at: new Date(Date.now() + 1800000).toISOString(),
        authority_bundle_hash: "sha256-bd9108a9facda02881bb42118aacdebaabffccd8a8e100f9831acd23b1029cde",
        policy_hash: "sha256-11f8e9a9dc887eb1129bcba900faebcdfeffcd32aa11e8fcc9201a938cddccaa",
        pgl_certificate_id: "cert-beta-1204",
        delegation: { max_depth: 1, parent_ei_id: null },
        budget: { tokens: 20000, currency: "USD", max_spend: 5.0 },
        status: "ISSUED",
        signature: "Ed25519_Sig_aa019ffeccfa3300ffeedd23aa12bbcf0099abde98938cd4857211bfcc0a"
      }
    ];
  });

  // Sandbox Playground triggers
  const [selectedSandboxToken, setSelectedSandboxToken] = useState<string>(
    "9f140683-fcf1-4547-8bbf-7489bb12891f"
  );
  const [sandboxScenario, setSandboxScenario] = useState<string>("COMPLIANT");
  const [isVerifyingSandbox, setIsVerifyingSandbox] = useState(false);
  const [verificationProgress, setVerificationProgress] = useState<string[]>([]);
  const [sandboxResponse, setSandboxResponse] = useState<any | null>(null);

  // Visualization of the current compile configuration
  const currentTokenDraft = useMemo(() => {
    const selectedAgentObj = selectedAgent || agents[0];
    const agentIdHex = selectedAgentObj ? selectedAgentObj.id : "agent-unknown";
    const certIdHex = selectedAgentObj ? selectedAgentObj.certificate.id : "cert-unknown";
    
    const capabilitiesList = [];
    if (selectedScopes.workspace_write) {
      capabilitiesList.push({
        capability_id: "workspace_write",
        resource_scope: { type: "dataset" as const, id: `project-${agentIdHex.replace("agent-", "")}-results` },
        max_calls: scopeMaxCalls,
        max_cost: parseFloat((scopeMaxCost * 0.6).toFixed(2)),
        max_latency_ms: 500
      });
    }
    if (selectedScopes.http_request) {
      capabilitiesList.push({
        capability_id: "http_request",
        resource_scope: { type: "environment" as const, id: "*" },
        max_calls: scopeMaxCalls,
        max_cost: parseFloat((scopeMaxCost * 0.4).toFixed(2)),
        max_latency_ms: 1000
      });
    }
    if (selectedScopes.database_read) {
      capabilitiesList.push({
        capability_id: "database_read",
        resource_scope: { type: "service" as const, id: `restricted-agents-db` },
        max_calls: scopeMaxCalls * 2,
        max_cost: parseFloat((scopeMaxCost * 0.2).toFixed(2))
      });
    }
    if (selectedScopes.payment_routing) {
      capabilitiesList.push({
        capability_id: "payment_routing",
        resource_scope: { type: "system" as const, id: "stripe-live-gateway" },
        max_calls: 5,
        max_cost: scopeMaxCost
      });
    }

    const issuedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    const draftWithoutSig = {
      ei_id: "ei-" + Math.random().toString(36).substring(2, 10) + "-48be-9fa3-12a88390bcab",
      subject: {
        type: "agent" as const,
        id: agentIdHex
      },
      tenant_id: uuidTenant,
      run_id: uuidRun,
      capabilities: capabilitiesList,
      issued_at: issuedAt,
      expires_at: expiresAt,
      authority_bundle_hash: "sha256-" + generateSimulatedHash(agentIdHex + "-authority").substring(7),
      policy_hash: "sha256-40a012de9a88ffce93288febcdffca67fa92dfce22b11ef932aa11e8ffcda31a",
      pgl_certificate_id: certIdHex,
      delegation: {
        max_depth: maxDepth,
        parent_ei_id: null
      },
      budget: {
        tokens: tokenBudget,
        currency: "USD",
        max_spend: maxSpendDollar
      }
    };

    const jcsCanonical = canonicalizeJCS(draftWithoutSig);
    const signature = "Ed25519_Sig_" + generateSimulatedHash(jcsCanonical).substring(7, 71);

    return {
      token: {
        ...draftWithoutSig,
        status: "ISSUED" as const,
        signature
      },
      jcsCanonical
    };
  }, [
    selectedAgent,
    uuidTenant,
    uuidRun,
    ttlSeconds,
    maxDepth,
    selectedScopes,
    scopeMaxCalls,
    scopeMaxCost,
    tokenBudget,
    maxSpendDollar,
    agents
  ]);

  // Action: Mint standard EI Token
  const handleMintToken = async () => {
    const freshToken = currentTokenDraft.token;
    
    // 1. Update list
    setTokens(prev => [freshToken, ...prev]);
    setSelectedSandboxToken(freshToken.ei_id);

    // 2. Commit transaction to Provenance Governance Ledger (PGL) in Firebase / state
    const blockEvent: LedgerEvent = {
      id: "evt-ei-mint-" + Date.now().toString(36),
      agent_id: freshToken.subject.id,
      timestamp: new Date().toISOString(),
      event_type: "deployment",
      title: `MCPAPI v2.0 ExecutionIdentity Minted`,
      description: `LAW 0 ENFORCEMENT: ExecutionIdentityV1 minted for actor [${freshToken.subject.id}]. Bound to Run [${freshToken.run_id}] with ${freshToken.capabilities.length} scoped capabilities and Max Spend of $${freshToken.budget.max_spend.toFixed(2)}. Pre-cert hash chain committed: OK.`,
      operator: `${selectedRole}@veklom.com`,
      prev_event_hash: ledgerEvents.length > 0 ? ledgerEvents[ledgerEvents.length - 1].event_hash : "00000000000000000000000000000000",
      event_hash: ""
    };
    blockEvent.event_hash = generateSimulatedHash(JSON.stringify(blockEvent));
    
    await onAddLedgerEvent(blockEvent);

    // 3. Regnerate standard Run ID for next mint
    setUuidRun("cfbd5ef8-16ef-466d-8a03-7" + Math.floor(10000000000 + Math.random() * 90000000000).toString());
    alert(`Success! ExecutionIdentityV1 [${freshToken.ei_id.substring(0, 13)}...] minted and registered onto the secure Blockchain Ledger.`);
  };

  // Action: Modify individual Token states (Active, Revoked, Expired, Invalid)
  const handleUpdateTokenStatus = async (tokenId: string, nextStatus: "ACTIVE" | "REVOKED" | "EXPIRED" | "INVALID") => {
    let targetToken: ExecutionIdentityToken | null = null;
    const updatedTokens = tokens.map(t => {
      if (t.ei_id === tokenId) {
        targetToken = t;
        return { ...t, status: nextStatus };
      }
      return t;
    });
    setTokens(updatedTokens);

    if (targetToken) {
      const activeTok = targetToken as ExecutionIdentityToken;
      // Emit corresponding PGL block
      const transitionEvent: LedgerEvent = {
        id: "evt-ei-state-" + Date.now().toString(36),
        agent_id: activeTok.subject.id,
        timestamp: new Date().toISOString(),
        event_type: "audit",
        title: `EI Token Cryptographic Transition: ${nextStatus}`,
        description: `AUDIT TRACE: ExecutionIdentityV1 [${activeTok.ei_id}] state change recorded. Transitioned to state [${nextStatus}]. Authenticity signatures re-evaluated globally. Central revocation map synchronized.`,
        operator: `${selectedRole}@veklom.com`,
        prev_event_hash: ledgerEvents.length > 0 ? ledgerEvents[ledgerEvents.length - 1].event_hash : "00000000000000000000000000000000",
        event_hash: ""
      };
      transitionEvent.event_hash = generateSimulatedHash(JSON.stringify(transitionEvent));
      await onAddLedgerEvent(transitionEvent);
    }
  };

  // Action: Interactive Fail-Closed Gateway Simulator execution
  const executeSandboxValidation = async () => {
    setIsVerifyingSandbox(true);
    setSandboxResponse(null);
    setVerificationProgress([]);

    const steps = [
      "📡 Intercepting outgoing capabilities request on edge-gateway (Port 3000)...",
      "🔌 Validating Central Cappo Control-Plane node connectivity (mTLS TLS 1.3)...",
      "🔍 Checking local edge Cache tables for token reference ID...",
      "⚙️ Decoding ExecutionIdentityV1 envelope and verifying JCS alphabetical sorting...",
      "🔑 Running cryptographic Ed25519 asymmetric signature evaluation...",
      "⏳ Inspecting TTL expiration bounds (expires_at) against secure NTP networks...",
      "🔗 Correlating pgl_certificate_id against active Provenance blockchain ledger record...",
      "🧠 Inspecting capability scopes filters and resource-scope authorization...",
      "💰 Querying token token limits, latency ceilings, and Max Spend budget allocation...",
      "⚖️ Verdict and final fail-closed response generation..."
    ];

    const targetToken = tokens.find(t => t.ei_id === selectedSandboxToken);

    for (let i = 0; i < steps.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 200));
      setVerificationProgress(prev => [...prev, steps[i]]);
    }

    if (!targetToken) {
      setSandboxResponse({
        error: "EXECUTION_IDENTITY_REQUIRED",
        code: "LAW0_EI_INVALID",
        detail: "The provided execution identity was empty or not recognized in the system database.",
        law0: true,
        incident_logged: true
      });
      setIsVerifyingSandbox(false);
      return;
    }

    // Evaluate Scenario outcomes strictly per Fail-Closed Rules
    if (sandboxScenario === "CAPP_OFFLINE") {
      setSandboxProgressOutput("🚨 NETWORK TIMEOUT: Cappo control-plane has dropped peer connection.");
      setSandboxResponse({
        error: "CONTROL_PLANE_OFFLINE",
        code: "LAW0_UNAVAILABLE",
        detail: "Central authority node offline. Edge Gateway circuit breaker tripped to [OPEN]. Execution denied.",
        law0: true,
        incident_logged: true
      });

      // Log real incident
      const newIncId = "inc-v-off-" + Date.now().toString(36);
      const inc: IncidentRecord = {
        id: newIncId,
        agent_id: targetToken.subject.id,
        agent_name: agents.find(a => a.id === targetToken.subject.id)?.name || "System Orchestrator",
        title: "LAW0 Circuit Breaker Open: Cappo System Offline",
        description: `Edge gateway failed to verify ExecutionIdentityV1 [${targetToken.ei_id}] because central Cappo servers timed out. Circuit breaker tripped to deny all downstream agent tool executions under fail-closed regulations.`,
        severity: "high",
        reported_at: new Date().toISOString(),
        status: "open"
      };
      
      const evt: LedgerEvent = {
        id: "evt-inc-capp-" + Date.now().toString(36),
        agent_id: targetToken.subject.id,
        timestamp: new Date().toISOString(),
        event_type: "incident",
        title: "LAW0 Gatekeeper Alarm: Central Node Offline",
        description: `CRITICAL OUTAGE: Outbound connection to control plane timed out. Denied execution request for run ID: [${targetToken.run_id}].`,
        operator: `${selectedRole}@veklom.com`,
        prev_event_hash: ledgerEvents.length > 0 ? ledgerEvents[ledgerEvents.length - 1].event_hash : "00000000000000000000000000000000",
        event_hash: ""
      };
      evt.event_hash = generateSimulatedHash(JSON.stringify(evt));

      await onAddIncident(inc, evt);

    } else if (sandboxScenario === "SIG_TAMPERED") {
      setSandboxProgressOutput("🚨 SIGNATURE CORRUPTED: Ed25519 proof mismatch computed!");
      setSandboxResponse({
        error: "INTEGRITY_VERIFICATION_FAILED",
        code: "LAW0_EI_INVALID",
        detail: `The cryptographic signature '${targetToken.signature.substring(0, 15)}...' fails key validation under current JWKS parameters. Token is structurally untrusted.`,
        law0: true,
        incident_logged: true
      });

      // Log real incident
      const newIncId = "inc-v-sig-" + Date.now().toString(36);
      const inc: IncidentRecord = {
        id: newIncId,
        agent_id: targetToken.subject.id,
        agent_name: agents.find(a => a.id === targetToken.subject.id)?.name || "Intruder Bot",
        title: "LAW0 Cryptographic Tampering Blocked",
        description: `Intrusion Alert: A tool request envelope provided an ExecutionIdentityV1 [${targetToken.ei_id}] with a tampered or invalid cryptographic certificate signature. Request blocked at edge port 3000.`,
        severity: "high",
        reported_at: new Date().toISOString(),
        status: "open"
      };
      
      const evt: LedgerEvent = {
        id: "evt-inc-sig-" + Date.now().toString(36),
        agent_id: targetToken.subject.id,
        timestamp: new Date().toISOString(),
        event_type: "incident",
        title: "SECURITY VIOLATION: Invalid Token Signature",
        description: `CRITICAL ALARM: Blocked execution request with invalid signature. Intrusion parameters flagged. Local verification circuits triggered lockouts.`,
        operator: `${selectedRole}@veklom.com`,
        prev_event_hash: ledgerEvents.length > 0 ? ledgerEvents[ledgerEvents.length - 1].event_hash : "00000000000000000000000000000000",
        event_hash: ""
      };
      evt.event_hash = generateSimulatedHash(JSON.stringify(evt));

      await onAddIncident(inc, evt);

    } else if (sandboxScenario === "TOKEN_EXPIRED" || targetToken.status === "EXPIRED") {
      setSandboxProgressOutput("🚨 EXPIRATION DETECTED: System clock has advanced past expires_at!");
      setSandboxResponse({
        error: "EXECUTION_IDENTITY_EXPIRED",
        code: "LAW0_EI_EXPIRED",
        detail: `The provided execution identity '${targetToken.ei_id}' expired at ${new Date(targetToken.expires_at).toISOString()}.`,
        law0: true,
        incident_logged: false
      });

    } else if (sandboxScenario === "TOKEN_REVOKED" || targetToken.status === "REVOKED") {
      setSandboxProgressOutput("🚨 REVOKED ID: Central map flags this token ID as manually cancelled!");
      setSandboxResponse({
        error: "EXECUTION_IDENTITY_REVOKED",
        code: "LAW0_EI_REVOKED",
        detail: `The provided execution identity '${targetToken.ei_id}' was manually revoked by administration. Run context terminated.`,
        law0: true,
        incident_logged: true
      });

      // Log minor incident
      const newIncId = "inc-v-rev-" + Date.now().toString(36);
      const inc: IncidentRecord = {
        id: newIncId,
        agent_id: targetToken.subject.id,
        agent_name: agents.find(a => a.id === targetToken.subject.id)?.name || "System Bot",
        title: "Revoked Identity Execution Attempted",
        description: `Notice: Agent attempted execution using a previously revoked ExecutionIdentity token [${targetToken.ei_id}]. Blocked gracefully by fail-closed rules.`,
        severity: "low",
        reported_at: new Date().toISOString(),
        status: "open"
      };
      
      const evt: LedgerEvent = {
        id: "evt-inc-rev-" + Date.now().toString(36),
        agent_id: targetToken.subject.id,
        timestamp: new Date().toISOString(),
        event_type: "incident",
        title: "SECURITY EXCEPTION: Revoked Token Use Blocked",
        description: `Audit Flag: Denied tool requests referencing manually revoked Token ID [${targetToken.ei_id}].`,
        operator: `${selectedRole}@veklom.com`,
        prev_event_hash: ledgerEvents.length > 0 ? ledgerEvents[ledgerEvents.length - 1].event_hash : "00000000000000000000000000000000",
        event_hash: ""
      };
      evt.event_hash = generateSimulatedHash(JSON.stringify(evt));

      await onAddIncident(inc, evt);

    } else if (sandboxScenario === "LEDGER_DESYNC") {
      setSandboxProgressOutput("🚨 PROVENANCE DESYNC: matching pgl_certificate_id could not be resolved!");
      setSandboxResponse({
        error: "LEDGER_INTEGRITY_DESYNC",
        code: "LAW0_PGL_MISSING",
        detail: "Edge Gateway failed query verification for the matching agent certificate. Hash chain mismatch or missing block.",
        law0: true,
        incident_logged: true
      });

    } else if (sandboxScenario === "BUDGET_EXHAUSTED") {
      setSandboxProgressOutput("🚨 BUDGET OVERDRAFT: Request cost exceeds allocated tokens / spending caps!");
      setSandboxResponse({
        error: "MAX_BUDGET_LIMIT_EXCEEDED",
        code: "LAW0_BUDGET_EXCEEDED",
        detail: `The request requires 15,000 model tokens, which exhausts the remaining budget of ${targetToken.budget.tokens} model tokens allotted to run ${targetToken.run_id}.`,
        law0: true,
        incident_logged: false
      });

    } else {
      // COMPLIANT / SUCCESS
      if (targetToken.status !== "ACTIVE" && targetToken.status !== "ISSUED") {
        setSandboxProgressOutput(`🚨 FAILURE: Current token status is ${targetToken.status}. Must be ISSUED or ACTIVE to authorize requests.`);
        setSandboxResponse({
          error: "EXECUTION_IDENTITY_INVALID_STATE",
          code: "LAW0_EI_INVALID",
          detail: `Cannot execute requests with token state: ${targetToken.status}.`,
          law0: true,
          incident_logged: false
        });
      } else {
        // Success payload
        setSandboxProgressOutput("✅ EXECUTED: All safety standards compliant. Tool request authorized.");
        
        // Deduct budget visually as simulation feedback!
        const decrementedTokens = tokens.map(t => {
          if (t.ei_id === selectedSandboxToken) {
            return {
              ...t,
              status: "ACTIVE" as const, // transition to active automatically
              budget: {
                ...t.budget,
                tokens: Math.max(0, t.budget.tokens - 1200),
                max_spend: Math.max(0, t.budget.max_spend - 0.24)
              }
            };
          }
          return t;
        });
        setTokens(decrementedTokens);

        setSandboxResponse({
          mcp_version: "2.0",
          status: "SUCCESS_OK",
          request_id: "8a3b8d6f-2394-4d89-9a06-cc5519e4a8b1",
          execution_identity_audited: targetToken.ei_id,
          run_id: targetToken.run_id,
          tool_executed: {
            id: "workspace_write",
            result_size_bytes: 4200,
            execution_time_ms: 114
          },
          billing_consumption: {
            tokens_used: 1200,
            cost_cents: 24,
            authorized_remaining: {
              max_spend_usd: (targetToken.budget.max_spend - 0.24).toFixed(2),
              tokens_remaining: targetToken.budget.tokens - 1200
            }
          }
        });
      }
    }

    setIsVerifyingSandbox(false);
  };

  const setSandboxProgressOutput = (log: string) => {
    setVerificationProgress(prev => [...prev, log]);
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-teal-950/40 to-slate-900 border border-white/10 rounded-xl p-5 shadow-lg relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 blur-3xl w-56 h-56 bg-emerald-500/10 rounded-full" />
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative z-10">
          <div>
            <h2 className="text-base font-sans font-semibold text-white flex items-center gap-2">
              <Key className="text-teal-400 size-5" />
              ExecutionIdentityV1 Token Engine
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 max-w-xl">
              Strict cryptographic authorization and zero-trust budgets supporting the **MCPAPI v2.0** protocol. 
              Enforces **LAW 0: No Ungoverned Code Executions.**
            </p>
          </div>
          <div className="flex items-center gap-2 bg-[#050505] border border-white/10 px-3 py-1.5 rounded-lg text-xs font-mono shrink-0">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-teal-400 animate-pulse" />
            <span className="text-slate-350">PEER GATEWAYS COMPILED</span>
          </div>
        </div>
      </div>

      {/* Main Grid View */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        
        {/* Left Side: Handshake Generator / Minting Box (5 columns) */}
        <div className="xl:col-span-5 flex flex-col gap-5">
          <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-5 shadow-md flex flex-col gap-4">
            
            <div className="flex justify-between items-center border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-emerald-400" />
                <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                  Mint MCPAPI Token
                </span>
              </div>
              <span className="text-[10px] font-mono text-slate-500">SECTION 11 HANDSHAKE</span>
            </div>

            {/* Select Target Agent */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                Select Governed Agent (Subject)
              </label>
              <select
                value={selectedAgent ? selectedAgent.id : ""}
                onChange={(e) => {
                  const item = agents.find(a => a.id === e.target.value);
                  if (item) setSelectedAgent(item);
                }}
                className="w-full bg-[#050505] border border-white/10 text-xs rounded px-3 py-2 outline-none text-white font-mono focus:border-teal-500/50"
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.certificate.serial_number})
                  </option>
                ))}
              </select>
              {selectedAgent && (
                <p className="text-[10px] font-mono text-[#8A8A8A]">
                  PGL Certificate ID: <span className="text-slate-300">{selectedAgent.certificate.id}</span>
                </p>
              )}
            </div>

            {/* Tenant and Run configuration */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                  Tenant Workspace ID
                </label>
                <input
                  type="text"
                  value={uuidTenant}
                  onChange={(e) => setUuidTenant(e.target.value)}
                  className="w-full bg-[#050505] border border-white/10 text-[10.5px] rounded px-2.5 py-1.5 outline-none font-mono text-white focus:border-teal-500/50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                  Active Run UUID
                </label>
                <input
                  type="text"
                  value={uuidRun}
                  onChange={(e) => setUuidRun(e.target.value)}
                  className="w-full bg-[#050505] border border-white/10 text-[10.5px] rounded px-2.5 py-1.5 outline-none font-mono text-white focus:border-teal-500/50"
                />
              </div>
            </div>

            {/* Capabilities Scope Boundaries checklist */}
            <div className="space-y-2">
              <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                Authorized Capabilities Scopes
              </label>
              
              <div className="grid grid-cols-2 gap-2.5 bg-[#050505] p-3 border border-white/5 rounded-lg">
                {[
                  { id: "workspace_write", label: "workspace_write" },
                  { id: "http_request", label: "http_request" },
                  { id: "database_read", label: "database_read" },
                  { id: "payment_routing", label: "payment_routing" },
                ].map((sc) => (
                  <label key={sc.id} className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-slate-350 hover:text-white">
                    <input
                      type="checkbox"
                      checked={(selectedScopes as any)[sc.id]}
                      onChange={(e) => {
                        setSelectedScopes({
                          ...selectedScopes,
                          [sc.id]: e.target.checked
                        });
                      }}
                      className="rounded border-white/10 bg-slate-950 text-emerald-500 focus:ring-0 focus:ring-offset-0 cursor-pointer size-3.5"
                    />
                    <span className="font-mono">{sc.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Constraints Sliders */}
            <div className="grid grid-cols-2 gap-4 bg-[#050505] p-3 border border-white/5 rounded-lg text-xs font-mono">
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] text-slate-450">
                  <span>MAX CALLS Limit:</span>
                  <span className="text-teal-400 font-bold">{scopeMaxCalls}</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="200"
                  step="5"
                  value={scopeMaxCalls}
                  onChange={(e) => setScopeMaxCalls(parseInt(e.target.value))}
                  className="w-full accent-teal-400"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] text-slate-450">
                  <span>MAX COST (Cap):</span>
                  <span className="text-teal-400 font-bold">${scopeMaxCost.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="50"
                  step="1"
                  value={scopeMaxCost}
                  onChange={(e) => setScopeMaxCost(parseFloat(e.target.value))}
                  className="w-full accent-teal-400"
                />
              </div>
            </div>

            {/* Token limits & spend budgets */}
            <div className="grid grid-cols-3 gap-2 text-xs font-mono">
              <div className="space-y-1.5">
                <label className="block text-[9.5px] text-slate-400 uppercase tracking-wider">
                  Model Tokens
                </label>
                <input
                  type="number"
                  value={tokenBudget}
                  onChange={(e) => setTokenBudget(parseInt(e.target.value) || 0)}
                  className="w-full bg-[#050505] border border-white/10 rounded px-2 py-1 outline-none text-white"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[9.5px] text-slate-400 uppercase tracking-wider">
                  USD Max Spend
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={maxSpendDollar}
                  onChange={(e) => setMaxSpendDollar(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#050505] border border-white/10 rounded px-2 py-1 outline-none text-white"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[9.5px] text-slate-400 uppercase tracking-wider">
                  TTL (Seconds)
                </label>
                <input
                  type="number"
                  value={ttlSeconds}
                  onChange={(e) => setTtlSeconds(parseInt(e.target.value) || 0)}
                  className="w-full bg-[#050505] border border-white/10 rounded px-2 py-1 outline-none text-white"
                />
              </div>
            </div>

            {/* JCS Alphabetical Serialization Preview */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-[10px] text-slate-450">
                <span className="font-mono uppercase tracking-wider">RFC 8785 Canonical JCS (Sorted Keys)</span>
                <span className="bg-emerald-500/10 text-emerald-400 font-bold px-1.5 py-0.5 rounded text-[8.5px]">AUTO SORT</span>
              </div>
              <div className="bg-[#050505] border border-white/10 rounded-lg p-2.5 max-h-[110px] overflow-y-auto text-[10px] font-mono text-teal-400 select-all leading-relaxed whitespace-pre-wrap">
                {currentTokenDraft.jcsCanonical}
              </div>
            </div>

            {/* Compile/Sign button */}
            <button
              onClick={handleMintToken}
              className="w-full bg-teal-500 hover:bg-teal-400 text-black font-sans font-bold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 shadow-md transition-all text-xs"
            >
              <Fingerprint className="size-4" />
              JCS-Serialize & Mint Standard Token
            </button>

          </div>
        </div>

        {/* Right Side Pane (7 columns Grid Layout) */}
        <div className="xl:col-span-7 flex flex-col gap-6">
          
          {/* Top Panel: Live Signed Tokens Registry */}
          <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-5 shadow-md flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="size-4 text-teal-400" />
                <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                  Active ExecutionIdentityV1 Registry
                </span>
              </div>
              <span className="text-[10px] font-mono text-slate-500">MINTED CRYPTOGRAPHIC CREDENTIALS</span>
            </div>

            {/* List of minted standard tokens */}
            <div className="space-y-3.5 max-h-[200px] overflow-y-auto pr-1">
              {tokens.length === 0 ? (
                <div className="h-28 flex items-center justify-center border border-dashed border-white/10 rounded-lg text-slate-500 font-mono text-xs">
                  No execution tokens registered in database.
                </div>
              ) : (
                tokens.map((tok) => {
                  const isSandboxCur = selectedSandboxToken === tok.ei_id;
                  let badgeCol = "bg-teal-500/10 text-teal-450 border-teal-500/20";
                  if (tok.status === "ACTIVE") badgeCol = "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
                  if (tok.status === "REVOKED") badgeCol = "bg-red-500/15 text-red-400 border-red-500/30";
                  if (tok.status === "EXPIRED") badgeCol = "bg-slate-800 text-slate-400 border-white/10";
                  if (tok.status === "INVALID") badgeCol = "bg-purple-500/15 text-purple-400 border-purple-500/30";

                  return (
                    <div 
                      key={tok.ei_id} 
                      onClick={() => setSelectedSandboxToken(tok.ei_id)}
                      className={`p-3 rounded-lg border text-xs font-mono transition-all cursor-pointer relative ${
                        isSandboxCur 
                          ? "bg-slate-950/90 border-teal-500/40 shadow-md ring-1 ring-teal-500/10" 
                          : "bg-[#050505] border-white/5 hover:border-white/10 hover:bg-[#070707]"
                      }`}
                    >
                      {isSandboxCur && (
                        <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-teal-500/10 text-teal-400 text-[8.5px] font-bold px-1.5 py-0.5 rounded">
                          <span className="w-1 h-1 rounded-full bg-teal-400 animate-ping" />
                          SELECTED FOR SANDBOX
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-white font-medium text-[11px] truncate max-w-[190px]">
                          Token: {tok.ei_id.substring(0, 18)}...
                        </span>
                        <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full border ${badgeCol}`}>
                          {tok.status}
                        </span>
                        <span className="text-[10px] text-slate-500 bg-white/5 px-2 py-0.5 rounded">
                          {tok.subject.id}
                        </span>
                      </div>

                      {/* Info grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mt-3 pt-2.5 border-t border-white/5 text-[10.5px] text-slate-400">
                        <div>
                          <div className="text-[9.5px] text-slate-500 font-semibold mb-0.5">BUDGETS METERS</div>
                          <div className="text-slate-300 font-medium">
                            {tok.budget.tokens.toLocaleString()} tok / <span className="text-emerald-400">${tok.budget.max_spend.toFixed(2)}</span>
                          </div>
                        </div>
                        <div>
                          <div className="text-[9.5px] text-slate-500 font-semibold mb-0.5">CAPABILITIES</div>
                          <div className="text-slate-300 truncate font-mono">
                            {tok.capabilities.map(c => c.capability_id).join(", ") || "None"}
                          </div>
                        </div>
                        <div>
                          <div className="text-[9.5px] text-slate-500 font-semibold mb-0.5">EXPIRES AT</div>
                          <div className="text-slate-300 flex items-center gap-1">
                            <Clock className="size-3 text-slate-500" />
                            {new Date(tok.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        <div>
                          <div className="text-[9.5px] text-slate-500 font-semibold mb-0.5">SIGNATURE PROOF</div>
                          <div className="text-slate-450 truncate font-mono" title={tok.signature}>
                            {tok.signature.substring(0, 12)}...
                          </div>
                        </div>
                      </div>

                      {/* Transition Action Buttons */}
                      <div className="flex gap-1.5 mt-3.5 justify-end" onClick={(e) => e.stopPropagation()}>
                        {tok.status === "ISSUED" && (
                          <button
                            onClick={() => handleUpdateTokenStatus(tok.ei_id, "ACTIVE")}
                            className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-black hover:font-bold text-[9.5px] font-sans px-2.5 py-1 rounded transition"
                          >
                            Activate Token
                          </button>
                        )}
                        {tok.status !== "REVOKED" && (
                          <button
                            onClick={() => handleUpdateTokenStatus(tok.ei_id, "REVOKED")}
                            className="bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-black hover:font-bold text-[9.5px] font-sans px-2.5 py-1 rounded transition"
                          >
                            Revoke (Fail-Closed)
                          </button>
                        )}
                        {tok.status !== "EXPIRED" && tok.status !== "REVOKED" && (
                          <button
                            onClick={() => handleUpdateTokenStatus(tok.ei_id, "EXPIRED")}
                            className="bg-slate-800 text-slate-300 hover:bg-white hover:text-black hover:font-bold text-[9.5px] font-sans px-2.5 py-1 rounded transition"
                          >
                            Simulate Expiry
                          </button>
                        )}
                      </div>

                    </div>
                  );
                })
              )}
            </div>

          </div>

          {/* Bottom Panel: Fail-Closed Enforcment Simulator Playground */}
          <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-5 shadow-md flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="size-4 text-red-400" />
                <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                  Fail-Closed Edge Router Interceptor
                </span>
              </div>
              <span className="text-[10px] font-mono text-slate-500">MCPAPI REQUEST SANDBOX</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Option Selector pane */}
              <div className="space-y-4">
                
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                    Select Test Scenario
                  </label>
                  <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                    {[
                      { id: "COMPLIANT", title: "Compliant Request (200 OK)", desc: "All cryptographic token constraints and hashes align. Spend is recorded.", color: "text-emerald-400" },
                      { id: "SIG_TAMPERED", title: "Tampered Ed25519 signature", desc: "Blocked with LAW0_EI_INVALID. Raises system alarm and logs incident.", color: "text-red-450" },
                      { id: "TOKEN_EXPIRED", title: "Token TTL Expired", desc: "Blocked with LAW0_EI_EXPIRED. Denies execution request strictly.", color: "text-amber-500" },
                      { id: "TOKEN_REVOKED", title: "Token ID Revoked", desc: "Blocked with LAW0_EI_REVOKED. Enforces revocation maps in real-time.", color: "text-red-400" },
                      { id: "LEDGER_DESYNC", title: "PGL Pre-Cert Desync Outage", desc: "Blocked with LAW0_PGL_MISSING. Fails link correlation checking.", color: "text-purple-400" },
                      { id: "BUDGET_EXHAUSTED", title: "Model Budget Depleted", desc: "Blocked with LAW0_BUDGET_EXCEEDED. Exceeds spent limit caps.", color: "text-pink-400" },
                      { id: "CAPP_OFFLINE", title: "Cappo central plane Offline", desc: "Trips Edge Circuit Breaker to OPEN. Enforces local fail-closed offline rejection.", color: "text-blue-400" }
                    ].map((scen) => (
                      <div
                        key={scen.id}
                        onClick={() => setSandboxScenario(scen.id)}
                        className={`p-2.5 rounded-lg border text-left cursor-pointer transition ${
                          sandboxScenario === scen.id
                            ? "bg-slate-950 border-white/20 ring-1 ring-teal-500/20"
                            : "bg-[#050505] border-white/5 hover:border-white/10"
                        }`}
                      >
                        <div className={`text-[11px] font-mono font-bold ${scen.color} flex items-center justify-between`}>
                          <span>{scen.title}</span>
                          {sandboxScenario === scen.id && <span className="text-[10px]">● SELECTED</span>}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1 leading-snug">{scen.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Send Button */}
                <button
                  onClick={executeSandboxValidation}
                  disabled={isVerifyingSandbox}
                  className="w-full bg-[#050505] hover:bg-slate-900 border border-white/10 font-sans font-bold text-teal-400 text-xs py-2.5 rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50"
                >
                  <RefreshCw className={`size-4 ${isVerifyingSandbox ? 'animate-spin' : ''}`} />
                  <span>Intercept & Run Verification Sandbox</span>
                </button>

              </div>

              {/* Streaming Gateway Intercept Consoles / JSON results */}
              <div className="flex flex-col gap-4 font-mono text-[10px]">
                
                {/* Visual Intercept Timeline steps */}
                <div className="space-y-1">
                  <span className="block text-[10px] text-slate-400 uppercase tracking-wider">Gateway Logs</span>
                  <div className="bg-[#050505] border border-white/10 rounded-lg p-3 h-[120px] overflow-y-auto space-y-1 font-mono text-[9px] text-slate-300 leading-normal">
                    {verificationProgress.length === 0 ? (
                      <span className="text-slate-500 italic block">Ready. Trigger the interception sandbox above to watch edge validations execute synchronously in real-time.</span>
                    ) : (
                      verificationProgress.map((p, idx) => {
                        let isSec = p.startsWith("🚨") || p.startsWith("❌");
                        let isSuc = p.startsWith("✅");
                        let textCol = isSec ? "text-red-400" : isSuc ? "text-emerald-450" : "text-teal-400/80";
                        if (idx === verificationProgress.length - 1) textCol += " font-bold";

                        return (
                          <div key={idx} className={`${textCol} flex items-start gap-1`}>
                            <span>•</span>
                            <span>{p}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Structured JSON Response Output */}
                <div className="space-y-1 flex-1 flex flex-col">
                  <span className="block text-[10px] text-slate-400 uppercase tracking-wider">MCPAPI Gateway Response Standard</span>
                  <div className="bg-[#050505] border border-white/10 rounded-lg p-3 flex-1 overflow-y-auto relative text-teal-350 select-all min-h-[140px] max-h-[180px]">
                    {sandboxResponse ? (
                      <pre className="whitespace-pre-wrap">{JSON.stringify(sandboxResponse, null, 2)}</pre>
                    ) : (
                      <span className="text-slate-500 italic block">No response generated. Launch sandbox check to fetch JSON envelope packets.</span>
                    )}
                  </div>
                </div>

              </div>

            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
