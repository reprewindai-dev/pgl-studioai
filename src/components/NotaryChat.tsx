import React, { useState, useRef, useEffect } from "react";
import { ChatMessage, AgentRecord } from "../types";
import { ShieldAlert, Send, Sparkles, User, Database, Terminal, FileCheck, CheckCircle2, AlertCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface NotaryChatProps {
  agents: AgentRecord[];
  selectedAgent: AgentRecord | null;
}

export default function NotaryChat({ agents, selectedAgent }: NotaryChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "init-msg",
      role: "assistant",
      content: "Greetings. I am the **Notary Custodian AI** of Project Genome Ledger.\n\nI monitor and audit all active agent genome births, lifecycle events, and compliance signatures on this platform.\n\nAsk me about regulatory guidelines (EU AI Act, NIST AI RMF), audit specific agent parameters, or generate a security assessment instantly.",
      timestamp: new Date().toISOString()
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState("gemini-2.5-flash");
  const threadEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom whenever messages list grows
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (textToSend?: string) => {
    const promptText = (textToSend || input).trim();
    if (!promptText) return;

    if (!textToSend) setInput("");

    const userMessage: ChatMessage = {
      id: "msg-" + Date.now(),
      role: "user",
      content: promptText,
      timestamp: new Date().toISOString()
    };

    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({ role: m.role, content: m.content })),
          model: selectedModel,
          systemInstruction: `You are the ultimate 'Notary Custodian AI' of Project Genome Ledger, a specialized, high-integrity auditor for registered AI systems.
Your primary role is to enforce, audit, and explain AI compliance, alignment, safety rules, risk categorization, and cryptographic provenance checks under standard acts (such as the EU AI Act and NIST AI RMF).
Maintain a professional, authoritative, objective, and polite developer-compliance tone.
If the user references an active agent from the context, leverage this registered metadata in your audits:
Registered Agents List:
${JSON.stringify(agents.map(a => ({ id: a.id, name: a.name, risk: a.genome.risk_category, tools: a.genome.tools, safety_rules: a.genome.safety_rules })), null, 2)}
Currently Selected Active Agent Context:
${selectedAgent ? JSON.stringify(selectedAgent, null, 2) : "None selected yet."}
`
        })
      });

      if (!response.ok) {
        throw new Error("Failed to communicate with notary endpoint");
      }

      const data = await response.json();
      
      const assistantMessage: ChatMessage = {
        id: "msg-ast-" + Date.now(),
        role: "assistant",
        content: data.text || "I apologize, I received an invalid audit packet. Please try again.",
        timestamp: new Date().toISOString()
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (e: any) {
      const errorMessage: ChatMessage = {
        id: "msg-err-" + Date.now(),
        role: "assistant",
        content: `⚠️ **Audit Communication Failure**: ${e.message || "Failed to reach server-side Gemini gateway. Make sure GEMINI_API_KEY is configured in your secrets."}`,
        timestamp: new Date().toISOString()
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const quickPrompts = [
    {
      title: "Audit Aegis-Alpha",
      prompt: "Review the safety compliance of Aegis-Alpha under EU AI Act provisions."
    },
    {
      title: "NIST Risk Framework",
      prompt: "Extract a checklist from NIST AI RMF applicable to Critical Risk outreach agents like Boreas-Beta."
    },
    {
      title: "Check System Integrity",
      prompt: "Draft an analytical security report explaining how hash-chained ledger events prevent agent tampering."
    }
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl flex flex-col h-[520px] relative overflow-hidden">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-800 pb-4 mb-4 gap-3">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500/10 border border-emerald-500/25 p-2 rounded-lg text-emerald-400">
            <Sparkles className="size-5 animate-pulse" />
          </div>
          <div>
            <h4 className="text-sm font-sans font-medium text-slate-100 flex items-center gap-2">
              Compliance Notary Guard Chatbot
            </h4>
            <p className="text-xs text-slate-400">
              Interactive audit consultant powered by Gemini intelligence
            </p>
          </div>
        </div>

        {/* Model Picker */}
        <div className="flex items-center gap-2 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-850 self-end sm:self-auto">
          <span className="text-[10px] text-slate-500 font-mono">BRAIN:</span>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="text-xs bg-transparent border-none text-emerald-400 font-mono outline-none cursor-pointer"
          >
            <option value="gemini-2.5-flash" className="bg-slate-900">Gemini 2.5 Flash</option>
            <option value="gemini-2.5-pro" className="bg-slate-900">Gemini 2.5 Pro (Thinking)</option>
          </select>
        </div>
      </div>

      {/* Message Area */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
        {messages.map((m) => {
          const isUser = m.role === "user";
          return (
            <div key={m.id} className={`flex gap-3 leading-6 ${isUser ? "justify-end" : "justify-start"}`}>
              {/* Icon */}
              {!isUser && (
                <div className="size-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-emerald-400 shrink-0">
                  <Terminal className="size-4" />
                </div>
              )}

              {/* Box */}
              <div
                className={`max-w-[85%] rounded-xl px-4 py-3 text-xs leading-relaxed ${
                  isUser
                    ? "bg-slate-800 text-slate-100 font-sans border border-slate-700 shadow-md"
                    : "bg-slate-950/60 text-slate-305 border border-slate-850 shadow-inner"
                }`}
              >
                <div className="markdown-body">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
                <div className="text-[9px] font-mono text-slate-500 mt-2 text-right">
                  {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </div>
              </div>

              {/* User Avatar */}
              {isUser && (
                <div className="size-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-slate-100 shrink-0">
                  <User className="size-4" />
                </div>
              )}
            </div>
          );
        })}

        {loading && (
          <div className="flex gap-3 justify-start">
            <div className="size-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-emerald-400 shrink-0 animate-spin">
              <Database className="size-4" />
            </div>
            <div className="bg-slate-950/60 rounded-xl px-4 py-3 text-xs text-slate-400 border border-slate-850 flex items-center gap-2">
              <div className="size-1.5 rounded-full bg-emerald-400 animate-bounce"></div>
              <div className="size-1.5 rounded-full bg-emerald-400 animate-bounce delay-100"></div>
              <div className="size-1.5 rounded-full bg-emerald-400 animate-bounce delay-200"></div>
              <span className="font-mono text-[10px] text-slate-500">ENGAGING NOTARY PROTOCOLS...</span>
            </div>
          </div>
        )}
        <div ref={threadEndRef} />
      </div>

      {/* Quick Prompts Panel */}
      {messages.length === 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4 mb-2">
          {quickPrompts.map((q, idx) => (
            <button
              key={idx}
              disabled={loading}
              onClick={() => handleSend(q.prompt)}
              className="text-left p-2.5 bg-slate-950/40 border border-slate-850 hover:border-slate-700 hover:bg-slate-900 rounded-lg text-[10.5px] text-slate-400 font-mono transition-all duration-200"
            >
              <div className="text-emerald-400 font-sans font-medium mb-1 truncate">{q.title}</div>
              <div className="text-slate-500 line-clamp-1">{q.prompt}</div>
            </button>
          ))}
        </div>
      )}

      {/* Input Box */}
      <div className="mt-4 flex gap-2 pt-2 border-t border-slate-800/60">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !loading && handleSend()}
          placeholder={selectedAgent ? `Ask notary about ${selectedAgent.name}...` : "Query compliance parameters..."}
          className="flex-1 bg-slate-950 text-xs text-slate-100 font-mono placeholder-slate-500 border border-slate-850 focus:border-slate-700 rounded-xl px-4 py-3 outline-none"
          disabled={loading}
        />
        <button
          onClick={() => handleSend()}
          disabled={loading}
          className="bg-emerald-600 hover:bg-emerald-500 text-slate-100 font-sans font-medium px-4 rounded-xl flex items-center justify-center gap-2 text-xs transition duration-200 disabled:opacity-50"
        >
          <Send className="size-4" />
          <span className="hidden sm:inline">Send</span>
        </button>
      </div>

    </div>
  );
}
