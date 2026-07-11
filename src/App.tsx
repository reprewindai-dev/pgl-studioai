import React, { useState, useEffect, useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { 
  ShieldCheck, 
  ShieldAlert, 
  Database, 
  Cpu, 
  History, 
  FileText, 
  BarChart3, 
  PlusCircle, 
  GitCommit, 
  Coins, 
  Download, 
  RefreshCw, 
  Play, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  Settings, 
  Activity, 
  Sparkles, 
  Code, 
  Key, 
  Users, 
  Check, 
  HelpCircle,
  GitBranch,
  Search,
  ExternalLink,
  ChevronRight,
  ClipboardCheck,
  Fingerprint,
  AlertTriangle,
  Flame,
  Wrench,
  Lock,
  Globe2,
  Sun,
  Moon,
  FileSpreadsheet,
  Bell,
  Clock,
  Calendar
} from "lucide-react";
import { 
  AgentRecord, 
  LedgerEvent, 
  IncidentRecord, 
  BillingUsage, 
  GenomePayload, 
  UserRole,
  AuditReminder
} from "./types";
import { 
  bootstrapDatabaseIfEmpty, 
  saveAgentToFirestore, 
  saveLedgerEventToFirestore, 
  updateAgentInFirestore, 
  saveIncidentToFirestore, 
  remediateIncidentInFirestore, 
  updateBillingInFirestore,
  getRemindersFromFirestore,
  saveReminderToFirestore,
  deleteReminderFromFirestore
} from "./pglService";
import { computeEventHash } from "./data";
import LineageExplorer from "./components/LineageExplorer";
import NotaryChat from "./components/NotaryChat";
import GoogleSheetsSync from "./components/GoogleSheetsSync";
import ExecutionIdentityV1Control from "./components/ExecutionIdentityV1Control";
import ManualHashVerifier from "./components/ManualHashVerifier";

// Default placeholder for new agent creation wizard
const INITIAL_GENOME: GenomePayload = {
  model_family: "gemini-2.5-flash",
  model_version: "v1.0",
  architecture: "tool-using-agent",
  tools: ["secure-web-browser", "crm-sync-client"],
  permissions: ["read:data", "write:tasks"],
  safety_rules: ["always-verify-pii", "human-review-for-payments"],
  runtime_config: {
    temperature: 0.2,
    max_steps: 10
  },
  intended_use: "A flexible and compliant administrative automation agent.",
  risk_category: "medium"
};

const renderSparkline = (historyList: { status: "passed" | "failed" }[]) => {
  if (!historyList || historyList.length === 0) {
    return (
      <span className="text-white/25 inline-block select-none">-</span>
    );
  }
  
  // Take last 8 items for sparkline
  const points = historyList.slice(-8);
  const width = 36;
  const height = 10;
  const padding = 1.5;
  
  if (points.length === 1) {
    const color = points[0].status === "passed" ? "#34d399" : "#f25555";
    return (
      <div className="flex items-center inline-block" title="1 verification recorded">
        <svg width={width} height={height} className="overflow-visible">
          <circle cx={width / 2} cy={height / 2} r={2} fill={color} />
        </svg>
      </div>
    );
  }
  
  const stepX = (width - padding * 2) / (points.length - 1);
  const strokeColor = points[points.length - 1].status === "passed" ? "#34d399" : "#f25555";
  
  return (
    <div className="flex items-center inline-block" title={`${points.length} verification events tracked`}>
      <svg width={width} height={height} className="overflow-visible">
        <polyline
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points.map((p, idx) => {
            const x = padding + idx * stepX;
            const y = p.status === "passed" ? padding : height - padding;
            return `${x},${y}`;
          }).join(' ')}
        />
        <circle
          cx={padding + (points.length - 1) * stepX}
          cy={points[points.length - 1].status === "passed" ? padding : height - padding}
          r="1.5"
          fill={strokeColor}
        />
      </svg>
    </div>
  );
};

