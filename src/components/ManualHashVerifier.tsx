import React, { useState, useEffect } from "react";
import { 
  ShieldCheck, 
  ShieldAlert, 
  Database, 
  Copy, 
  Check, 
  AlertTriangle, 
  FileText, 
  Activity, 
  ArrowRight, 
  Fingerprint, 
  Binary, 
  Lock, 
  ExternalLink,
  History,
  Code,
  Clock,
  Trash2
} from "lucide-react";
import { LedgerEvent, AgentRecord } from "../types";
import { computeEventHash } from "../data";

interface VerificationAttempt {
  id: string;
  timestamp: string;
  blockId: string;
  passed: boolean;
  computedHash: string;
  expectedHash: string;
}

interface ManualHashVerifierProps {
  ledgerEvents: LedgerEvent[];
  agents: AgentRecord[];
}

export default function ManualHashVerifier({ ledgerEvents, agents }: ManualHashVerifierProps) {
  // Select timeline events to quickly populate
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  
  // Event inputs
  const [eventId, setEventId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [timestamp, setTimestamp] = useState("");
  const [eventType, setEventType] = useState<LedgerEvent["event_type"]>("custom");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [operator, setOperator] = useState("");
  const [prevEventHash, setPrevEventHash] = useState("");
  
  // Custom expected hash inputs
  const [expectedHash, setExpectedHash] = useState("");
  
  // JSON view & error state
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Copied alerts
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Local device history of last 5 verification attempts
  const [attempts, setAttempts] = useState<VerificationAttempt[]>(() => {
    try {
      const stored = localStorage.getItem("pgl_manual_verification_attempts");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const triggerCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Log a manual verification attempt on this device
  const handleLogAttempt = (passedCheck: boolean, currentComputed: string, currentExpected: string) => {
    const newAttempt: VerificationAttempt = {
      id: "attempt-" + Date.now().toString(36),
      timestamp: new Date().toLocaleString(),
      blockId: eventId || "independent-snap",
      passed: passedCheck,
      computedHash: currentComputed,
      expectedHash: currentExpected || "No expected signature entered"
    };
    const updated = [newAttempt, ...attempts].slice(0, 5);
    setAttempts(updated);
    localStorage.setItem("pgl_manual_verification_attempts", JSON.stringify(updated));
  };

  const handleClearAttempts = () => {
    setAttempts([]);
    localStorage.removeItem("pgl_manual_verification_attempts");
  };

  // Re-sync JSON when individual fields change
  const syncFieldsToJson = (fields: {
    id: string;
    agent_id: string;
    timestamp: string;
    event_type: LedgerEvent["event_type"];
    title: string;
    description: string;
    operator: string;
    prev_event_hash: string;
  }) => {
    try {
      const payload = {
        id: fields.id,
        agent_id: fields.agent_id,
        timestamp: fields.timestamp,
        event_type: fields.event_type,
        title: fields.title,
        description: fields.description,
        operator: fields.operator,
        prev_event_hash: fields.prev_event_hash,
      };
      setJsonText(JSON.stringify(payload, null, 2));
      setJsonError(null);
    } catch (e) {
      // Ignore serialization failures
    }
  };

  // Handle individual field updates
  const handleFieldChange = (key: string, value: any) => {
    const updated = {
      id: key === "id" ? value : eventId,
      agent_id: key === "agent_id" ? value : agentId,
      timestamp: key === "timestamp" ? value : timestamp,
      event_type: key === "event_type" ? value : eventType,
      title: key === "title" ? value : title,
      description: key === "description" ? value : description,
      operator: key === "operator" ? value : operator,
      prev_event_hash: key === "prev_event_hash" ? value : prevEventHash,
    };

    if (key === "id") setEventId(value);
    if (key === "agent_id") setAgentId(value);
    if (key === "timestamp") setTimestamp(value);
    if (key === "event_type") setEventType(value);
    if (key === "title") setTitle(value);
    if (key === "description") setDescription(value);
    if (key === "operator") setOperator(value);
    if (key === "prev_event_hash") setPrevEventHash(value);

    syncFieldsToJson(updated);
  };

  // Populate from existing timeline event dropdown selection
  const handleSelectTimelineEvent = (id: string) => {
    setSelectedEventId(id);
    const evt = ledgerEvents.find(e => e.id === id);
    if (evt) {
      setEventId(evt.id);
      setAgentId(evt.agent_id);
      setTimestamp(evt.timestamp);
      setEventType(evt.event_type);
      setTitle(evt.title);
      setDescription(evt.description);
      setOperator(evt.operator);
      setPrevEventHash(evt.prev_event_hash);
      setExpectedHash(evt.event_hash);
      
      const payload = {
        id: evt.id,
        agent_id: evt.agent_id,
        timestamp: evt.timestamp,
        event_type: evt.event_type,
        title: evt.title,
        description: evt.description,
        operator: evt.operator,
        prev_event_hash: evt.prev_event_hash,
      };
      setJsonText(JSON.stringify(payload, null, 2));
      setJsonError(null);
    }
  };

  // Handle manual JSON paste in the textarea
  const handleJsonChange = (val: string) => {
    setJsonText(val);
    if (!val.trim()) {
      setJsonError(null);
      return;
    }
    try {
      const parsed = JSON.parse(val);
      setJsonError(null);

      // Extract values with safe fallbacks
      if (typeof parsed.id !== "undefined") setEventId(String(parsed.id));
      if (typeof parsed.agent_id !== "undefined") setAgentId(String(parsed.agent_id));
      if (typeof parsed.timestamp !== "undefined") setTimestamp(String(parsed.timestamp));
      if (typeof parsed.event_type !== "undefined") setEventType(parsed.event_type);
      if (typeof parsed.title !== "undefined") setTitle(String(parsed.title));
      if (typeof parsed.description !== "undefined") setDescription(String(parsed.description));
      if (typeof parsed.operator !== "undefined") setOperator(String(parsed.operator));
      if (typeof parsed.prev_event_hash !== "undefined") setPrevEventHash(String(parsed.prev_event_hash));
      
      // Auto-extract signature if present in JSON
      if (parsed.event_hash) {
        setExpectedHash(parsed.event_hash);
      }
    } catch (err: any) {
      setJsonError(`JSON Syntax Error: ${err.message}`);
    }
  };

  // Seed default dummy data on mount
  useEffect(() => {
    if (ledgerEvents.length > 0 && !eventId) {
      // Pick the first event in the system as a starter
      handleSelectTimelineEvent(ledgerEvents[0].id);
    } else if (!eventId) {
      // Absolute fallback template
      const fallback = {
        id: "evt-manual-101",
        agent_id: "agent-alpha-001",
        timestamp: new Date().toISOString(),
        event_type: "custom" as const,
        title: "Manual Diagnostic Ledger Frame",
        description: "Standard parameters verification snapshot injected manually.",
        operator: "operator@veklom.com",
        prev_event_hash: "00000000000000000000000000000000"
      };
      setEventId(fallback.id);
      setAgentId(fallback.agent_id);
      setTimestamp(fallback.timestamp);
      setEventType(fallback.event_type);
      setTitle(fallback.title);
      setDescription(fallback.description);
      setOperator(fallback.operator);
      setPrevEventHash(fallback.prev_event_hash);
      setJsonText(JSON.stringify(fallback, null, 2));
    }
  }, [ledgerEvents]);

  // Construct current event representation for hashing
  const currentEventPayload = {
    id: eventId,
    agent_id: agentId,
    timestamp: timestamp,
    event_type: eventType,
    title: title,
    description: description,
    operator: operator,
    prev_event_hash: prevEventHash
  };

  // Recompute live hash
  const computedHash = computeEventHash(currentEventPayload);

  // Formatted data string for transparency
  const formattedDataString = `${eventId}|${agentId}|${timestamp}|${eventType}|${title}|${description}|${operator}|${prevEventHash}`;

  // Evaluate integrity matches
  const hasExpectedHash = expectedHash.trim().length > 0;
  const isHashMatching = hasExpectedHash && (computedHash.toLowerCase().trim() === expectedHash.toLowerCase().trim());

  // Deep blockchain state check for current ID
  const matchedChainBlock = ledgerEvents.find(e => e.id === eventId);
  const isIdRegisteredInChain = !!matchedChainBlock;
  const doesComputedHashMatchChainRecord = isIdRegisteredInChain && (computedHash === matchedChainBlock?.event_hash);

  // Trace the parent link in current global timeline
  const precedingBlock = prevEventHash ? ledgerEvents.find(e => e.event_hash === prevEventHash) : null;
  const isParentTracked = !!precedingBlock;

  return (
    <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-6 shadow-xl flex flex-col gap-6">
      
      {/* Upper header */}
      <div className="border-b border-white/10 pb-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-base font-sans font-semibold text-white flex items-center gap-2">
              <Fingerprint className="text-brand size-5" />
              Decentralized Hash Integrity Verifier
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Verify serialized ledger blocks, parse raw JSON events, and audit trace integrity without requiring active agent selection.
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <label className="text-[10px] uppercase font-mono tracking-wider text-white/40">Load From Chain:</label>
            <select
              value={selectedEventId}
              onChange={(e) => handleSelectTimelineEvent(e.target.value)}
              className="bg-[#050505] border border-white/15 rounded px-2.5 py-1 text-xs font-mono text-white/90 focus:border-brand outline-none cursor-pointer max-w-[200px] sm:max-w-[280px]"
            >
              <option value="">-- Manual Sandbox Template --</option>
              {ledgerEvents.map(e => {
                const associatedAgent = agents.find(a => a.id === e.agent_id);
                const agentName = associatedAgent ? associatedAgent.name.split(" ")[0] : "System";
                return (
                  <option key={e.id} value={e.id} className="bg-slate-950 font-mono">
                    [{e.id.substring(0, 10)}] {e.title.substring(0, 30)}... ({agentName})
                  </option>
                );
              })}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        
        {/* Left Form: Payload Editing Form */}
        <div className="xl:col-span-7 flex flex-col gap-5">
          
          {/* Quick toggle choice panels */}
          <div className="bg-white/5 border border-white/5 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="text-[11px] font-mono text-white/40 uppercase tracking-widest flex items-center gap-1.5 font-bold">
                <Code className="size-3.5 text-brand" />
                Raw JSON Input Controller
              </span>
              <button
                onClick={() => {
                  const sample = {
                    id: "evt-custom-" + Date.now().toString(36),
                    agent_id: "agent-alpha-001",
                    timestamp: new Date().toISOString(),
                    event_type: "custom" as const,
                    title: "Authorized Chain Verification Snap",
                    description: "TAMPER TEST: Tweak any character here to witness computed hash recalculation in real-time.",
                    operator: "auditor@veklom.com",
                    prev_event_hash: "00000000000000000000000000000000"
                  };
                  handleJsonChange(JSON.stringify(sample, null, 2));
                  setSelectedEventId("");
                  setExpectedHash("hash_99999999x9v2");
                }}
                className="text-[10px] font-mono text-brand hover:underline cursor-pointer"
              >
                Incorporate New Custom Block Template
              </button>
            </div>
            
            <textarea
              value={jsonText}
              onChange={(e) => handleJsonChange(e.target.value)}
              placeholder="Paste serialized block JSON string..."
              className="w-full h-44 bg-[#050505] border border-white/10 rounded-lg p-3 font-mono text-xs text-brand outline-none focus:border-brand/40 resize-none"
            />
            {jsonError ? (
              <p className="text-[10.5px] font-mono text-rose-500 bg-rose-955/20 border border-rose-500/20 px-2.5 py-1 rounded">
                ⚠️ {jsonError}
              </p>
            ) : (
              <p className="text-[10px] text-white/40 font-sans italic">
                You can directly edit the fields below, or paste a raw JSON string to auto-deserialize its parameters automatically.
              </p>
            )}
          </div>

          {/* Individual form fields */}
          <div className="bg-white/5 border border-white/5 rounded-xl p-5 flex flex-col gap-4">
            <h3 className="text-xs font-mono font-bold text-white/80 uppercase tracking-wider border-b border-white/5 pb-2 flex items-center gap-2">
              <Database className="size-3.5 text-brand" />
              Deserialized Block Parameter States
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10.5px] font-mono text-white/50 mb-1">
                  BLOCK RECORD ID (String):
                </label>
                <input
                  type="text"
                  value={eventId}
                  onChange={(e) => handleFieldChange("id", e.target.value)}
                  className="w-full bg-[#050505] border border-white/10 rounded px-3 py-1.5 text-xs font-mono text-white outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="block text-[10.5px] font-mono text-white/50 mb-1">
                  NEURAL AGENT ID (String):
                </label>
                <input
                  type="text"
                  value={agentId}
                  onChange={(e) => handleFieldChange("agent_id", e.target.value)}
                  className="w-full bg-[#050505] border border-white/10 rounded px-3 py-1.5 text-xs font-mono text-white outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="block text-[10.5px] font-mono text-white/50 mb-1">
                  TIMESTAMP (ISO String):
                </label>
                <input
                  type="text"
                  value={timestamp}
                  onChange={(e) => handleFieldChange("timestamp", e.target.value)}
                  className="w-full bg-[#050505] border border-white/10 rounded px-3 py-1.5 text-xs font-mono text-white outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="block text-[10.5px] font-mono text-white/50 mb-1">
                  EVENT CLASS CATEGORY:
                </label>
                <select
                  value={eventType}
                  onChange={(e) => handleFieldChange("event_type", e.target.value)}
                  className="w-full bg-[#050505] border border-white/10 rounded px-3 py-1.5 text-xs font-mono text-white outline-none focus:border-brand cursor-pointer"
                >
                  <option value="birth">birth</option>
                  <option value="deployment">deployment</option>
                  <option value="audit">audit</option>
                  <option value="incident">incident</option>
                  <option value="custom">custom</option>
                  <option value="genome_update">genome_update</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-[10.5px] font-mono text-white/50 mb-1">
                  LOG TITLE/HEADER:
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => handleFieldChange("title", e.target.value)}
                  className="w-full bg-[#050505] border border-white/10 rounded px-3 py-1.5 text-xs font-sans text-white outline-none focus:border-brand"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[10.5px] font-mono text-white/50 mb-1">
                  LOG PARAMETERS / TRANSCRIPTION DESCRIPTION:
                </label>
                <textarea
                  value={description}
                  onChange={(e) => handleFieldChange("description", e.target.value)}
                  className="w-full h-18 bg-[#050505] border border-white/10 rounded px-3 py-1.5 text-xs font-sans text-white outline-none focus:border-brand resize-none"
                />
              </div>

              <div>
                <label className="block text-[10.5px] font-mono text-white/50 mb-1">
                  AUTHORIZED OPERATOR SIGNATURE:
                </label>
                <input
                  type="text"
                  value={operator}
                  onChange={(e) => handleFieldChange("operator", e.target.value)}
                  className="w-full bg-[#050505] border border-white/10 rounded px-3 py-1.5 text-xs font-mono text-white outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="block text-[10.5px] font-mono text-white/50 mb-1">
                  ANCESTOR BLOCK HASH (`prev_event_hash`):
                </label>
                <input
                  type="text"
                  value={prevEventHash}
                  onChange={(e) => handleFieldChange("prev_event_hash", e.target.value)}
                  className="w-full bg-[#050505] border border-white/10 rounded px-3 py-1.5 text-xs font-mono text-brand outline-none focus:border-brand"
                />
              </div>
            </div>

          </div>

        </div>

        {/* Right Form: Digest Calculation & Traversal */}
        <div className="xl:col-span-5 flex flex-col gap-6">
          
          {/* Paste Past Signature Input */}
          <div className="bg-white/5 border border-white/5 rounded-xl p-5 flex flex-col gap-3">
            <h3 className="text-xs font-mono font-bold text-white/80 uppercase tracking-wider flex items-center gap-1.5">
              <Lock className="text-brand size-3.5" />
              Expectation Baseline Signature
            </h3>
            <p className="text-[11px] text-white/50">
              Paste the cryptographic signature hash you want to verify standard content parameters against.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Paste signature hash here (e.g. hash_f80db72cx9v2)..."
                value={expectedHash}
                onChange={(e) => setExpectedHash(e.target.value)}
                className="flex-1 bg-[#050505] border border-white/10 rounded px-3 py-1.5 text-xs font-mono text-brand outline-none focus:border-brand"
              />
              {expectedHash && (
                <button
                  onClick={() => setExpectedHash("")}
                  className="bg-white/5 hover:bg-white/10 border border-white/15 px-2.5 rounded text-[10px] text-white/60 font-mono transition"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Cryptographic Digest Display */}
          <div className="bg-[#050505] border border-white/10 rounded-xl p-5 flex flex-col gap-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-2 opacity-5">
              <Binary className="size-20" />
            </div>

            <h3 className="text-xs font-mono font-bold text-white flex items-center gap-2">
              <Activity className="text-brand size-4" />
              Live Digest Recalculator Console
            </h3>

            {/* Simulated String Concatenation Pattern Block */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest block font-semibold">
                Concat Hashing Payload Buffer:
              </span>
              <div className="bg-[#0A0A0A] border border-white/5 rounded p-3 font-mono text-[10.5px] text-zinc-400 select-all overflow-x-auto whitespace-pre">
                {formattedDataString}
              </div>
            </div>

            {/* Displaying computed hash state */}
            <div className="bg-[#0A0A0A] border border-white/5 rounded-lg p-4 flex flex-col gap-2.5">
              <div className="flex justify-between items-center text-[10px] font-mono text-white/50">
                <span>DIGEST ALGORITHM STATUS: ACTIVE (Int32 Math)</span>
                <button
                  onClick={() => triggerCopy(computedHash, "computed_hash")}
                  className="text-brand hover:underline flex items-center gap-1 cursor-pointer"
                >
                  {copiedField === "computed_hash" ? (
                    <Check className="size-3 text-emerald-400" />
                  ) : (
                    <Copy className="size-3" />
                  )}
                  <span>{copiedField === "computed_hash" ? "Copied!" : "Copy Hash"}</span>
                </button>
              </div>

              <div>
                <span className="text-[10px] font-mono text-white/40 block">Computed Cryptographic Hash:</span>
                <span className="text-lg font-mono font-bold text-emerald-400 tracking-tight block select-all">
                  {computedHash}
                </span>
              </div>
            </div>

            {/* Parity Status Readout indicator */}
            <div className="flex flex-col gap-2.5">
              {!hasExpectedHash ? (
                <div className="bg-amber-955/10 border border-amber-500/20 text-amber-500 p-3 rounded-lg flex items-start gap-2.5">
                  <AlertTriangle className="size-4.5 shrink-0 mt-0.5" />
                  <div className="text-[11px] font-sans">
                    <p className="font-semibold uppercase tracking-wider text-[10.5px]">Awaiting Benchmark Hash Signature</p>
                    <p className="text-white/60 mt-0.5">Paste a hash in the expectations input box to perform mathematical equivalence checking.</p>
                  </div>
                </div>
              ) : isHashMatching ? (
                <div className="bg-emerald-955/20 border border-emerald-500/30 text-emerald-400 p-3 rounded-lg flex items-start gap-2.5">
                  <ShieldCheck className="size-4.5 shrink-0 mt-0.5" />
                  <div className="text-[11px] font-sans">
                    <p className="font-semibold uppercase tracking-wider text-[10.5px]">Parity Validation Succeeded</p>
                    <p className="text-white/60 mt-0.5">Great success! Raw parameters string maps cleanly to past baseline. Absolutely no data tampering detected.</p>
                  </div>
                </div>
              ) : (
                <div className="bg-rose-955/20 border border-rose-500/30 text-rose-400 p-3 rounded-lg flex items-start gap-2.5">
                  <ShieldAlert className="size-4.5 shrink-0 mt-0.5 animate-bounce" />
                  <div className="text-[11px] font-sans">
                    <p className="font-semibold uppercase tracking-wider text-[10.5px] text-rose-500">Validation Parity Mismatch</p>
                    <p className="text-white/60 mt-0.5">Warning: The computed hash differs from the benchmark signature! This confirms at least one field value has been altered or tampered with.</p>
                  </div>
                </div>
              )}

              <button
                onClick={() => handleLogAttempt(isHashMatching, computedHash, expectedHash)}
                className="w-full bg-brand hover:bg-brand/90 text-black py-1.5 rounded text-[11px] font-mono font-bold tracking-tight text-center transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <ShieldCheck className="size-3.5" />
                <span>Log Current Audit Check to Device</span>
              </button>
            </div>

          </div>

          {/* Decentralized Blockchain Trace Assessment */}
          <div className="bg-[#050505] border border-white/10 rounded-xl p-5 flex flex-col gap-4">
            <h3 className="text-xs font-mono font-bold text-white flex items-center gap-2">
              <History className="text-brand size-4" />
              Global Chain Auditing Traversal Trace
            </h3>

            <div className="space-y-4">
              {/* Check 1: Live Registry Identity */}
              <div className="flex items-start gap-3 border-b border-white/5 pb-3">
                <div className={`p-1.5 rounded-full ${isIdRegisteredInChain ? "bg-emerald-500/10 text-emerald-400" : "bg-white/5 text-white/40"}`}>
                  <Database className="size-3.5" />
                </div>
                <div>
                  <div className="text-[11px] font-mono font-semibold text-white">
                    {isIdRegisteredInChain ? "Block Found in Live Chain State" : "Independent off-chain Block Snapshot"}
                  </div>
                  <div className="text-[10.5px] text-white/50 mt-0.5">
                    {isIdRegisteredInChain ? (
                      <span>
                        Block ID <span className="font-mono text-brand font-bold">{eventId}</span> matches an existing ledger record originally logged for agent <span className="text-white font-semibold flex-wrap">"{agents.find(a => a.id === matchedChainBlock?.agent_id)?.name || matchedChainBlock?.agent_id}"</span>.
                      </span>
                    ) : (
                      "This Block record ID is not stored within the localized Firestore chain. It is currently acting as a detached memory frame."
                    )}
                  </div>
                </div>
              </div>

              {/* Check 2: Canonical Ledger Hash Parity */}
              {isIdRegisteredInChain && (
                <div className="flex items-start gap-3 border-b border-white/5 pb-3">
                  <div className={`p-1.5 rounded-full ${doesComputedHashMatchChainRecord ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
                    <ShieldCheck className="size-3.5" />
                  </div>
                  <div>
                    <div className="text-[11px] font-mono font-semibold text-white">
                      {doesComputedHashMatchChainRecord ? "Matches Canonical Ledger Block" : "Tampered Block Mismatch Warning"}
                    </div>
                    <div className="text-[10.5px] text-white/50 mt-0.5 select-all">
                      {doesComputedHashMatchChainRecord ? (
                        "The block parameters perfectly match the canonical ledger state. Full validation of data integrity."
                      ) : (
                        <span className="text-rose-400 leading-normal block">
                          Critical Alert: Storing ledger hash for this block ID is <span className="font-mono font-bold bg-[#140505] px-1.5 py-0.5 text-xs border border-rose-500/30 rounded inline-block mt-1">{matchedChainBlock?.event_hash}</span>, which does NOT match your custom parameters computed hash!
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Check 3: Lineage Linkages */}
              <div className="flex items-start gap-3">
                <div className={`p-1.5 rounded-full ${isParentTracked ? "bg-emerald-500/10 text-emerald-400" : "bg-white/5 text-white/40"}`}>
                  <ArrowRight className="size-3.5" />
                </div>
                <div>
                  <div className="text-[11px] font-mono font-semibold text-white">
                    {isParentTracked ? "Chain Sequence Lineage Traced" : "Lineage Predecessor Disconnected"}
                  </div>
                  <div className="text-[10.5px] text-white/50 mt-0.5">
                    {isParentTracked ? (
                      <span>
                        Valid link: predecessor block found with matching signature <span className="font-mono text-brand">{prevEventHash.substring(0, 12)}...</span>. It represents the historical event <span className="text-white font-semibold">"{precedingBlock?.title}"</span>.
                      </span>
                    ) : prevEventHash === "00000000000000000000000000000000" ? (
                      "Root Block: Initiates registry lineage trace branch (no predecessor block hash required)."
                    ) : (
                      "Warning: Handshake link is unresolvable. No preceding timeline block exists in active local state carrying this exact expected ancestor signature."
                    )}
                  </div>
                </div>
              </div>

            </div>

          </div>

          {/* Local Device Verification Audits History (Last 5) */}
          <div className="bg-[#050505] border border-white/10 rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <h3 className="text-xs font-mono font-bold text-white flex items-center gap-2">
                <Clock className="text-brand size-4" />
                Latest Device Verification Runs
              </h3>
              {attempts.length > 0 && (
                <button
                  onClick={handleClearAttempts}
                  className="text-[10px] font-mono text-rose-500 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="size-3" />
                  <span>Clear Local History</span>
                </button>
              )}
            </div>

            {attempts.length === 0 ? (
              <div className="text-center py-6 text-white/30 text-xs font-sans">
                <Clock className="size-8 mx-auto text-white/10 mb-2" />
                No local check audits recorded yet on this device.<br/>
                Modify parameters and click "Log Current Audit Check" above.
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {attempts.map((att) => (
                  <div 
                    key={att.id} 
                    className="bg-[#0A0A0A] border border-white/5 rounded p-3 text-xs font-mono flex flex-col gap-1.5 hover:border-white/10 transition"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-white/40">
                        {att.timestamp}
                      </span>
                      {att.passed ? (
                        <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-950/30 px-1.5 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
                          <ShieldCheck className="size-3 animate-[pulse_3s_infinite]" /> PASS
                        </span>
                      ) : (
                        <span className="text-[9px] font-mono font-bold text-rose-400 bg-rose-950/30 px-1.5 py-0.5 rounded border border-rose-500/20 flex items-center gap-1">
                          <ShieldAlert className="size-3 animate-[pulse_3s_infinite]" /> FAIL
                        </span>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-x-2 text-[10.5px]">
                      <div>
                        <span className="text-white/30 block text-[9px] uppercase tracking-wider">BLOCK / TARGET ID:</span>
                        <span className="text-white/80 font-bold truncate max-w-[120px] block" title={att.blockId}>{att.blockId}</span>
                      </div>
                      <div>
                        <span className="text-white/30 block text-[9px] uppercase tracking-wider">COMPUTED SIGNATURE:</span>
                        <span className="text-brand truncate max-w-[120px] block" title={att.computedHash}>{att.computedHash}</span>
                      </div>
                    </div>

                    <div className="text-[9.5px] text-white/40 border-t border-white/5 pt-1 mt-0.5 truncate select-all">
                      <span className="font-semibold text-white/50">Expected:</span> {att.expectedHash}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
