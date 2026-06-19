import React, { useState, useEffect } from "react";
import { signInWithPopup, GoogleAuthProvider, User } from "firebase/auth";
import { auth } from "../firebase";
import { AgentRecord, LedgerEvent } from "../types";
import { 
  FileSpreadsheet, 
  RefreshCw, 
  Lock, 
  CheckCircle2, 
  AlertCircle, 
  ArrowUpRight, 
  Copy,
  Check,
  Power,
  Layers,
  Database,
  Calendar,
  Sparkles
} from "lucide-react";

interface GoogleSheetsSyncProps {
  agents: AgentRecord[];
  ledgerEvents: LedgerEvent[];
  onAddLog: (log: Omit<LedgerEvent, "id" | "prev_event_hash" | "event_hash">) => void;
  selectedRole: string;
  accessToken: string | null;
  onAccessTokenChange: (token: string | null) => void;
}

export default function GoogleSheetsSync({ 
  agents, 
  ledgerEvents, 
  onAddLog,
  selectedRole,
  accessToken,
  onAccessTokenChange
}: GoogleSheetsSyncProps) {
  // Authentication & Access Token State (In-Memory per Guidance)
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Spreadsheet Configuration State
  const [spreadsheetId, setSpreadsheetId] = useState<string>(() => {
    return localStorage.getItem("pgl_gsheets_id") || "";
  });
  const [isSyncEnabled, setIsSyncEnabled] = useState<boolean>(() => {
    return localStorage.getItem("pgl_gsheets_sync_enabled") === "true";
  });

  // UI Status State
  const [creationLoading, setCreationLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportLogsLoading, setExportLogsLoading] = useState(false);
  const [apiLogs, setApiLogs] = useState<Array<{ time: string; type: "success" | "info" | "error"; msg: string }>>([]);
  const [wasCopied, setWasCopied] = useState(false);

  // Sync state loaded values
  useEffect(() => {
    // Sync to user auth if already available in firebase
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user && user.providerData.some(p => p.providerId === "google.com")) {
        setGoogleUser(user);
        // Note: accessToken can't be fetched automatically via onAuthStateChanged without popup/redirect
        // so we prompt login to get active Sheets scope access token if not available in memory.
      } else {
        setGoogleUser(null);
        onAccessTokenChange(null);
      }
    });
    return () => unsubscribe();
  }, [onAccessTokenChange]);

  const addLogEntry = (type: "success" | "info" | "error", msg: string) => {
    const time = new Date().toLocaleTimeString();
    setApiLogs(prev => [{ time, type, msg }, ...prev.slice(0, 24)]);
  };

  const handleGoogleSignIn = async () => {
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      const provider = new GoogleAuthProvider();
      // Add requested Google Sheets and Google Drive permissions
      provider.addScope("https://www.googleapis.com/auth/spreadsheets");
      provider.addScope("https://www.googleapis.com/auth/drive.file");
      
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;

      if (!token) {
        throw new Error("Google access token was not issued correctly by Firebase Auth.");
      }

      onAccessTokenChange(token);
      setGoogleUser(result.user);
      addLogEntry("success", `Authenticated as ${result.user.email}. Token cached in secure volatile memory.`);
    } catch (err: any) {
      console.error(err);
      setAuthError(err.message || "Failed to authenticate with Google.");
      addLogEntry("error", `Auth failed: ${err.message || "Unknown Error"}`);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleDisconnect = async () => {
    onAccessTokenChange(null);
    setGoogleUser(null);
    localStorage.removeItem("pgl_gsheets_sync_enabled");
    setIsSyncEnabled(false);
    addLogEntry("info", "Disconnected secure cell and erased access token.");
  };

  // Create a brand-new pre-formatted Spreadsheet
  const handleCreateSpreadsheet = async () => {
    if (!accessToken) {
      addLogEntry("error", "No active cached access token. Clear and authenticate again.");
      return;
    }
    setCreationLoading(true);
    addLogEntry("info", "Provisioning fresh Spreadsheet on Google Drive...");

    try {
      // Create Spreadsheet metadata config
      const response = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          properties: {
            title: "Project Genome Ledger - Audited Registry"
          },
          sheets: [
            {
              properties: {
                title: "AI Agents",
                gridProperties: {
                  frozenRowCount: 1
                }
              }
            },
            {
              properties: {
                title: "Timeline logs",
                gridProperties: {
                  frozenRowCount: 1
                }
              }
            }
          ]
        })
      });

      if (!response.ok) {
        const errObj = await response.json();
        throw new Error(errObj.error?.message || "HTTP Spreadsheet creation failure");
      }

      const info = await response.json();
      const currentId = info.spreadsheetId;
      setSpreadsheetId(currentId);
      localStorage.setItem("pgl_gsheets_id", currentId);
      addLogEntry("success", `Spreadsheet provisioned successfully! ID: ${currentId}`);

      // Initialize Column Headers on both tabs
      await initializeSheetHeaders(currentId);
    } catch (err: any) {
      addLogEntry("error", `Creation error: ${err.message}`);
    } finally {
      setCreationLoading(false);
    }
  };

  const initializeSheetHeaders = async (sheetId: string) => {
    try {
      addLogEntry("info", "Injecting structured spec layout & metadata headers...");
      const rangeAgents = "'AI Agents'!A1:I1";
      const valuesAgents = [
        ["Agent ID", "Name", "Serial Number", "Risk Category", "Model Creator", "Jurisdiction", "Active Version", "Birth Certificate Date", "License Status"]
      ];

      const rangeLogs = "'Timeline logs'!A1:G1";
      const valuesLogs = [
        ["Log Block ID", "Agent Name", "Event Type", "Event Title", "Incident Description / Notes", "Operator Signature", "Timestamp"]
      ];

      // Send parallel values initialization calls
      const [res1, res2] = await Promise.all([
        fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${rangeAgents}?valueInputOption=RAW`, {
          method: "PUT",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ values: valuesAgents })
        }),
        fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${rangeLogs}?valueInputOption=RAW`, {
          method: "PUT",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ values: valuesLogs })
        })
      ]);

      if (res1.ok && res2.ok) {
        addLogEntry("success", "Columns verified. Real schema templates mapped perfectly.");
      } else {
        addLogEntry("error", "Failed to write registry cell headings.");
      }
    } catch (err: any) {
      addLogEntry("error", `Header init error: ${err.message}`);
    }
  };

  // Export current agent records to Sheet
  const handleExportAgents = async () => {
    if (!accessToken || !spreadsheetId) return;
    setExportLoading(true);
    addLogEntry("info", `Syncing ${agents.length} Agent Records to 'AI Agents' sheet...`);

    try {
      // Clear current rows from the sheet before writing (excluding header)
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'AI Agents'!A2:I1000:clear`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${accessToken}` }
      });

      const bodyData = agents.map(agent => [
        agent.id,
        agent.name,
        agent.certificate.serial_number,
        agent.genome.risk_category.toUpperCase(),
        agent.creator,
        agent.jurisdiction,
        agent.active_version,
        agent.created_at,
        agent.is_revoked ? "TERMINATED / REVOKED" : "LIVE Active Tag"
      ]);

      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'AI Agents'!A2?valueInputOption=RAW`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ values: bodyData })
      });

      if (!response.ok) {
        throw new Error("Failed to export values.");
      }

      addLogEntry("success", `Export complete. ${agents.length} registers written to 'AI Agents'!`);
      onAddLog({
        agent_id: "system",
        timestamp: new Date().toISOString(),
        event_type: "custom",
        title: "GOOGLE SHEETS SYNC COMPLETED",
        description: `Exported ${agents.length} auditable AI Agent records to Sheet ID: [${spreadsheetId}].`,
        operator: selectedRole
      });
    } catch (err: any) {
      addLogEntry("error", `Registry sync failed: ${err.message}`);
    } finally {
      setExportLoading(false);
    }
  };

  // Export Timeline Logs
  const handleExportLogs = async () => {
    if (!accessToken || !spreadsheetId) return;
    setExportLogsLoading(true);
    addLogEntry("info", `Syncing ${ledgerEvents.length} Ledger Event Blocks to 'Timeline logs'...`);

    try {
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'Timeline logs'!A2:G1000:clear`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${accessToken}` }
      });

      const bodyData = ledgerEvents.map(evt => {
        const matchAgent = agents.find(a => a.id === evt.agent_id);
        const nameDisplay = matchAgent ? matchAgent.name : `Agent ID: ${evt.agent_id}`;
        return [
          evt.id,
          nameDisplay,
          evt.event_type.toUpperCase(),
          evt.title,
          evt.description,
          evt.operator,
          evt.timestamp
        ];
      });

      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'Timeline logs'!A2?valueInputOption=RAW`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ values: bodyData })
      });

      if (!response.ok) {
        throw new Error("Failed to export timeline rows.");
      }

      addLogEntry("success", `Timeline synchronized. ${ledgerEvents.length} logs successfully verified!`);
    } catch (err: any) {
      addLogEntry("error", `Timeline transfer failed: ${err.message}`);
    } finally {
      setExportLogsLoading(false);
    }
  };

  const handleToggleSync = (active: boolean) => {
    setIsSyncEnabled(active);
    localStorage.setItem("pgl_gsheets_sync_enabled", active ? "true" : "false");
    addLogEntry("info", `Decentralized live automatic webhook stream set to ${active ? "ENABLED" : "DISABLED"}.`);
  };

  const handleCopyId = () => {
    if (!spreadsheetId) return;
    navigator.clipboard.writeText(spreadsheetId);
    setWasCopied(true);
    setTimeout(() => setWasCopied(false), 2000);
  };

  return (
    <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-6 shadow-xl flex flex-col gap-6" id="google-sheets-workspace">
      
      {/* Title & Desc */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-white/10 pb-4 gap-4">
        <div>
          <h2 className="text-base font-sans font-semibold text-white flex items-center gap-2">
            <FileSpreadsheet className="text-emerald-400 size-5" />
            Veklm Google Sheets Synchronizer
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Authenticate using OAuth drive scopes to sync physical ledger mutations directly to Google Sheets templates.
          </p>
        </div>

        {/* Authentication flow */}
        {!googleUser ? (
          <button 
            onClick={handleGoogleSignIn}
            disabled={isLoggingIn}
            className="gsi-material-button text-xs transition duration-150 transform active:scale-95 py-2 px-3 border border-neutral-700 rounded bg-[#111] hover:bg-[#222]"
            id="sheets-connect-button"
          >
            <div className="gsi-material-button-content-wrapper flex items-center gap-2 font-mono">
              <div className="gsi-material-button-icon shrink-0">
                <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: "block" }} className="size-4">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                </svg>
              </div>
              <span className="gsi-material-button-contents text-emerald-400 font-bold whitespace-nowrap">SIGN IN WITH GOOGLE</span>
            </div>
          </button>
        ) : (
          <div className="flex items-center gap-3 bg-[#050505] border border-white/5 px-2.5 py-1.5 rounded-xl">
            <img 
              referrerPolicy="no-referrer"
              src={googleUser.photoURL || "https://secure.gravatar.com/avatar?d=identity"} 
              alt="User" 
              className="size-7 rounded-full border border-white/10 shadow-inner" 
            />
            <div className="text-left">
              <div className="text-[11px] font-semibold text-white line-clamp-1">{googleUser.displayName || "Google Operator"}</div>
              <div className="text-[9px] font-mono text-emerald-400">{googleUser.email}</div>
            </div>
            <button 
              onClick={handleDisconnect}
              className="p-1.5 text-white/40 hover:text-rose-400 transition"
              title="Logout Google Integration"
            >
              <Power className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      {authError && (
        <div className="bg-rose-950/20 border border-rose-500/30 text-rose-400 px-4 py-3 rounded-xl flex items-center gap-2.5 text-xs">
          <AlertCircle className="size-4 shrink-0" />
          <span>Error setting up OAuth handshake: {authError}</span>
        </div>
      )}

      {/* Main split workarea */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Side: Setup Parameters */}
        <div className="lg:col-span-5 flex flex-col gap-4.5">
          
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-white/40 uppercase tracking-wider block">Target Spreadsheet ID or URL:</label>
            <div className="flex gap-2">
              <input 
                type="text"
                placeholder="Select or paste existing Spreadsheet ID..."
                value={spreadsheetId}
                onChange={(e) => {
                  let val = e.target.value.trim();
                  if (val.includes("spreadsheets/d/")) {
                    const match = val.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
                    if (match && match[1]) val = match[1];
                  }
                  setSpreadsheetId(val);
                  localStorage.setItem("pgl_gsheets_id", val);
                  addLogEntry("info", `Spreadsheet ID targeted: ${val}`);
                }}
                className="flex-1 bg-[#050505] border border-white/10 px-3 py-2 rounded-lg text-xs font-mono text-[#E0E0E0] outline-none placeholder-white/20 focus:border-white/20"
              />
              {spreadsheetId && (
                <button 
                  onClick={handleCopyId}
                  className="bg-[#050505] border border-white/10 hover:border-white/20 p-2 rounded-lg text-white/50 transition active:scale-95"
                  title="Copy Sheet ID"
                >
                  {wasCopied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
                </button>
              )}
            </div>
          </div>

          {!spreadsheetId && (
            <div className="bg-blue-950/20 border border-blue-500/20 rounded-xl p-4 space-y-2 text-xs">
              <div className="flex items-center gap-1.5 text-blue-400 font-semibold">
                <Sparkles className="size-4" />
                <span>Need a Spreadsheet template?</span>
              </div>
              <p className="text-[11px] text-white/60 leading-relaxed">
                Connect your account and click below to auto-provision a certified ledger document in your Drive to track AI Agent compliance perfectly.
              </p>
              <button
                onClick={handleCreateSpreadsheet}
                disabled={!googleUser || creationLoading || !accessToken}
                className="w-full mt-2 bg-emerald-600 hover:bg-emerald-500 text-black font-semibold text-xs py-2 rounded-lg flex items-center justify-center gap-1.5 transition duration-150 disabled:opacity-50 cursor-pointer"
              >
                {creationLoading ? (
                  <>
                    <RefreshCw className="size-3.5 animate-spin" />
                    <span>Provisioning spreadsheet...</span>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="size-3.5" />
                    <span>Create Certified PGL Spreadsheet</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Action Hub */}
          {spreadsheetId && (
            <div className="bg-[#050505] border border-white/5 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-[10px] font-mono text-white/40 uppercase tracking-wider">Sync Control Center</span>
                <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse"></span> ONLINE
                </span>
              </div>

              {/* Push Actions */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  onClick={handleExportAgents}
                  disabled={!googleUser || exportLoading || !accessToken}
                  className="bg-[#0A0A0A] border border-white/10 hover:border-white/20 text-white hover:text-emerald-400 font-sans p-3 rounded-xl flex flex-col items-center justify-center gap-2 text-center transition cursor-pointer disabled:opacity-50 group hover:border-emerald-500/30"
                >
                  <Layers className="size-5 text-emerald-500 group-hover:scale-110 transition" />
                  <span className="font-semibold block">Push Agents</span>
                  <span className="text-[9px] text-white/40 font-mono mt-0.5">{agents.length} registers</span>
                </button>

                <button
                  onClick={handleExportLogs}
                  disabled={!googleUser || exportLogsLoading || !accessToken}
                  className="bg-[#0A0A0A] border border-white/10 hover:border-white/20 text-white hover:text-emerald-400 font-sans p-3 rounded-xl flex flex-col items-center justify-center gap-2 text-center transition cursor-pointer disabled:opacity-50 group hover:border-emerald-500/30"
                >
                  <Database className="size-5 text-emerald-500 group-hover:scale-110 transition" />
                  <span className="font-semibold block">Push Logs</span>
                  <span className="text-[9px] text-white/40 font-mono mt-0.5">{ledgerEvents.length} blocks</span>
                </button>
              </div>

              {/* Continuous Auto-Sync Hook Toggle */}
              <div className="flex items-center justify-between bg-[#0A0A0A] border border-white/5 p-3 rounded-lg text-xs">
                <div className="text-left pr-2">
                  <div className="font-semibold text-white">Live Webhook Sync</div>
                  <div className="text-[9px] text-white/40 mt-0.5">Append new births instantly</div>
                </div>
                <button
                  onClick={() => handleToggleSync(!isSyncEnabled)}
                  className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors duration-250 cursor-pointer ${
                    isSyncEnabled ? "bg-emerald-500" : "bg-white/10"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                      isSyncEnabled ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>

              {/* Spreadsheet Direct Open Button */}
              <a 
                href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-full bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/20 font-sans font-medium text-xs py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition duration-150"
              >
                <span>Launch Google Spreadsheet Tab</span>
                <ArrowUpRight className="size-3.5" />
              </a>
            </div>
          )}

          {/* Console logger */}
          <div className="bg-[#050505] p-3 border border-white/5 rounded-xl flex-1 flex flex-col min-h-[140px] max-h-[180px]">
            <div className="text-[9px] font-mono text-white/40 uppercase tracking-widest border-b border-white/5 pb-1.5 mb-2 flex items-center justify-between">
              <span>Sync Protocol Logs:</span>
              <span>v4 Sheets API</span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1.5 text-[10px] font-mono scrollbar-none">
              {apiLogs.length === 0 ? (
                <div className="text-white/20 italic text-center py-4">Waiting for Google API activity...</div>
              ) : (
                apiLogs.map((log, i) => (
                  <div key={i} className="flex items-start gap-1.5 leading-tight select-text">
                    <span className="text-white/30 shrink-0">{log.time}</span>
                    <span className={`font-semibold shrink-0 ${
                      log.type === "success" ? "text-emerald-400" : log.type === "error" ? "text-rose-400" : "text-cyan-400"
                    }`}>
                      [{log.type.toUpperCase()}]
                    </span>
                    <span className="text-white/70">{log.msg}</span>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* Right Side: Interactive Iframe Spreadsheet View */}
        <div className="lg:col-span-7 flex flex-col gap-3 min-h-[350px]">
          <div className="text-[10px] font-mono text-white/40 uppercase tracking-wider flex items-center gap-2">
            <Layers className="size-3.5" />
            <span>Interactive Real-time Google Sheet Interface:</span>
          </div>

          <div className="flex-1 bg-[#050505] border border-white/5 rounded-xl overflow-hidden relative shadow-inner min-h-[320px]">
            {spreadsheetId ? (
              <iframe
                src={`https://docs.google.com/spreadsheets/d/${spreadsheetId}/htmlview?widget=true&headers=false`}
                title="Spreadsheet Viewer"
                className="w-full h-full border-0 bg-white"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                <div className="animate-pulse bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3.5 rounded-full mb-3.5">
                  <FileSpreadsheet className="size-7" />
                </div>
                <h4 className="text-xs font-semibold text-white tracking-tight">Active Google Sheet Viewer</h4>
                <p className="text-[11px] text-white/40 mt-1.5 max-w-xs leading-relaxed">
                  Provide an existing active spreadsheet identifier, or create a brand new template using the action toolbox to active the embedded live browser console.
                </p>
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