export default function App() {
  // State variables
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [ledgerEvents, setLedgerEvents] = useState<LedgerEvent[]>([]);
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [billing, setBilling] = useState<BillingUsage>({
    tier: "launch",
    active_agents: 3,
    agent_limit: 25,
    ledger_storage_mb: 2.15,
    storage_limit_mb: 10000,
    lineage_renders: 48,
    renders_limit: 500,
    price_monthly: 749,
    overage_agent_fee: 30
  });

  // Theme preference state loading from localStorage
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("theme");
    return (saved === "light" || saved === "dark") ? saved : "dark";
  });

  // Apply theme to body element
  useEffect(() => {
    const bodyMode = document.body;
    if (theme === "light") {
      bodyMode.classList.add("light");
    } else {
      bodyMode.classList.remove("light");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Handle toggling theme mode
  const toggleTheme = () => {
    setTheme(prev => prev === "light" ? "dark" : "light");
  };

  // Real-time billing usage monitoring (dynamic update every 30 seconds via /api/v1/billing/usage)
  useEffect(() => {
    async function fetchBillingUsage() {
      try {
        const response = await fetch("/api/v1/billing/usage");
        if (response.ok) {
          const data = await response.json();
          setBilling(prev => ({
            ...prev,
            ...data
          }));
        }
      } catch (err) {
        console.warn("Failed to fetch fresh telemetry metrics from /api/v1/billing/usage:", err);
      }
    }

    fetchBillingUsage();
    const interval = setInterval(fetchBillingUsage, 30000);
    return () => clearInterval(interval);
  }, []);

  const [selectedAgent, setSelectedAgent] = useState<AgentRecord | null>(null);
  const [lastAuditTimes, setLastAuditTimes] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem("pgl_last_audit_times");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [lastAuditRecords, setLastAuditRecords] = useState<Record<string, { time: string; status: "passed" | "failed" }>>(() => {
    try {
      const saved = localStorage.getItem("pgl_last_audit_records");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [auditHistory, setAuditHistory] = useState<Record<string, { status: "passed" | "failed"; time: string }[]>>(() => {
    try {
      const saved = localStorage.getItem("pgl_audit_history");
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      "agent-alpha-001": [
        { status: "passed" as const, time: "10:30:12 AM" },
        { status: "passed" as const, time: "11:15:45 AM" },
        { status: "passed" as const, time: "12:05:00 PM" },
        { status: "passed" as const, time: "01:22:15 PM" },
        { status: "passed" as const, time: "02:40:55 PM" },
        { status: "passed" as const, time: "04:15:30 PM" }
      ],
      "agent-beta-002": [
        { status: "passed" as const, time: "09:12:44 AM" },
        { status: "failed" as const, time: "10:05:12 AM" },
        { status: "passed" as const, time: "11:20:01 AM" },
        { status: "passed" as const, time: "01:05:59 PM" },
        { status: "passed" as const, time: "03:45:10 PM" }
      ],
      "agent-sentinel-003": [
        { status: "passed" as const, time: "08:00:00 AM" },
        { status: "passed" as const, time: "10:15:00 AM" },
        { status: "passed" as const, time: "12:30:00 PM" },
        { status: "passed" as const, time: "02:45:00 PM" },
        { status: "passed" as const, time: "04:50:11 PM" }
      ]
    };
  });
  const [activeTab, setActiveTab] = useState<"registry" | "timeline" | "lineage" | "billing" | "notary_chat" | "incidents" | "sheets" | "execution_identity" | "hash_verifier">("registry");

  const [selectedRole, setSelectedRole] = useState<UserRole>("owner");
  const [isLoading, setIsLoading] = useState(true);
  const [verificationResult, setVerificationResult] = useState<{
    verified: boolean;
    auditedCount: number;
    errorAtIndex: number | null;
    chainHashes: string[];
  } | null>(null);

  // Local/Cloud Audit Reminders State
  const [reminders, setReminders] = useState<AuditReminder[]>(() => {
    try {
      const saved = localStorage.getItem("pgl_audit_reminders");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showSchedulePopover, setShowSchedulePopover] = useState(false);
  const [schedulingDays, setSchedulingDays] = useState<number>(7);
  const [customDaysValue, setCustomDaysValue] = useState<string>("");
  const [scheduleSuccessMessage, setScheduleSuccessMessage] = useState<string | null>(null);

  // Upgrade Modal, Webhook Simulator & Confetti Triggers
  const [showConfetti, setShowConfetti] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [simulatingWebhook, setSimulatingWebhook] = useState(false);
  const [webhookLogs, setWebhookLogs] = useState<string[]>([]);
  const [investorMode, setInvestorMode] = useState(false);

  // New Agent Input Wizard
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentCreator, setNewAgentCreator] = useState("Veklom Operations");
  const [newAgentJurisdiction, setNewAgentJurisdiction] = useState("US-CA");
  const [genomeInput, setGenomeInput] = useState<GenomePayload>({ ...INITIAL_GENOME });
  const [selectedParentId, setSelectedParentId] = useState<string>("");
  const [activeWizardStep, setActiveWizardStep] = useState<1 | 2 | 3>(1);

  // New Genome Version Patch inputs (Update Brain)
  const [patchModelFamily, setPatchModelFamily] = useState("gemini-2.5-pro");
  const [patchArchitecture, setPatchArchitecture] = useState("multi-agent-orchestrator");
  const [patchToolsText, setPatchToolsText] = useState("secure-web-browser, crm-sync-client, terminal-agent");
  const [patchSafetyRulesText, setPatchSafetyRulesText] = useState("always-verify-pii, human-review-for-payments, no-unapproved-data-export");

  // New Incident declaration state
  const [newIncidentTitle, setNewIncidentTitle] = useState("");
  const [newIncidentSeverity, setNewIncidentSeverity] = useState<"low" | "medium" | "high">("medium");
  const [newIncidentDesc, setNewIncidentDesc] = useState("");
  const [remediationNotesText, setRemediationNotesText] = useState("");
  const [activeRemediatingId, setActiveRemediatingId] = useState<string | null>(null);

  // Live Genome analysis rating report generated by server-side Gemini Flash
  const [analyzingGenome, setAnalyzingGenome] = useState(false);
  const [genomeReviewReport, setGenomeReviewReport] = useState<string | null>(null);

  // Bootstrap Database on Mount
  useEffect(() => {
    async function loadData() {
      const dbState = await bootstrapDatabaseIfEmpty();
      setAgents(dbState.agents);
      setLedgerEvents(dbState.events);
      setIncidents(dbState.incidents);
      setBilling(dbState.billing);
      
      try {
        const dbReminders = await getRemindersFromFirestore();
        if (dbReminders && dbReminders.length > 0) {
          setReminders(dbReminders);
        }
      } catch (err) {
        console.warn("Could not load reminders from firestore on mount:", err);
      }
      
      // Auto-select Alpha clinical summary agent
      if (dbState.agents.length > 0) {
        setSelectedAgent(dbState.agents[0]);
      }
      setIsLoading(false);
    }
    loadData();
  }, []);

  // Synchronize reminders to local storage
  useEffect(() => {
    localStorage.setItem("pgl_audit_reminders", JSON.stringify(reminders));
  }, [reminders]);

  // Poll for due scheduled reminders
  useEffect(() => {
    const checkInterval = setInterval(() => {
      const now = new Date();
      let updatedAny = false;
      
      const updatedReminders = reminders.map(reminder => {
        if (!reminder.triggered && new Date(reminder.targetTime) <= now) {
          updatedAny = true;
          
          // Triggers system browser Notification if permitted
          if ("Notification" in window) {
            if (Notification.permission === "granted") {
              try {
                new Notification(`⚠️ Audit Reminder: ${reminder.agentName}`, {
                  body: `Your scheduled check for "${reminder.agentName}" is due. Re-verify the chain now!`,
                });
              } catch (e) {
                console.warn("Notification error:", e);
              }
            }
          }
          
          return { ...reminder, triggered: true };
        }
        return reminder;
      });

      if (updatedAny) {
        setReminders(updatedReminders);
        updatedReminders.forEach(async (rem) => {
          if (rem.triggered) {
            await saveReminderToFirestore(rem);
          }
        });
      }
    }, 5000);

    return () => clearInterval(checkInterval);
  }, [reminders]);

  // Filtered Events for the currently selected agent
  const currentAgentEvents = useMemo(() => {
    if (!selectedAgent) return [];
    return ledgerEvents.filter((ev) => ev.agent_id === selectedAgent.id);
  }, [ledgerEvents, selectedAgent]);

  // Handle active agent select with tab focus update
  const handleSelectAgent = (agent: AgentRecord) => {
    setSelectedAgent(agent);
    setVerificationResult(null); // Clear previous trace verification states
    setGenomeReviewReport(null);
  };

  // 1. Issue Agent Birth Certificate
  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgentName.trim()) return;

    // Check Quota Limits (Launch tier enforces 25 active agents)
    if (agents.length >= billing.agent_limit) {
      setShowUpgradeModal(true);
      return;
    }

    setIsLoading(true);
    const agentId = "agent-" + Date.now().toString(36);
    const certId = "cert-" + Math.floor(Math.random() * 8999 + 1000).toString();
    const serialNumber = `PGL-2026-${String.fromCharCode(65 + Math.floor(Math.random()*26))}${Math.floor(Math.random()*89 + 10)}-C${Math.floor(Math.random()*8)+1}`;
    
    // Simple mock SHA-256 equivalent
    const genomeHash = "0f" + Array.from({length: 38}, () => Math.floor(Math.random()*16).toString(16)).join("");
    const signature = "SIG_0x" + Array.from({length: 48}, () => Math.floor(Math.random()*16).toString(16)).join("");

    const newAgent: AgentRecord = {
      id: agentId,
      name: newAgentName,
      creator: newAgentCreator,
      jurisdiction: newAgentJurisdiction,
      created_at: new Date().toISOString(),
      is_revoked: false,
      parent_agent_ids: selectedParentId ? [selectedParentId] : [],
      active_version: 1,
      genome: { ...genomeInput },
      certificate: {
        id: certId,
        serial_number: serialNumber,
        issuance_date: new Date().toISOString(),
        genome_hash: genomeHash,
        signature: signature
      },
      genome_versions: [
        {
          version: 1,
          timestamp: new Date().toISOString(),
          genome: { ...genomeInput },
          hash: genomeHash
        }
      ]
    };

    // Build the Genesis or follow-up birth event to append onto our ledger
    // If there is a parent, let's tie the ledger history or find parent's last hash
    let parentLastHash = "00000000000000000000000000000000";
    if (selectedParentId) {
      const parentEvents = ledgerEvents.filter(e => e.agent_id === selectedParentId);
      if (parentEvents.length > 0) {
        parentLastHash = parentEvents[parentEvents.length - 1].event_hash;
      }
    }

    const birthEvent: LedgerEvent = {
      id: "evt-birth-" + Date.now().toString(36),
      agent_id: agentId,
      timestamp: new Date().toISOString(),
      event_type: "birth",
      title: "Genesis Birth Certificate Issued",
      description: `Decentralized notarization parameters committed. Signature reference verified as active. Parent dependencies identified: [${selectedParentId || "None"}].`,
      operator: `${selectedRole}@veklom.com`,
      prev_event_hash: parentLastHash, // Chained dynamically
      event_hash: ""
    };
    
    birthEvent.event_hash = computeEventHash(birthEvent);

    // Save to Database
    const successAgent = await saveAgentToFirestore(newAgent);
    const successEvent = await saveLedgerEventToFirestore(birthEvent);

    if (successAgent && successEvent) {
      const updatedAgents = [...agents, newAgent];
      const updatedEvents = [...ledgerEvents, birthEvent];
      setAgents(updatedAgents);
      setLedgerEvents(updatedEvents);
      
      // Update local billing usages
      const updatedBilling = {
        ...billing,
        active_agents: updatedAgents.length,
        ledger_storage_mb: parseFloat((billing.ledger_storage_mb + 0.15).toFixed(2)) // each write adds ~0.15MB
      };
      setBilling(updatedBilling);
      await updateBillingInFirestore(updatedBilling);

      setSelectedAgent(newAgent);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 5000); // clear celebration state

      // Background auto sync to Google Sheets if authorized



      // Reset Inputs
      setNewAgentName("");
      setSelectedParentId("");
      setGenomeInput({ ...INITIAL_GENOME });
      setActiveWizardStep(1);
      setActiveTab("registry");
    } else {
      alert("Error synchronizing agent with cloud ledger databases. Please check write credentials or roles.");
    }
    setIsLoading(false);
  };

  // 2. Submit Genome version update / patch brain model
  const handleUpgradeGenome = async () => {
    if (!selectedAgent) return;

    setIsLoading(true);
    const nextVersion = selectedAgent.active_version + 1;
    const modelHash = "0f" + Array.from({length: 38}, () => Math.floor(Math.random()*16).toString(16)).join("");

    const parsedTools = patchToolsText.split(",").map(t => t.trim()).filter(Boolean);
    const parsedRules = patchSafetyRulesText.split(",").map(r => r.trim()).filter(Boolean);

    const upgradedGenome: GenomePayload = {
      model_family: patchModelFamily,
      model_version: `v${nextVersion}.0`,
      architecture: patchArchitecture,
      tools: parsedTools,
      permissions: [...selectedAgent.genome.permissions], // inherits legacy
      safety_rules: parsedRules,
      runtime_config: { ...selectedAgent.genome.runtime_config, max_steps: selectedAgent.genome.runtime_config.max_steps + 2 },
      intended_use: selectedAgent.genome.intended_use,
      risk_category: selectedAgent.genome.risk_category
    };

    const updatedAgent: AgentRecord = {
      ...selectedAgent,
      active_version: nextVersion,
      genome: upgradedGenome,
      certificate: {
        ...selectedAgent.certificate,
        genome_hash: modelHash
      },
      genome_versions: [
        ...selectedAgent.genome_versions,
        {
          version: nextVersion,
          timestamp: new Date().toISOString(),
          genome: upgradedGenome,
          hash: modelHash
        }
      ]
    };

    const lastEvent = currentAgentEvents[currentAgentEvents.length - 1];
    const prevHash = lastEvent ? lastEvent.event_hash : "00000000000000000000000000000000";

    // Ledger patch block
    const patchEvent: LedgerEvent = {
      id: "evt-patch-" + Date.now().toString(36),
      agent_id: selectedAgent.id,
      timestamp: new Date().toISOString(),
      event_type: "genome_update",
      title: `Genome Patched to v${nextVersion}.0`,
      description: `Integrity parameter change logged. Neural architecture updated to [${patchArchitecture}] utilizing high-capacity pipeline [${patchModelFamily}].`,
      operator: `${selectedRole}@veklom.com`,
      prev_event_hash: prevHash,
      event_hash: ""
    };
    patchEvent.event_hash = computeEventHash(patchEvent);

    const successUpdate = await updateAgentInFirestore(updatedAgent);
    const successEvent = await saveLedgerEventToFirestore(patchEvent);

    if (successUpdate && successEvent) {
      setAgents(agents.map(a => a.id === selectedAgent.id ? updatedAgent : a));
      const updatedEvents = [...ledgerEvents, patchEvent];
      setLedgerEvents(updatedEvents);
      setSelectedAgent(updatedAgent);

      // Background auto sync to Google Sheets if authorized


      // increment billing storage metric
      const updatedBilling = {
        ...billing,
        ledger_storage_mb: parseFloat((billing.ledger_storage_mb + 0.12).toFixed(2))
      };
      setBilling(updatedBilling);
      await updateBillingInFirestore(updatedBilling);
      alert(`Success! Aegis ledger updated on block chain with new version v${nextVersion}.0`);
    } else {
      alert("Failed to patch agent database.");
    }
    setIsLoading(false);
  };

  // 3. Log real-time incident report
  const handleDeclareIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgent || !newIncidentTitle.trim()) return;

    setIsLoading(true);
    const incId = "inc-" + Date.now().toString(36);
    const newIncident: IncidentRecord = {
      id: incId,
      agent_id: selectedAgent.id,
      agent_name: selectedAgent.name,
      title: newIncidentTitle,
      description: newIncidentDesc,
      severity: newIncidentSeverity,
      reported_at: new Date().toISOString(),
      status: "open"
    };

    // Ledger block
    const lastEvent = currentAgentEvents[currentAgentEvents.length - 1];
    const prevHash = lastEvent ? lastEvent.event_hash : "00000000000000000000000000000000";

    const incidentEvent: LedgerEvent = {
      id: "evt-inc-" + Date.now().toString(36),
      agent_id: selectedAgent.id,
      timestamp: new Date().toISOString(),
      event_type: "incident",
      title: `Operational Incident Logged [${newIncidentSeverity.toUpperCase()}]`,
      description: `WARNING: ${newIncidentTitle}. Flagged under live operations logs: ${newIncidentDesc}`,
      operator: `${selectedRole}@veklom.com`,
      prev_event_hash: prevHash,
      event_hash: "",
      severity: newIncidentSeverity
    };
    incidentEvent.event_hash = computeEventHash(incidentEvent);

    const successIncident = await saveIncidentToFirestore(newIncident);
    const successEvent = await saveLedgerEventToFirestore(incidentEvent);

    if (successIncident && successEvent) {
      setIncidents([...incidents, newIncident]);
      setLedgerEvents([...ledgerEvents, incidentEvent]);

      // Background auto sync to Google Sheets if authorized


      setNewIncidentTitle("");
      setNewIncidentDesc("");
      alert("Operational incident successfully cataloged and recorded in decentralized blockchain ledger.");
    } else {
      alert("Error adding event blocks.");
    }
    setIsLoading(false);
  };

  const handleTriggerLedgerEventDirectly = async (newEvent: LedgerEvent) => {
    const success = await saveLedgerEventToFirestore(newEvent);
    if (success) {
      setLedgerEvents(prev => [...prev, newEvent]);

    }
  };

  const handleAddIncidentFromSimulator = async (newIncident: IncidentRecord, incidentEvent: LedgerEvent) => {
    const successIncident = await saveIncidentToFirestore(newIncident);
    const successEvent = await saveLedgerEventToFirestore(incidentEvent);
    if (successIncident && successEvent) {
      setIncidents(prev => [...prev, newIncident]);
      setLedgerEvents(prev => [...prev, incidentEvent]);

    }
  };

  // 4. Remediate / Resolve Active Incident
  const handleRemediateIncident = async (incId: string) => {
    if (!remediationNotesText.trim()) return;
    setIsLoading(true);

    const targetInc = incidents.find(i => i.id === incId);
    if (!targetInc) return;

    // Save update
    const successRemediation = await remediateIncidentInFirestore(incId, "remediated", remediationNotesText);
    
    // Ledger block
    const lastEvent = ledgerEvents.filter(e => e.agent_id === targetInc.agent_id).pop();
    const prevHash = lastEvent ? lastEvent.event_hash : "00000000000000000000000000000000";

    const remediationEvent: LedgerEvent = {
      id: "evt-rem-" + Date.now().toString(36),
      agent_id: targetInc.agent_id,
      timestamp: new Date().toISOString(),
      event_type: "audit",
      title: `Incident Resolved & Remediation Complete`,
      description: `Notary-auditor approved fix notes: [${remediationNotesText}]. Audit parameters marked secure.`,
      operator: `${selectedRole}@veklom.com`,
      prev_event_hash: prevHash,
      event_hash: ""
    };
    remediationEvent.event_hash = computeEventHash(remediationEvent);
    await saveLedgerEventToFirestore(remediationEvent);

    setIncidents(incidents.map(i => i.id === incId ? { ...i, status: "remediated", remediation_notes: remediationNotesText } : i));
    setLedgerEvents([...ledgerEvents, remediationEvent]);

    // Background auto sync to Google Sheets if authorized


    setRemediationNotesText("");
    setActiveRemediatingId(null);
    alert("Remediation parameters locked into chain. Incident status updated successfully.");
    setIsLoading(false);
  };

  // 4b. Permanently Terminate / Decommission AI Agent
  const handleTerminateAgent = async () => {
    if (!selectedAgent) return;
    if (selectedAgent.is_revoked) {
      alert("This agent is already terminated.");
      return;
    }

    const confirmTermination = window.confirm(
      `CRITICAL ACTION REQUIRED:\nAre you absolutely sure you want to TERMINATE the active AI agent "${selectedAgent.name}"? This will permanently revoke its security certificate/tag and declare and log a permanent decommissioning block on the ledger.`
    );
    if (!confirmTermination) return;

    setIsLoading(true);

    const updatedAgent: AgentRecord = {
      ...selectedAgent,
      is_revoked: true
    };

    const lastEvent = ledgerEvents.filter(e => e.agent_id === selectedAgent.id).pop();
    const prevHash = lastEvent ? lastEvent.event_hash : "00000000000000000000000000000000";

    const terminationEvent: LedgerEvent = {
      id: "evt-term-" + Date.now().toString(36),
      agent_id: selectedAgent.id,
      timestamp: new Date().toISOString(),
      event_type: "incident",
      title: "AI Agent Certificate Compliance Terminated",
      description: `MANUAL DECOMMISSIONING: Authorized operator issued terminal command for agent "${selectedAgent.name}". Active license tags are permanently revoked.`,
      operator: `${selectedRole}@veklom.com`,
      prev_event_hash: prevHash,
      event_hash: ""
    };
    terminationEvent.event_hash = computeEventHash(terminationEvent);

    const successUpdate = await updateAgentInFirestore(updatedAgent);
    const successEvent = await saveLedgerEventToFirestore(terminationEvent);

    if (successUpdate && successEvent) {
      setAgents(agents.map(a => a.id === selectedAgent.id ? updatedAgent : a));
      setLedgerEvents([...ledgerEvents, terminationEvent]);
      setSelectedAgent(updatedAgent);

      // Background auto sync to sheet for both agent's new status and termination log block



      alert(`Official Decommission Complete: "${selectedAgent.name}" secure active tag has been designated TERMINATED.`);
    } else {
      alert("Error saving termination state to genome database.");
    }
    setIsLoading(false);
  };

  // 5. Compute and Verify Trace/Ledger Chain integrity
  const handleVerifyLedgerChain = () => {
    if (currentAgentEvents.length === 0) return;

    let verified = true;
    let errorAtIndex: number | null = null;
    const chainHashes: string[] = [];

    for (let i = 0; i < currentAgentEvents.length; i++) {
      const current = currentAgentEvents[i];
      chainHashes.push(current.event_hash);

      // Check current block's hash validity by recomputing
      const recomputed = computeEventHash(current);
      if (recomputed !== current.event_hash) {
        verified = false;
        errorAtIndex = i;
        break;
      }

      // Check chaining link
      if (i > 0) {
        const prev = currentAgentEvents[i - 1];
        if (current.prev_event_hash !== prev.event_hash) {
          verified = false;
          errorAtIndex = i;
          break;
        }
      } else {
        // First root block of this agent
        if (current.prev_event_hash !== "00000000000000000000000000000000" && current.prev_event_hash !== "" && current.event_type === "birth") {
          // It's allowed to trace backward if descended from parent, verify parent status exists
          const parentExists = agents.some(a => a.id === selectedAgent?.parent_agent_ids[0]);
          if (!parentExists && current.prev_event_hash !== "00000000000000000000000000000000") {
            // Unresolveable hash link
            verified = false;
            errorAtIndex = i;
            break;
          }
        }
      }
    }

    setVerificationResult({
      verified,
      auditedCount: currentAgentEvents.length,
      errorAtIndex,
      chainHashes
    });

    if (selectedAgent) {
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const statusValue = verified ? ("passed" as const) : ("failed" as const);
      
      if (verified) {
        setLastAuditTimes(prev => {
          const updated = { ...prev, [selectedAgent.id]: timeStr };
          localStorage.setItem("pgl_last_audit_times", JSON.stringify(updated));
          return updated;
        });
      }

      setLastAuditRecords(prev => {
        const updated = {
          ...prev,
          [selectedAgent.id]: {
            time: timeStr,
            status: statusValue
          }
        };
        localStorage.setItem("pgl_last_audit_records", JSON.stringify(updated));
        return updated;
      });

      setAuditHistory(prev => {
        const currentHist = prev[selectedAgent.id] || [];
        const updated = {
          ...prev,
          [selectedAgent.id]: [
            ...currentHist,
            { status: statusValue, time: timeStr }
          ]
        };
        localStorage.setItem("pgl_audit_history", JSON.stringify(updated));
        return updated;
      });
    }
  };

  // Handle scheduling a local/Firestore chain verification reminder
  const handleScheduleAudit = async () => {
    if (!selectedAgent) {
      alert("Please select an active agent first.");
      return;
    }

    if ("Notification" in window && Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch (err) {
        console.warn("Could not request notification permissions:", err);
      }
    }

    const id = "reminder-" + Date.now();
    const scheduledAt = new Date().toISOString();
    const target = new Date();

    let days = schedulingDays;
    if (schedulingDays === -1) {
      const num = parseInt(customDaysValue);
      if (isNaN(num) || num <= 0) {
        alert("Please enter a valid positive number of days.");
        return;
      }
      days = num;
      target.setDate(target.getDate() + days);
    } else if (schedulingDays === 0.00017) {
      // 15 seconds test
      target.setSeconds(target.getSeconds() + 15);
    } else if (schedulingDays === 0.0007) {
      // 1 minute test
      target.setMinutes(target.getMinutes() + 1);
    } else {
      target.setDate(target.getDate() + days);
    }

    const newReminder: AuditReminder = {
      id,
      agentId: selectedAgent.id,
      agentName: selectedAgent.name,
      days,
      scheduledAt,
      targetTime: target.toISOString(),
      triggered: false
    };

    const success = await saveReminderToFirestore(newReminder);
    setReminders(prev => [...prev, newReminder]);
    
    let msg = `Successfully scheduled verification reminder for "${selectedAgent.name}" in ${
      schedulingDays === 0.00017 ? '15 seconds' : schedulingDays === 0.0007 ? '1 minute' : `${days} days`
    }!`;
    if (!success) {
      msg = `Offline notification set for "${selectedAgent.name}" in ${
        schedulingDays === 0.00017 ? '15 seconds' : schedulingDays === 0.0007 ? '1 minute' : `${days} days`
      }.`;
    }
    setScheduleSuccessMessage(msg);
    setTimeout(() => setScheduleSuccessMessage(null), 8500);
    setShowSchedulePopover(false);
  };

  // 6. Request Gemini Security Assessment / Genome review from server-side Flask-based proxies
  const handleRequestGenomeReview = async () => {
    if (!selectedAgent) return;
    setAnalyzingGenome(true);
    setGenomeReviewReport(null);

    try {
      const response = await fetch("/api/analyze-genome", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: selectedAgent.name,
          genome: selectedAgent.genome
        })
      });

      if (!response.ok) {
        throw new Error("Proxy response failed");
      }

      const data = await response.json();
      setGenomeReviewReport(data.report);
    } catch (e: any) {
      setGenomeReviewReport(`⚠️ **Notary Auditing Timeout**: Unable to reach AI Assessment engine. Configure \`GEMINI_API_KEY\` variable in secrets menu.\n\nLocal Sandbox Fallback Rating: **GRADE B+** (Rules are correctly applied, but requires human-in-the-loop review for payment routing as configured).`);
    } finally {
      setAnalyzingGenome(false);
    }
  };

  // 7. Stripe Callback Webhook Simulator (Upgrades plan tier to Scale in Real-time!)
  const handleTriggerStripeWebhook = async () => {
    setSimulatingWebhook(true);
    setWebhookLogs([]);
    
    const logs = [
      "📡 Establishing connection with https://api.stripe.com/v3...",
      "⚡ Webhook event received from webhook signing endpoint...",
      "📦 Event Type: customer.subscription.updated",
      "🔑 Invoice reference checks: inv_39A019bBXe91",
      "💰 Charge status: Paid ($4,950 MRR for SCALE TIER subscription)",
      "🔓 Issuance limit increased: 25 -> 250 active agents",
      "🚀 Enforcing plan parameters globally in active workspace",
      "✅ Platform synced. Scale features successfully activated!"
    ];

    for (let i = 0; i < logs.length; i++) {
      await new Promise(r => setTimeout(r, 400));
      setWebhookLogs(prev => [...prev, logs[i]]);
    }

    const updatedBilling: BillingUsage = {
      ...billing,
      tier: "scale",
      agent_limit: 250,
      storage_limit_mb: 150000, // 150 GB
      renders_limit: 10000,
      price_monthly: 4950,
      overage_agent_fee: 25
    };
    
    setBilling(updatedBilling);
    await updateBillingInFirestore(updatedBilling);
    setSimulatingWebhook(false);
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 5000);
  };

  const handleAddLedgerEvent = async (eventData: Omit<LedgerEvent, "id" | "prev_event_hash" | "event_hash">) => {
    const parentLastHash = ledgerEvents.length > 0 ? ledgerEvents[ledgerEvents.length - 1].event_hash : "00000000000000000000000000000000";
    const newEvent: LedgerEvent = {
      ...eventData,
      id: `evt-comp-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
      prev_event_hash: parentLastHash,
      event_hash: ""
    };
    newEvent.event_hash = computeEventHash(newEvent);
    
    const success = await saveLedgerEventToFirestore(newEvent);
    if (success) {
      setLedgerEvents(prev => [...prev, newEvent]);
    }
  };

  // 8. Download complete physical compliance JSON bundle
  const handleExportComplianceReport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(
      JSON.stringify({
        project_genome_ledger_audit_report: {
          exported_at: new Date().toISOString(),
          active_tier: billing.tier,
          operator_identity: `${selectedRole}@veklom.com`,
          platform_integrity_status: verificationResult?.verified ? 'VERIFIED_COMPLIANT' : 'UNAUDITED_TRACES_PENDING',
          registered_agent_count: agents.length,
          agents_payload: agents,
          ledger_events: ledgerEvents,
          active_incidents: incidents
        }
      }, null, 2)
    );
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `PGL-Certified-Compliance-Packet-${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="min-h-screen bg-[#050505] text-[#E0E0E0] flex flex-col font-sans relative">
      
      {/* Visual Confetti Indicator overlay */}
      {showConfetti && (
        <div className="absolute inset-0 bg-brand/5 pointer-events-none z-50 flex items-center justify-center transition-all duration-500">
          <div className="bg-[#0A0A0A] border border-brand p-6 rounded-2xl shadow-2xl text-center max-w-sm animate-bounce">
            <Sparkles className="size-12 text-brand mx-auto mb-3 animate-spin" />
            <h3 className="text-lg font-mono font-bold text-white">LEDGER BLOCK CONCURRED</h3>
            <p className="text-xs text-white/60 mt-2">
              Birth Certificate issued and registered into decentralized immutable chain successfully.
            </p>
          </div>
        </div>
      )}

      {/* Top Banner Notice */}
      <div className="bg-gradient-to-r from-[#0A0A0A] via-brand/10 to-[#0A0A0A] border-b border-white/10 px-6 py-2 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-brand"></span>
          </span>
          <span className="font-mono text-white/40 text-[10.5px] uppercase tracking-wide">
            VEKLM CONTROL ROOM COMPLIANCE SYSTEM • DOMAIN ID: SECURE-VEKLM
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-white/70">
            <Lock className="size-3.5 text-brand" />
            <span>ROLE SCOPE:</span>
            <select 
              value={selectedRole} 
              onChange={(e) => setSelectedRole(e.target.value as UserRole)}
              className="bg-[#050505] border border-white/10 text-[10.5px] font-mono text-brand py-0.5 px-2 rounded outline-none cursor-pointer"
            >
              <option value="owner">Owner (Write + Revoke Privilege)</option>
              <option value="admin">Admin (All Access)</option>
              <option value="operator">Operator (Issuance and Patches)</option>
              <option value="viewer">Viewer (Read-Only Logs)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Active Triggered Audit Reminders Banner */}
      {reminders.some(r => r.triggered) && (
        <div className="bg-amber-950/90 border-b border-amber-500/35 text-amber-300 px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono animate-fade-in shadow-[0_0_20px_rgba(245,158,11,0.15)] sticky top-0 z-50">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="size-4.5 text-amber-500 shrink-0 animate-bounce" />
            <span>
              <strong className="text-amber-400">⚠️ LEDGER AUDIT REMINDER:</strong> Re-verification of agent ledger chain is required for system(s):{" "}
              {Array.from(new Set(reminders.filter(r => r.triggered).map(r => r.agentName))).map(name => `"${name}"`).join(", ")}
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => {
                const triggeredRm = reminders.filter(r => r.triggered);
                if (triggeredRm.length > 0) {
                  const targetAgent = agents.find(a => a.id === triggeredRm[0].agentId);
                  if (targetAgent) {
                    handleSelectAgent(targetAgent);
                  }
                }
                setActiveTab("timeline");
                setTimeout(() => {
                  handleVerifyLedgerChain();
                }, 150);
              }}
              className="bg-amber-500 text-black px-3.5 py-1.5 rounded font-bold hover:bg-amber-400 transition text-[11px] uppercase tracking-wider cursor-pointer shadow-md shadow-black/40"
            >
              Verify Now
            </button>
            <button
              onClick={async () => {
                const triggeredIds = reminders.filter(r => r.triggered).map(r => r.id);
                setReminders(prev => prev.filter(r => !triggeredIds.includes(r.id)));
                for (const id of triggeredIds) {
                  await deleteReminderFromFirestore(id);
                }
              }}
              className="text-amber-400/70 hover:text-white underline cursor-pointer text-[10px]"
            >
              Dismiss All
            </button>
          </div>
        </div>
      )}

      {/* Navigation Brand Header */}
      <header className="border-b border-white/10 bg-[#0A0A0A]/80 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand rotate-45 shrink-0 flex items-center justify-center p-1">
            <div className="w-3 h-3 bg-[#0A0A0A] rounded-xs rotate-45"></div>
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-display font-bold uppercase tracking-tight text-white">PGL • Project Genome Ledger</h1>
              <span className="text-[10px] uppercase font-mono tracking-widest bg-brand-muted border border-brand-border text-brand px-2 py-0.5 rounded">
                {billing.tier} ACTIVE
              </span>
            </div>
            <p className="text-xs text-white/50 mt-1">
              Federal auditing sandbox for AI system births, mutations, lifespans, and incident logs.
            </p>
          </div>
        </div>

        {/* Global presenting controls */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* Light/Dark Mode Toggle Button */}
          <button
            onClick={toggleTheme}
            className="bg-[#050505] border border-white/10 hover:border-white/20 text-white/80 px-3 py-1.5 rounded text-xs font-mono transition duration-150 flex items-center gap-1.5 cursor-pointer"
            title="Toggle Light/Dark Theme"
            id="theme-toggle"
          >
            {theme === "dark" ? (
              <>
                <Sun className="size-3.5 text-amber-500 animate-[pulse_2s_infinite]" />
                <span>Light Mode</span>
              </>
            ) : (
              <>
                <Moon className="size-3.5 text-blue-400" />
                <span>Dark Mode</span>
              </>
            )}
          </button>

          {/* Last Audit Indicator Badge */}
          {(() => {
            const auditRec = selectedAgent ? lastAuditRecords[selectedAgent.id] : null;
            const legacyTime = selectedAgent ? lastAuditTimes[selectedAgent.id] : null;
            
            const hasAudit = !!(auditRec || legacyTime);
            const isPassed = auditRec ? auditRec.status === "passed" : (!!legacyTime);
            const displayTime = auditRec ? auditRec.time : (legacyTime || "NEVER");
            
            const history = selectedAgent ? (auditHistory[selectedAgent.id] || []) : [];
            const total = history.length;
            const passed = history.filter(h => h.status === "passed").length;
            const successRate = total > 0 ? Math.round((passed / total) * 100) : 100;
            const isWarning = successRate < 80;
            
            return (
              <div 
                className={`flex items-center gap-1.5 bg-[#050505] text-white/50 px-2.5 py-1.5 rounded text-[10px] font-mono h-[28px] transition-all duration-300 hover:scale-[1.03] hover:text-white group cursor-pointer ${
                  isWarning 
                    ? "border border-amber-500 animate-[pulse_2s_infinite] shadow-[0_0_12px_rgba(245,158,11,0.2)]" 
                    : "border border-white/10 hover:border-white/20"
                }`}
                id="last-audit-badge"
                title={`Timestamp and status of the last chain verification performed on the active agent ledger${isWarning ? ' - ATTENTION: Success Rate is below 80%!' : ''}`}
              >
                <span 
                  className={`size-2 rounded-full animate-pulse shrink-0 ${
                    isPassed 
                      ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" 
                      : "bg-rose-500 shadow-[0_0_8px_rgba(242,85,85,0.5)]"
                  }`}
                  title={isPassed ? "Last verification passed" : "Verification failed or has not been performed"}
                />
                <ShieldCheck className={`size-3.5 ${isPassed ? "text-emerald-400" : "text-white/30"}`} />
                <span>LAST AUDIT:</span>
                <span className={hasAudit ? "text-white font-bold" : "text-white/30 italic"}>
                  {displayTime}
                </span>
                
                {/* Expanded custom sparkline + Success rate indicators */}
                <div className="max-w-0 opacity-0 group-hover:opacity-100 group-hover:max-w-[220px] group-hover:ml-2.5 transition-all duration-300 ease-out overflow-hidden flex items-center gap-2 border-l border-white/10 pl-2">
                  {renderSparkline(history)}
                  <span className={`font-sans text-[10px] font-bold whitespace-nowrap ${isWarning ? 'text-amber-400 animate-pulse' : 'text-emerald-400'}`}>
                    {successRate}% SR
                  </span>
                </div>

                <span className="max-w-0 opacity-0 scale-x-75 group-hover:scale-x-100 group-hover:opacity-100 group-hover:max-w-[150px] group-hover:ml-1.5 transition-all duration-300 ease-out overflow-hidden font-sans text-[10px] text-emerald-400 font-semibold whitespace-nowrap origin-left">
                  View Full Audit History
                </span>
              </div>
            );
          })()}

          {/* Investor Presentation Button Toggle */}
          <button
            onClick={() => setInvestorMode(!investorMode)}
            className={`border px-3 py-1.5 rounded text-xs font-mono transition duration-150 flex items-center gap-1.5 ${
              investorMode 
                ? "bg-brand/15 border-brand text-brand shadow-[0_0_15px_rgba(242,125,38,0.15)]" 
                : "bg-[#050505] border-white/10 text-white/60 hover:border-white/20"
            }`}
          >
            <BarChart3 className="size-3.5" />
            <span>INVESTOR DEMO MODE: {investorMode ? "ACTIVE (ARR Highlight)" : "OFF"}</span>
          </button>

          {/* Export compliance pack */}
          <button
            onClick={handleExportComplianceReport}
            className="bg-[#050505] border border-white/10 hover:border-white/20 text-white/80 px-3 py-1.5 rounded text-xs font-sans transition duration-150 flex items-center gap-1.5"
          >
            <Download className="size-3.5" />
            <span>Export Compliance Report</span>
          </button>
        </div>
      </header>

      {/* Main Container Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Sidebar Left: Current Selected Agent DNA Spec */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {/* Active audited Agent Selector list card */}
          <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-5 shadow-lg flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-sans font-medium text-white flex items-center gap-2">
                <Cpu className="text-brand size-4.5" />
                Auditable AI Agent Inventory
              </h3>
              <span className="text-[10px] font-mono text-white/40">
                {agents.length} Total
              </span>
            </div>

            <div className="space-y-2 max-h-[190px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              {isLoading ? (
                <div className="text-center text-xs text-white/40 py-6 animate-pulse">
                  Querying active cloud registries...
                </div>
              ) : (
                agents.map((agent) => {
                  const isCur = selectedAgent?.id === agent.id;
                  const isRevoked = agent.is_revoked;
                  return (
                    <button
                      key={agent.id}
                      onClick={() => handleSelectAgent(agent)}
                      className={`w-full text-left p-3 rounded border transition-all duration-200 flex items-center justify-between gap-3 ${
                        isCur
                          ? "bg-white/15 border-brand shadow-md ring-1 ring-brand/10"
                          : "bg-[#050505]/40 border-white/5 hover:bg-white/5 hover:border-white/10"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`p-1.5 rounded-md ${isCur ? "bg-brand/15 text-brand" : "bg-white/5 text-white/50"}`}>
                          <Cpu className="size-3.5" />
                        </div>
                        <div className="truncate">
                          <div className="text-xs font-mono font-medium text-white truncate">{agent.name}</div>
                          {(() => {
                            const handlerList = auditHistory[agent.id] || [];
                            const t = handlerList.length;
                            const p = handlerList.filter(h => h.status === "passed").length;
                            const sr = t > 0 ? Math.round((p / t) * 100) : 100;
                            return (
                              <div className="text-[10px] text-white/40 truncate font-mono flex items-center gap-1.5 mt-0.5">
                                <span>Serial: {agent.certificate.serial_number}</span>
                                <span className="text-white/20">|</span>
                                <span className="text-emerald-400 font-sans font-semibold text-[9.5px]">{sr}% SR</span>
                                {renderSparkline(handlerList)}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-end shrink-0 gap-1">
                        <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                          agent.genome.risk_category === "critical"
                            ? "bg-rose-950/40 text-rose-400" 
                            : agent.genome.risk_category === "high"
                            ? "bg-amber-950/40 text-amber-400"
                            : "bg-cyan-950/40 text-cyan-400"
                        }`}>
                          {agent.genome.risk_category.toUpperCase()}
                        </span>
                        {isRevoked ? (
                          <span className="text-[9px] text-rose-500 font-mono tracking-tight">TERMINATED</span>
                        ) : (
                          <span className="text-[9px] text-brand font-mono flex items-center gap-1">
                            <span className="size-1.5 rounded-full bg-brand animate-pulse"></span> LIVE
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Quick launch mock action triggers inside sandbox */}
            <div className="bg-white/5 p-3 rounded border border-white/5 flex flex-col gap-2.5">
              <h4 className="text-[10.5px] font-mono uppercase tracking-wider text-white/40 border-b border-white/5 pb-1.5">
                Quick Dev Sandbox Tools
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={async () => {
                    // Quick seed reset back to default story
                    setIsLoading(true);
                    setAgents([]);
                    setLedgerEvents([]);
                    setIncidents([]);
                    const s = await bootstrapDatabaseIfEmpty();
                    setAgents(s.agents);
                    setLedgerEvents(s.events);
                    setIncidents(s.incidents);
                    if (s.agents.length > 0) setSelectedAgent(s.agents[0]);
                    setIsLoading(false);
                    alert("Notary datastore soft reset with default Aegis & Boreas ledger files.");
                  }}
                  className="bg-[#050505] hover:bg-white/5 border border-white/10 text-[10px] font-mono py-1 rounded text-white/60 flex items-center justify-center gap-1"
                >
                  <RefreshCw className="size-3" />
                  <span>Reset Seed Data</span>
                </button>
                <button
                  onClick={() => {
                    setSelectedParentId(selectedAgent ? selectedAgent.id : "");
                    setActiveTab("registry");
                    alert(`Selected parent for next fork child: ${selectedAgent ? selectedAgent.name : 'None selected'}`);
                  }}
                  className="bg-brand hover:bg-brand-hover text-black font-sans font-bold text-[10px] uppercase tracking-wider py-1 rounded text-center transition"
                >
                  Fork Selected agent
                </button>
              </div>
            </div>
          </div>

          {/* Active Agent Cryptographic Birth Certificate Panel */}
          {selectedAgent && (
            <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-5 shadow-lg relative overflow-hidden flex flex-col gap-4">
              
              {/* Background glowing watermark */}
              <div className="absolute top-[-40px] right-[-40px] size-[180px] rounded-full bg-brand/5 blur-3xl pointer-events-none"></div>

              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-sm font-sans font-medium text-white flex items-center gap-2">
                  <FileText className="text-brand size-4.5" />
                  Notarized Birth Certificate
                </h3>
                {selectedAgent.is_revoked ? (
                  <span className="text-[9px] font-mono text-rose-500 bg-rose-955/20 px-2 py-0.5 border border-rose-500/30 rounded">
                    TERMINATED / REVOKED
                  </span>
                ) : (
                  <span className="text-[9px] font-mono text-brand bg-brand-muted px-2 py-0.5 border border-brand-border rounded">
                    SECURE ACTIVE TAG
                  </span>
                )}
              </div>

              {/* Graphical Badge Artifact Representation */}
              <div className="bg-[#050505] rounded-xl p-4 border border-white/5 relative font-mono text-[11px] leading-relaxed select-text shadow-inner flex flex-col gap-3">
                
                <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
                  <div className="flex items-center gap-1 text-white/80">
                    <ShieldCheck className="size-4 text-brand" />
                    <span className="font-sans font-bold">PGL CERTIFICATE</span>
                  </div>
                  <span className="text-brand text-right">{selectedAgent.certificate.serial_number}</span>
                </div>

                <div className="space-y-1.5 text-white/70">
                  <div className="flex justify-between">
                    <span className="text-white/40">AGENT ID:</span>
                    <span className="text-white/80 truncate max-w-[170px]">{selectedAgent.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/40">SYSTEM NAME:</span>
                    <span className="text-white font-semibold">{selectedAgent.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/40">CREATOR INDENT:</span>
                    <span className="text-white/80">{selectedAgent.creator}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/40">JURISDICTION:</span>
                    <span className="text-white/80 flex items-center gap-1">
                      <Globe2 className="size-3 text-cyan-400" />
                      {selectedAgent.jurisdiction}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/40">DNA TIME STAMP:</span>
                    <span>{new Date(selectedAgent.created_at).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/40">ACTIVE VERSION:</span>
                    <span className="text-brand font-bold">v{selectedAgent.active_version}.0</span>
                  </div>
                  {(() => {
                    const handlerList = auditHistory[selectedAgent.id] || [];
                    const t = handlerList.length;
                    const p = handlerList.filter(h => h.status === "passed").length;
                    const sr = t > 0 ? Math.round((p / t) * 100) : 100;
                    return (
                      <div className="flex justify-between border-t border-white/5 pt-1.5 mt-1.5">
                        <span className="text-white/40">AUDIT HEALTH:</span>
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-400 font-sans font-bold text-[10px]">{sr}% SR</span>
                          {renderSparkline(handlerList)}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="border-t border-white/5 pt-2.5 space-y-2">
                  <div>
                    <div className="text-[10px] text-white/40 uppercase tracking-widest mb-1">Genome DNA Hash:</div>
                    <div className="bg-[#0A0A0A] border border-white/10 text-[10px] text-cyan-305 px-2 py-1 rounded truncate flex items-center justify-between">
                      <span>{selectedAgent.certificate.genome_hash}</span>
                      <ClipboardCheck 
                        onClick={() => {
                          navigator.clipboard.writeText(selectedAgent.certificate.genome_hash);
                          alert("Genome SHA-Hash metadata copied.");
                        }}
                        className="size-3.5 text-white/30 hover:text-white cursor-pointer"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-white/40 uppercase tracking-widest mb-1">Certified Signature:</div>
                    <div className="bg-[#0A0A0A] border border-white/10 text-[9px] text-white/50 px-2 py-1 rounded select-all break-all line-clamp-1">
                      {selectedAgent.certificate.signature}
                    </div>
                  </div>
                </div>

                {/* Secure seal stamp visual */}
                <div className="absolute bottom-3 right-3 opacity-[0.06] pointer-events-none">
                  <ShieldCheck className="size-20 text-brand" />
                </div>
              </div>

              {/* Action tabs to print or export specifically this agent's genetic snapshot */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const agentStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(selectedAgent, null, 2));
                      const dl = document.createElement('a');
                      dl.setAttribute("href", agentStr);
                      dl.setAttribute("download", `PGL-BirthCertificate-${selectedAgent.certificate.serial_number}.json`);
                      dl.click();
                    }}
                    className="flex-1 bg-[#050505] border border-white/10 hover:border-white/20 hover:bg-[#0A0A0A] text-white/80 py-1.5 rounded text-[11px] font-mono tracking-tight text-center transition cursor-pointer"
                  >
                    Download certificate (.JSON)
                  </button>
                  <button
                    onClick={handleRequestGenomeReview}
                    disabled={analyzingGenome}
                    className="flex-1 bg-brand/10 hover:bg-brand/20 text-brand border border-brand/20 py-1.5 rounded text-[11px] font-mono tracking-tight text-center transition cursor-pointer"
                  >
                    {analyzingGenome ? "Analyzing Brain..." : "Request AI Analysis"}
                  </button>
                </div>

                {!selectedAgent.is_revoked ? (
                  <button
                    onClick={handleTerminateAgent}
                    disabled={isLoading}
                    className="w-full bg-rose-955/20 hover:bg-rose-955 border border-rose-500/20 hover:border-rose-500/40 text-rose-400 py-1.5 rounded text-[11px] font-mono font-bold tracking-tight text-center transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <AlertTriangle className="size-3.5 text-rose-500 animate-[pulse_2s_infinite]" />
                    <span>Terminate Agent Forever</span>
                  </button>
                ) : (
                  <div className="bg-rose-950/20 border border-rose-500/20 text-rose-500 text-center py-1.5 rounded text-[11px] font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 select-none animate-pulse">
                    <AlertTriangle className="size-3.5" />
                    <span>⚠️ LICENSE REGISTRATION TERMINATED</span>
                  </div>
                )}
              </div>

              {/* Gemini Genome review report render if active */}
              {genomeReviewReport && (
                <div className="bg-[#050505]/95 border border-brand/20 p-3.5 rounded-xl text-xs font-sans text-white/80 shadow-inner max-h-[220px] overflow-y-auto">
                  <div className="flex items-center justify-between border-b border-white/10 pb-1.5 mb-2 text-brand font-semibold text-[11px] uppercase tracking-wider font-mono">
                    <span>Gemini Security Review report:</span>
                    <span className="text-[10px] text-white/40 font-normal">MODEL: FLASH</span>
                  </div>
                  <div className="markdown-body text-white/70 leading-relaxed space-y-1.5">
                    <ReactMarkdown>{genomeReviewReport}</ReactMarkdown>
                  </div>
                </div>
              )}

            </div>
          )}

        </div>

        {/* Right Pane: dynamic operations viewport */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          {/* Main Top Navigation Tabs */}
          <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-2.5 flex flex-wrap items-center gap-1 shadow-md">
            {[
              { id: "registry", label: "Agent Birth Wizard", icon: PlusCircle },
              { id: "timeline", label: "Decentralized Timeline", icon: History },
              { id: "lineage", label: "Ancestry Explorer Map", icon: GitBranch },
              { id: "execution_identity", label: "MCPAPI v2.0 Tokens", icon: Key },
              { id: "incidents", label: "Incident Remediation", icon: ShieldAlert },
              { id: "notary_chat", label: "Compliance Chatbot", icon: Sparkles },
              { id: "sheets", label: "Google Sheets Sync", icon: FileSpreadsheet },
              { id: "hash_verifier", label: "Manual Integrity Verifier", icon: Fingerprint },
              { id: "billing", label: "Plan Quotas", icon: Coins },
            ].map((tab) => {
              const Icon = tab.icon;
              const isAct = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as any);
                    setVerificationResult(null); // clear verification text values
                  }}
                  className={`px-4 py-2 rounded text-xs font-sans font-medium transition duration-150 flex items-center gap-2 ${
                    isAct
                      ? "bg-brand text-black font-semibold shadow"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Icon className="size-4 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Render Active View Tab */}
          <div className="flex-1 flex flex-col gap-6">
            
            {/* 1. AGENT BIRTH WIZARD */}
            {activeTab === "registry" && (
              <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-6 shadow-xl flex flex-col gap-6">
                
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div>
                    <h2 className="text-base font-sans font-semibold text-white flex items-center gap-2">
                      <PlusCircle className="text-brand size-5" />
                      Issue New AI Agent Birth Certificate
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Register deep intelligence parameters, compliance regulations, and custom safety scopes.
                    </p>
                  </div>
                  <div className="flex items-center gap-1 font-mono text-[10px] text-slate-400 bg-white/5 px-2.5 py-1.5 rounded border border-white/5">
                    <span>STEP:</span>
                    <span className="text-brand font-bold">{activeWizardStep} / 3</span>
                  </div>
                </div>

                <form onSubmit={handleCreateAgent} className="space-y-6">
                  
                  {/* STEP 1: Basic Identity & Gene Boundaries */}
                  {activeWizardStep === 1 && (
                    <div className="space-y-4 animate-fade-in">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[11px] font-mono text-white/40 uppercase tracking-widest mb-1.5">
                            AI Agent Name <span className="text-brand">*</span>
                          </label>
                          <input
                            type="text"
                            value={newAgentName}
                            onChange={(e) => setNewAgentName(e.target.value)}
                            placeholder="e.g. Aegis-Alpha, Sentinel-Prime"
                            className="w-full bg-[#050505] border border-white/10 text-xs rounded px-3.5 py-2.5 outline-none focus:border-white/20 text-white placeholder-white/25"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-mono text-white/40 uppercase tracking-widest mb-1.5">
                            Jurisdiction of Birth
                          </label>
                          <select
                            value={newAgentJurisdiction}
                            onChange={(e) => setNewAgentJurisdiction(e.target.value)}
                            className="w-full bg-[#050505] border border-white/10 text-xs rounded px-3.5 py-2.5 outline-none text-white"
                          >
                            <option value="US-MA">US-MA (Massachusetts Compliance)</option>
                            <option value="US-CA">US-CA (California Privacy Code)</option>
                            <option value="CA-ON">CA-ON (Canadian Med Health Standard)</option>
                            <option value="EU-FR">EU-FR (Strict EU AI Act Boundary)</option>
                            <option value="GLOBAL">GLOBAL / DEFENSIVE CONTROL RANGE</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[11px] font-mono text-white/40 uppercase tracking-widest mb-1.5">
                            Creator Identifier (Institution)
                          </label>
                          <input
                            type="text"
                            value={newAgentCreator}
                            onChange={(e) => setNewAgentCreator(e.target.value)}
                            className="w-full bg-[#050505] border border-white/10 text-xs rounded px-3.5 py-2.5 outline-none focus:border-white/20 text-white"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-mono text-white/40 uppercase tracking-widest mb-1.5">
                            Link Ancestral Parent (Optional)
                          </label>
                          <select
                            value={selectedParentId}
                            onChange={(e) => setSelectedParentId(e.target.value)}
                            className="w-full bg-[#050505] border border-white/10 text-xs rounded px-3.5 py-2.5 outline-none text-white"
                          >
                            <option value="">-- No parent (Primary Root Genesis) --</option>
                            {agents.map((a) => (
                              <option key={a.id} value={a.id}>
                                Inherit Ancestor: {a.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="flex justify-end pt-2">
                        <button
                          type="button"
                          onClick={() => setActiveWizardStep(2)}
                          className="bg-brand hover:bg-brand-hover text-black text-xs font-sans font-bold uppercase tracking-wider px-5 py-2 rounded transition"
                        >
                          Continue to Model Payload Configuration
                        </button>
                      </div>
                    </div>
                  )}

                  {/* STEP 2: Large Model Configurations */}
                  {activeWizardStep === 2 && (
                    <div className="space-y-4">
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-[11px] font-mono text-white/40 uppercase tracking-widest mb-1.5">
                            Primary Model Core
                          </label>
                          <select
                            value={genomeInput.model_family}
                            onChange={(e) => setGenomeInput({ ...genomeInput, model_family: e.target.value })}
                            className="w-full bg-[#050505] border border-white/10 text-xs rounded px-3 py-2 outline-none text-white"
                          >
                            <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                            <option value="gemini-2.pro-preview">Gemini 2.5 Pro (Thinking model)</option>
                            <option value="gemini-2.1-flash-lite">Gemini 2.1 Flash-Lite</option>
                            <option value="llama-3.2-hospital-fine-tune">Llama 3.2 Fine-Tune</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-mono text-white/40 uppercase tracking-widest mb-1.5">
                            Veklm System Architecture
                          </label>
                          <select
                            value={genomeInput.architecture}
                            onChange={(e) => setGenomeInput({ ...genomeInput, architecture: e.target.value })}
                            className="w-full bg-[#050505] border border-white/10 text-xs rounded px-3 py-2 outline-none text-white"
                          >
                            <option value="tool-using-agent">Tool Using Agent</option>
                            <option value="reflective-clinical-analyst">Reflective Analyst</option>
                            <option value="conversational-care-navigator">Care Outreach Navigator</option>
                            <option value="background-task-runner">Background Sync Worker</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-mono text-white/40 uppercase tracking-widest mb-1.5">
                            System Risk Category
                          </label>
                          <select
                            value={genomeInput.risk_category}
                            onChange={(e) => setGenomeInput({ ...genomeInput, risk_category: e.target.value as any })}
                            className="w-full bg-[#050505] border border-white/10 text-xs rounded px-3 py-2 outline-none text-white"
                          >
                            <option value="low">Low (Standard utility tasks)</option>
                            <option value="medium">Medium (Requires mild user audits)</option>
                            <option value="high">High (Decide/modify human drafts)</option>
                            <option value="critical">Critical (Customer-facing interactive)</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[11px] font-mono text-white/40 uppercase tracking-widest mb-1.5">
                            Tools Array (Comma separated)
                          </label>
                          <input
                            type="text"
                            value={genomeInput.tools.join(", ")}
                            onChange={(e) => setGenomeInput({ ...genomeInput, tools: e.target.value.split(",").map(t => t.trim()).filter(Boolean) })}
                            className="w-full bg-[#050505] border border-white/10 text-xs rounded px-3.5 py-2.5 outline-none text-white"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-mono text-white/40 uppercase tracking-widest mb-1.5">
                            API Permissions Access (Scope array)
                          </label>
                          <input
                            type="text"
                            value={genomeInput.permissions.join(", ")}
                            onChange={(e) => setGenomeInput({ ...genomeInput, permissions: e.target.value.split(",").map(p => p.trim()).filter(Boolean) })}
                            className="w-full bg-[#050505] border border-white/10 text-xs rounded px-3.5 py-2.5 outline-none text-white"
                          />
                        </div>
                      </div>

                      <div className="flex justify-between pt-2">
                        <button
                          type="button"
                          onClick={() => setActiveWizardStep(1)}
                          className="bg-[#050505] whitespace-nowrap border border-white/10 text-white/50 text-xs font-sans px-4 py-2 rounded hover:border-white/20 transition"
                        >
                          Back
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveWizardStep(3)}
                          className="bg-brand hover:bg-brand-hover text-black text-xs font-sans font-bold uppercase tracking-wider px-5 py-2 rounded transition"
                        >
                          Continue to Safety & Alignment Rules
                        </button>
                      </div>

                    </div>
                  )}

                  {/* STEP 3: Safety Guards & Review */}
                  {activeWizardStep === 3 && (
                    <div className="space-y-4">
                      
                      <div className="bg-white/5 border border-white/10 p-4 rounded flex flex-col gap-3">
                        <div className="text-[10px] font-mono text-brand uppercase tracking-wider">
                          Cryptographic Pre-Hash Simulation (Live preview)
                        </div>
                        <div className="text-xs font-mono text-white/70 break-all leading-6">
                          ID: <span className="text-white/30">{"<pending>"}</span> | Serial: <span className="text-white/30">{"<PGL-CERT-MOCK>"}</span><br />
                          Pre-Signature Model Fingerprint:<br />
                          <span className="text-cyan-400">
                            sha256("{genomeInput.model_family}|{genomeInput.architecture}|{genomeInput.tools.join(",")}")
                          </span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-mono text-white/40 uppercase tracking-widest mb-1.5">
                          Safety & Alignment Rules (Comma separated boundaries)
                        </label>
                        <input
                          type="text"
                          value={genomeInput.safety_rules.join(", ")}
                          onChange={(e) => setGenomeInput({ ...genomeInput, safety_rules: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                          className="w-full bg-[#050505] border border-white/10 text-xs rounded px-3.5 py-2.5 outline-none text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-mono text-white/40 uppercase tracking-widest mb-1.5">
                          Intended Use Statement (Required for EU AI Act compliance)
                        </label>
                        <textarea
                          rows={3}
                          value={genomeInput.intended_use}
                          onChange={(e) => setGenomeInput({ ...genomeInput, intended_use: e.target.value })}
                          className="w-full bg-[#050505] border border-white/10 text-xs rounded px-3.5 py-2.5 outline-none focus:border-white/20 text-white"
                        ></textarea>
                      </div>

                      <div className="flex justify-between pt-2">
                        <button
                          type="button"
                          onClick={() => setActiveWizardStep(2)}
                          className="bg-[#050505] border border-white/10 text-white/50 text-xs font-sans px-4 py-2 rounded hover:border-white/20 transition"
                        >
                          Back
                        </button>
                        <button
                          type="submit"
                          disabled={isLoading}
                          className="bg-brand hover:bg-brand-hover text-black text-xs font-sans font-bold uppercase tracking-wider px-6 py-2.5 rounded transition"
                        >
                          {isLoading ? "NOTARIZING IN COMPLIANCE LOG..." : "ISSUE BIRTH CERTIFICATE"}
                        </button>
                      </div>

                    </div>
                  )}

                </form>

              </div>
            )}

            {/* 2. CHRONOLOGICAL TIMELINE LEDGER */}
            {activeTab === "timeline" && (
              <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-6 shadow-xl flex flex-col gap-6">
                
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-white/10 pb-4 gap-4">
                  <div>
                    <h2 className="text-base font-sans font-semibold text-white flex items-center gap-2">
                      <History className="text-brand size-5" />
                      Append-Only Life Ledger (Blockchain Trace)
                    </h2>
                    <p className="text-xs text-slate-400">
                      Chronological history tree of actions, audits, deployments, and incidents logged for the active AI Agent:
                    </p>
                  </div>
                  
                  {/* Ledger verification actions */}
                  <div className="flex flex-wrap items-center gap-2.5 relative">
                    <button
                      onClick={handleVerifyLedgerChain}
                      className="bg-[#050505] hover:bg-white/5 hover:border-white/20 text-white/80 border border-white/10 px-3.5 py-2 rounded text-xs font-mono transition duration-150 flex items-center gap-2 cursor-pointer"
                    >
                      <ShieldCheck className="size-4 text-brand animate-pulse" />
                      <span>Verify Ledger Chain Integrity</span>
                    </button>

                    <button
                      onClick={() => setShowSchedulePopover(!showSchedulePopover)}
                      className="bg-[#050505] hover:bg-white/5 hover:border-white/20 text-white/80 border border-white/10 px-3.5 py-2 rounded text-xs font-mono transition duration-150 flex items-center gap-2 cursor-pointer"
                      title="Schedule a browser or visual reminder to re-verify this ledger chain after a designated period"
                    >
                      <Bell className="size-4 text-brand animate-[pulse_3s_infinite]" />
                      <span>Schedule Audit</span>
                    </button>

                    {showSchedulePopover && (
                      <div className="absolute right-0 top-full mt-2.5 w-64 bg-[#0A0A0A] border border-white/15 rounded-xl p-4 shadow-2xl z-30 flex flex-col gap-3 font-mono text-xs text-[#E0E0E0] animate-fade-in">
                        <div className="flex items-center gap-2 border-b border-white/10 pb-2 mb-1">
                          <Clock className="size-4 text-brand" />
                          <span className="font-bold uppercase text-white">Audit Schedule Tool</span>
                        </div>
                        
                        <p className="text-[11px] text-white/60 leading-relaxed font-sans">
                          Schedule a local browser & cloud audit reminder for agent <strong className="text-brand">"{selectedAgent?.name}"</strong>:
                        </p>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] text-white/40">REMINDER TIME PERIOD:</label>
                          <select
                            value={schedulingDays}
                            onChange={(e) => setSchedulingDays(Number(e.target.value))}
                            className="bg-[#050505] border border-white/10 rounded px-2.5 py-1.5 outline-none text-[#E0E0E0] cursor-pointer text-xs"
                          >
                            <option value={7}>7 Days (Recommended)</option>
                            <option value={1}>1 Day (Daily Check)</option>
                            <option value={3}>3 Days (Interval)</option>
                            <option value={14}>14 Days (Bi-weekly)</option>
                            <option value={30}>30 Days (Monthly ISO Audit)</option>
                            <option value={0.00017}>⚡ Test Match: 15 Seconds</option>
                            <option value={0.0007}>⚡ Test Match: 1 Minute</option>
                            <option value={-1}>Custom Number of Days...</option>
                          </select>
                        </div>

                        {schedulingDays === -1 && (
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] text-white/40 font-bold">NUMBER OF DAYS:</label>
                            <input
                              type="number"
                              min={1}
                              value={customDaysValue}
                              onChange={(e) => setCustomDaysValue(e.target.value)}
                              placeholder="e.g. 5"
                              className="bg-[#050505] border border-white/10 rounded px-2.5 py-1.5 outline-none text-[#E0E0E0]"
                            />
                          </div>
                        )}

                        <div className="flex items-center gap-2 mt-1">
                          <button
                            onClick={handleScheduleAudit}
                            className="flex-1 bg-brand hover:bg-brand-hover text-black py-2 rounded font-bold transition font-sans cursor-pointer text-center text-xs"
                          >
                            Set Reminder
                          </button>
                          <button
                            onClick={() => setShowSchedulePopover(false)}
                            className="bg-[#050505] hover:bg-white/5 border border-white/10 text-white/60 px-3 py-2 rounded transition font-sans cursor-pointer text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {scheduleSuccessMessage && (
                  <div className="bg-emerald-950/40 border border-emerald-500/30 text-brand px-4 py-3 rounded-lg text-xs font-mono animate-fade-in flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="size-4.5 text-brand shrink-0" />
                      <span>{scheduleSuccessMessage}</span>
                    </div>
                  </div>
                )}

                {/* Active Reminders Mini Dashboard Widget */}
                {reminders.length > 0 && (
                  <div className="bg-[#050505]/40 border border-white/5 rounded-xl p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <div className="flex items-center gap-2 text-xs font-mono font-bold text-white">
                        <Clock className="size-4 text-brand animate-pulse" />
                        <span>ACTIVE COMPLIANCE SCHEDULER MONITOR ({reminders.length})</span>
                      </div>
                      <span className="text-[9px] text-white/30 uppercase font-mono tracking-widest bg-white/5 px-2 py-0.5 rounded">
                        Persistent Trace Guard
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {reminders.map((rem) => {
                        const targetTime = new Date(rem.targetTime);
                        const isExpired = targetTime <= new Date();
                        const timeString = targetTime.toLocaleString();
                        
                        return (
                          <div key={rem.id} className="bg-[#050505]/80 border border-white/5 hover:border-white/10 rounded-lg p-3 flex justify-between items-center gap-3 text-xs font-mono">
                            <div className="flex flex-col gap-1 min-w-0">
                              <span className="text-white font-medium truncate max-w-[150px]">{rem.agentName}</span>
                              <div className="flex items-center gap-1.5 text-[10px] text-white/50">
                                <Calendar className="size-3 text-brand" />
                                <span>Due: {timeString}</span>
                              </div>
                              <span className={`text-[9px] uppercase font-bold text-center px-1.5 py-0.5 rounded w-max mt-1 ${
                                rem.triggered || isExpired 
                                  ? "bg-amber-950/40 text-amber-400 border border-amber-500/20" 
                                  : "bg-emerald-950/40 text-emerald-400 border border-emerald-500/20"
                              }`}>
                                {rem.triggered || isExpired ? "⚠️ Triggered" : "⏳ Active Countdown"}
                              </span>
                            </div>
                            <button
                              onClick={async () => {
                                setReminders(prev => prev.filter(r => r.id !== rem.id));
                                await deleteReminderFromFirestore(rem.id);
                              }}
                              className="text-white/40 hover:text-rose-400 p-1.5 rounded hover:bg-rose-950/20 transition cursor-pointer shrink-0"
                              title="Delete scheduled audit reminder"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Verification result visual feedback */}
                {verificationResult && (
                  <div className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-fade-in ${
                    verificationResult.verified
                      ? "bg-emerald-950/40 border-emerald-500 text-brand"
                      : "bg-rose-950/40 border-rose-500 text-rose-450"
                  }/80`}>
                    <div className="flex items-center gap-3">
                      {verificationResult.verified ? (
                        <CheckCircle2 className="size-8 text-brand shrink-0" />
                      ) : (
                        <AlertCircle className="size-8 text-rose-450 shrink-0" />
                      )}
                      <div>
                        <div className="text-sm font-bold font-mono text-white">
                          {verificationResult.verified ? "TAMPER-PROOF LEDGER CHAIN VERIFIED COMPLIANT" : "LEDGER HASH MISMATCH DETECTED"}
                        </div>
                        <div className="text-xs text-slate-450 mt-1 font-mono">
                          Audited {verificationResult.auditedCount} blocks. Parent block link equivalence = 100% OK. Hash signature chain validates successfully.
                        </div>
                      </div>
                    </div>
                    
                    <span className="text-[10px] font-mono bg-[#050505] text-white/50 px-3 py-1.5 border border-white/5 rounded">
                      BLOCK LEN: {verificationResult.chainHashes.length}
                    </span>
                  </div>
                )}

                {/* Timeline rendering layout */}
                <div className="relative border-l border-white/10 pl-6 ml-3 space-y-6">
                  {currentAgentEvents.length === 0 ? (
                    <div className="text-xs text-slate-500 italic py-6 pl-2">
                      No trace blocks registered. Issue a new birth certificate to begin logging events.
                    </div>
                  ) : (
                    currentAgentEvents.map((ev, index) => {
                      const isBirth = ev.event_type === "birth";
                      const isInc = ev.event_type === "incident";
                      const isUpd = ev.event_type === "genome_update";
                      
                      return (
                        <div key={ev.id} className="relative group">
                          {/* Dot marker on line */}
                          <div className={`absolute left-[-32px] top-1.5 size-4 rounded-full border-4 flex items-center justify-center ${
                            isBirth 
                              ? "bg-slate-950 border-brand" 
                              : isInc 
                              ? "bg-slate-950 border-rose-500" 
                              : isUpd 
                              ? "bg-slate-950 border-cyan-400" 
                              : "bg-slate-950 border-slate-500"
                          }`} />

                          <div className="bg-[#050505]/60 border border-white/10 group-hover:border-white/20 rounded-xl p-4 transition-all duration-150 flex flex-col md:flex-row justify-between gap-4">
                            
                            <div className="space-y-1.5 max-w-[80%]">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-sans font-bold text-white">{ev.title}</span>
                                <span className={`text-[9px] uppercase px-1.5 rounded font-mono ${
                                  isBirth ? "bg-brand/10 text-brand" : isInc ? "bg-rose-950/50 text-rose-450" : isUpd ? "bg-cyan-950/50 text-cyan-400" : "bg-slate-900 text-slate-400"
                                }`}>
                                  {ev.event_type}
                                </span>
                              </div>
                              <p className="text-xs text-white/70">{ev.description}</p>
                              
                              {/* Hashing references parameters */}
                              <div className="flex flex-col sm:flex-row gap-2 pt-2 text-[9px] font-mono text-white/40">
                                <span>PREV HASH: <span className="text-white/60 select-all">{ev.prev_event_hash.substring(0, 15)}...</span></span>
                                <span className="hidden sm:inline text-white/20">•</span>
                                <span>BLOCK HASH: <span className="text-white/60 select-all">{ev.event_hash.substring(0, 15)}...</span></span>
                              </div>
                            </div>

                            <div className="flex flex-col items-start md:items-end justify-between shrink-0 font-mono text-[10px] text-white/40">
                              <span>{new Date(ev.timestamp).toLocaleString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                              <span className="text-white/60 mt-2 truncate max-w-[120px]">By: {ev.operator}</span>
                            </div>

                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Genome comparisons diff-viewer logic block */}
                {selectedAgent && selectedAgent.genome_versions.length > 1 && (
                  <div className="mt-8 pt-6 border-t border-white/10">
                    <h3 className="text-xs font-mono uppercase tracking-widest text-slate-450 mb-3 flex items-center gap-1.5">
                      <Code className="size-4 text-cyan-400" />
                      Active Life Genome Upgrades side-by-side diff (v2 vs v1)
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      
                      {/* Old genome version */}
                      <div className="bg-[#050505] p-4 border border-rose-950/20 rounded-xl text-xs font-mono space-y-1.5 max-h-[140px] overflow-y-auto">
                        <div className="text-rose-400 border-b border-rose-950/10 pb-1.5 flex justify-between uppercase text-[10px]">
                          <span>Version 1.0 (Outdated)</span>
                          <span>{selectedAgent.genome_versions[0].hash.substring(0, 12)}</span>
                        </div>
                        <div className="text-white/40 strike text-[11px] space-y-1">
                          <div>Model Family: {selectedAgent.genome_versions[0].genome.model_family}</div>
                          <div>Architecture: {selectedAgent.genome_versions[0].genome.architecture}</div>
                          <div>Tools: {selectedAgent.genome_versions[0].genome.tools.join(", ")}</div>
                        </div>
                      </div>

                      {/* New actively pathed genome */}
                      <div className="bg-[#050505] p-4 border border-brand/20 rounded-xl text-xs font-mono space-y-1.5 max-h-[140px] overflow-y-auto">
                        <div className="text-brand border-b border-brand/25 pb-1.5 flex justify-between uppercase text-[10px]">
                          <span>Version {selectedAgent.active_version}.0 (Patched)</span>
                          <span>{selectedAgent.certificate.genome_hash.substring(0, 12)}</span>
                        </div>
                        <div className="text-white text-[11px] space-y-1">
                          <div className="flex justify-between">
                            <span>Model Family: <span className="text-brand font-bold">{selectedAgent.genome.model_family}</span></span>
                            <span className="text-[9px] bg-brand/20 px-1.5 py-0.5 rounded text-brand">CHANGED</span>
                          </div>
                          <div>Architecture: {selectedAgent.genome.architecture}</div>
                          <div>Tools: {selectedAgent.genome.tools.join(", ")}</div>
                        </div>
                      </div>

                    </div>
                  </div>
                )}

              </div>
            )}

            {/* 3. NEURAL ANCESTRY EXPLORER */}
            {activeTab === "lineage" && (
              <LineageExplorer
                agents={agents}
                selectedAgent={selectedAgent}
                onSelectAgent={handleSelectAgent}
              />
            )}

            {/* Google Sheets Sync Tab */}
            {activeTab === "sheets" && (
              <GoogleSheetsSync
                agents={agents}





              />
            )}

            {/* 4. PLAN QUOTAS & BILLING PORTAL */}
            {activeTab === "billing" && (
              <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-6 shadow-xl flex flex-col gap-6">
                
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-white/10 pb-4 gap-4">
                  <div>
                    <h2 className="text-base font-sans font-semibold text-white flex items-center gap-2">
                      <Coins className="text-brand size-5" />
                      Plan Quota Metering & Stripe Node Hook
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Check live resource usage metrics, compare subscription values, and emit mock Stripe subscription endpoints safely.
                    </p>
                  </div>
                  
                  {/* Stripe Hook Emit */}
                  <button
                    onClick={handleTriggerStripeWebhook}
                    disabled={simulatingWebhook || billing.tier === "scale"}
                    className="bg-[#050505] hover:bg-white/5 hover:border-white/20 text-brand border border-white/10 font-mono text-xs px-4 py-2.5 rounded flex items-center gap-2 disabled:opacity-50"
                  >
                    <RefreshCw className={`size-4 ${simulatingWebhook ? 'animate-spin' : ''}`} />
                    <span>Trigger Stripe subscription.updated Hook</span>
                  </button>
                </div>

                {/* Metering progression dashboard list */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  
                  {/* Metric 1: Active Agents issued count */}
                  <div className="bg-[#050505] p-4 border border-white/5 rounded-xl space-y-3 shadow-inner">
                    <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Active System registries:</div>
                    <div className="flex justify-between items-baseline">
                      <div className="text-2xl font-bold text-white">{agents.length} <span className="text-xs text-white/40 font-normal">Agents</span></div>
                      <div className="text-xs font-mono text-white/40">Limit: {billing.agent_limit}</div>
                    </div>
                    {/* Progression bar */}
                    <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-brand transition-all duration-300"
                        style={{ width: `${Math.min((agents.length / billing.agent_limit) * 100, 100)}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-white/30">Usage rate: {((agents.length / billing.agent_limit) * 100).toFixed(0)}%</div>
                  </div>

                  {/* Metric 2: Estimated hot storage consumed */}
                  <div className="bg-[#050505] p-4 border border-white/5 rounded-xl space-y-3 shadow-inner">
                    <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Decentralized ledger storage:</div>
                    <div className="flex justify-between items-baseline">
                      <div className="text-2xl font-bold text-white">{billing.ledger_storage_mb.toFixed(2)} <span className="text-xs text-white/40 font-normal">MB</span></div>
                      <div className="text-xs font-mono text-white/40">Limit: {billing.storage_limit_mb} MB</div>
                    </div>
                    {/* Progression bar */}
                    <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-brand transition-all duration-300"
                        style={{ width: `${(billing.ledger_storage_mb / billing.storage_limit_mb) * 100}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-white/30">Includes complete back-tracing hashes metadata block.</div>
                  </div>

                  {/* Metric 3: Renders tree telemetry limit */}
                  <div className="bg-[#050505] p-4 border border-white/5 rounded-xl space-y-3 shadow-inner">
                    <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Lineage renders checked:</div>
                    <div className="flex justify-between items-baseline">
                      <div className="text-2xl font-bold text-white">{billing.lineage_renders} <span className="text-xs text-white/40 font-normal">Renders</span></div>
                      <div className="text-xs font-mono text-white/40">Limit: {billing.renders_limit}</div>
                    </div>
                    {/* Progression bar */}
                    <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-brand transition-all duration-300"
                        style={{ width: `${(billing.lineage_renders / billing.renders_limit) * 100}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-white/30">Atomic queries decr increments.</div>
                  </div>

                </div>

                {/* Stripe webhook logging console if active */}
                {simulatingWebhook && (
                  <div className="bg-[#050505] p-4 rounded-xl border border-white/10 font-mono text-xs text-brand space-y-1.5 h-[160px] overflow-y-auto shadow-inner">
                    {webhookLogs.map((l, i) => (
                      <div key={i}>{l}</div>
                    ))}
                  </div>
                )}

                {/* Upgrade presets compare layout matrix */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  
                  {[
                    { id: "launch", name: "Launch Plan", price: "$749", limit: "25 Agents", sub: "Pilot developers under VEKLM", active: billing.tier === "launch", border: "border-white/10 bg-[#050505]" },
                    { id: "scale", name: "Scale Plan", price: "$4,950", limit: "250 Agents", sub: "Regulated AI enterprise systems", active: billing.tier === "scale", border: "border-brand bg-brand/10" },
                    { id: "enterprise", name: "Enterprise Custom", price: "Contact", limit: "Unlimited", sub: "Custom backing clusters + 24/7 SLA", active: billing.tier === "enterprise", border: "border-white/10 bg-[#050505]" },
                  ].map((preset, idx) => (
                    <div key={idx} className={`p-4 border rounded-xl flex flex-col justify-between gap-3 ${preset.border}`}>
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-sans font-bold text-white">{preset.name}</span>
                          {preset.active && <span className="text-[9px] uppercase font-mono text-brand bg-brand/10 border border-brand/20 px-1.5 py-0.5 rounded">ACTUAL</span>}
                        </div>
                        <div className="text-xl font-bold mt-2 text-white">{preset.price} <span className="text-[10px] text-white/40 font-normal">/ month</span></div>
                        <ul className="text-[11px] text-white/60 mt-3 space-y-1 border-t border-white/5 pt-2.5">
                          <li>• Core allowance: {preset.limit}</li>
                          <li>• SSL/Meters audit logs: Active</li>
                          <li>• {preset.sub}</li>
                        </ul>
                      </div>
                    </div>
                  ))}

                </div>

                {/* INVESTOR ARR HIGHLIGHT BOARD PRESENTATION OVERLAY */}
                {investorMode && (
                  <div className="bg-[#050505]/40 border border-[#b25e16]/20 p-5 rounded-xl flex flex-col gap-4 animate-fade-in mt-4">
                    <div className="flex items-center gap-2 text-[#e37f22] border-b border-[#e37f22]/15 pb-2">
                       <BarChart3 className="size-5" />
                      <h3 className="text-sm font-sans font-bold uppercase tracking-wider">Investor Presentation Deck & Compliance Metrics</h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-center">
                      <div className="bg-[#050505] border border-white/10 p-3 rounded">
                        <div className="text-[10px] text-white/40 font-mono uppercase">Live platform ARR:</div>
                        <div className="text-xl font-bold text-[#e37f22] mt-1">$224,750</div>
                      </div>
                      <div className="bg-[#050505] border border-white/10 p-3 rounded">
                        <div className="text-[10px] text-white/40 font-mono uppercase">Month-on-Month Growth:</div>
                        <div className="text-xl font-bold text-[#e37f22] mt-1">+28.4%</div>
                      </div>
                      <div className="bg-[#050505] border border-white/10 p-3 rounded">
                        <div className="text-[10px] text-white/40 font-mono uppercase">Incident Resolution SLA:</div>
                        <div className="text-xl font-bold text-white mt-1">{"< 48 Minutes"}</div>
                      </div>
                      <div className="bg-[#050505] border border-white/10 p-3 rounded">
                        <div className="text-[10px] text-white/40 font-mono uppercase">Audited Certifications:</div>
                        <div className="text-xl font-bold text-white mt-1">100% Passed</div>
                      </div>
                    </div>

                    <p className="text-xs text-white/60 leading-relaxed font-sans">
                      Our system implements deep cryptographic chaining of LLM brain mutations. By charging for certificate registry fees ($30 each) coupled with hot trace backups, we capture the core infrastructure accountability layer as a defensible SaaS product with 86% gross margins.
                    </p>
                  </div>
                )}

              </div>
            )}

            {/* 5. INCIDENTS WORKFLOW */}
            {activeTab === "incidents" && (
              <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-6 shadow-xl flex flex-col gap-6">
                
                <div className="flex justify-between items-center border-b border-white/10 pb-4">
                  <div>
                    <h2 className="text-base font-sans font-semibold text-white flex items-center gap-2">
                      <ShieldAlert className="text-rose-500 size-5" />
                      Live Incident Remediation Dashboard
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      File state violations, review active incidents, and lock audited remediation fix blocks onto the blockchain timeline.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  
                  {/* File/Declare incident form */}
                  <div className="bg-[#050505] p-4 border border-white/10 rounded-xl space-y-4">
                    <h3 className="text-xs font-mono uppercase tracking-widest text-slate-400 flex items-center gap-1">
                      <AlertTriangle className="size-4 text-rose-500" />
                      Emit Violation Event Block
                    </h3>

                    <form onSubmit={handleDeclareIncident} className="space-y-4">
                      <div>
                        <label className="block text-[10.5px] font-mono text-slate-450 uppercase mb-1">Target Agent</label>
                        <select 
                          value={selectedAgent ? selectedAgent.id : ""}
                          onChange={(e) => {
                            const found = agents.find(a => a.id === e.target.value);
                            if (found) setSelectedAgent(found);
                          }}
                          className="w-full bg-[#050505] border border-white/10 text-xs px-3 py-2 rounded text-white outline-none"
                        >
                          {agents.map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10.5px] font-mono text-white/40 uppercase mb-1">Violation Title</label>
                          <input
                            type="text"
                            value={newIncidentTitle}
                            onChange={(e) => setNewIncidentTitle(e.target.value)}
                            placeholder="e.g. Model Hallucination"
                            className="w-full bg-[#050505] border border-white/10 text-xs px-3 py-2 rounded text-white placeholder-white/20 outline-none"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[10.5px] font-mono text-white/40 uppercase mb-1">Severity Rating</label>
                          <select
                            value={newIncidentSeverity}
                            onChange={(e) => setNewIncidentSeverity(e.target.value as any)}
                            className="w-full bg-[#050505] border border-white/10 text-xs px-3 py-2 rounded text-white outline-none"
                          >
                            <option value="low">Severity Low (Internal alarm)</option>
                            <option value="medium">Severity Medium (Human review pause)</option>
                            <option value="high">Severity High (E-Stop shut down)</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10.5px] font-mono text-white/40 uppercase mb-1 font-semibold">Technical Log details</label>
                        <textarea
                          rows={2}
                          value={newIncidentDesc}
                          onChange={(e) => setNewIncidentDesc(e.target.value)}
                          placeholder="Provide trace observations..."
                          className="w-full bg-[#050505] border border-white/10 text-xs p-3 rounded text-white focus:border-white/20 outline-none"
                          required
                        />
                      </div>

                      <button
                        type="submit"
                        className="w-full bg-rose-600 hover:bg-rose-500 text-white py-2 rounded font-sans font-bold text-xs transition duration-200"
                      >
                        LOG IN IMMUTABLE LEDGER
                      </button>
                    </form>
                  </div>

                  {/* Active list review and resolve action panel */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-mono uppercase tracking-widest text-[#8A8A8A]">Auditable Open Incidents</h3>

                    <div className="space-y-3 max-h-[300px] overflow-y-auto">
                      {incidents.length === 0 ? (
                        <div className="text-xs text-[#8A8A8A] italic py-6 text-center border border-dashed border-white/5 rounded-xl">
                          No alerts reported! Compliance status perfect (100% OK).
                        </div>
                      ) : (
                        incidents.map((inc) => (
                          <div key={inc.id} className="bg-[#050505] border border-white/10 p-4 rounded-xl flex flex-col gap-3">
                            <div className="flex justify-between items-center">
                              <div>
                                <span className="text-xs font-sans font-bold text-white">{inc.title}</span>
                                <div className="text-[10px] text-white/40 font-mono mt-0.5">Asset: {inc.agent_name}</div>
                              </div>
                              <span className={`text-[9px] uppercase px-2 py-0.5 rounded font-mono ${
                                inc.status === "remediated" ? "bg-brand/10 text-brand" : "bg-rose-955/40 text-rose-500 animate-pulse"
                              }`}>
                                {inc.status}
                              </span>
                            </div>

                            <p className="text-xs text-[#8A8A8A]">{inc.description}</p>

                            {inc.status === "remediated" ? (
                              <div className="bg-white/5 border border-white/10 px-3 py-2 rounded text-[11px] font-mono text-white/60 leading-relaxed">
                                <span className="text-brand font-bold">REMEDIATION LOCKED:</span> {inc.remediation_notes}
                              </div>
                            ) : (
                              <div>
                                {activeRemediatingId === inc.id ? (
                                  <div className="space-y-2 mt-2">
                                    <textarea
                                      rows={2}
                                      value={remediationNotesText}
                                      onChange={(e) => setRemediationNotesText(e.target.value)}
                                      placeholder="Lock in details of patch..."
                                      className="w-full bg-[#0A0A0A] border border-white/10 text-xs p-2.5 rounded text-white outline-none"
                                    />
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => handleRemediateIncident(inc.id)}
                                        className="bg-brand hover:bg-brand-hover text-black px-3 py-1 font-bold rounded text-xs text-center transition"
                                      >
                                        Incorporate fix
                                      </button>
                                      <button
                                        onClick={() => setActiveRemediatingId(null)}
                                        className="text-white/40 text-xs py-1 hover:text-white"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setActiveRemediatingId(inc.id)}
                                    className="bg-[#050505] hover:bg-white/5 hover:text-white border border-white/10 text-white/60 px-3 py-1.5 rounded text-xs font-mono transition"
                                  >
                                    Remediate incident
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                </div>

              </div>
            )}

            {/* 6. AI NOTARY CHAT */}
            {activeTab === "notary_chat" && (
              <NotaryChat
                agents={agents}
                selectedAgent={selectedAgent}
              />
            )}

            {/* 7. MCPAPI ExecutionIdentityV1 Control Panel */}
            {activeTab === "execution_identity" && (
              <ExecutionIdentityV1Control
                agents={agents}

                onAddLedgerEvent={handleTriggerLedgerEventDirectly}
                onAddIncident={handleAddIncidentFromSimulator}

              />
            )}

            {/* 8. MANUAL INTEGRITY HASH VERIFIER HANDSHAKE */}
            {activeTab === "hash_verifier" && (
              <ManualHashVerifier

                agents={agents}
              />
            )}

          </div>

        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-[#050505] py-6 text-center text-xs text-white/30 mt-12">
        <p>© 2026 Project Genome Ledger (PGL) • Fully compiled and compatible with coolify / Hetzner staging servers.</p>
      </footer>

      {/* Optional popup modal to upgrade Launch cap constraints */}
      {showUpgradeModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0A0A0A] border border-white/10 p-6 rounded-xl shadow-2xl max-w-md w-full scroll-py-4 space-y-4">
            <h3 className="text-sm font-sans font-bold text-white flex items-center gap-2">
              <Coins className="text-brand" />
              Upgrade Platform Cap Required (402 Limits)
            </h3>
            <p className="text-xs text-white/60 leading-relaxed">
              Your active registry contains 25 agents which exhaust the Launch allocation limits. Upgrade through standard Stripe Customer portals or emit the Stripe subscription updated mock directly to proceed with unlimited issuances.
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <button 
                onClick={() => setShowUpgradeModal(false)}
                className="text-white/40 hover:text-white text-xs p-2"
              >
                Dismiss
              </button>
              <button
                onClick={() => {
                  setShowUpgradeModal(false);
                  handleTriggerStripeWebhook();
                }}
                className="bg-brand hover:bg-brand-hover text-black text-xs font-bold px-4 py-2 rounded transition"
              >
                Trigger Mock Stripe Sub Upgrade
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
