import React from "react";
import { AgentRecord } from "../types";
import { GitBranch, GitMerge, ShieldCheck, ArrowRight, Layers } from "lucide-react";

interface LineageExplorerProps {
  agents: AgentRecord[];
  selectedAgent: AgentRecord | null;
  onSelectAgent: (agent: AgentRecord) => void;
}

export default function LineageExplorer({
  agents,
  selectedAgent,
  onSelectAgent,
}: LineageExplorerProps) {
  // Simple layout model:
  // Level 0: Roots (parent_agent_ids is empty)
  // Level 1: First descendants (parent_agent_ids contains a level 0 ID)
  // Level 2: Second descendants (parent_agent_ids contains a level 1 ID)

  const roots = agents.filter((a) => a.parent_agent_ids.length === 0);
  const layer1 = agents.filter((a) => a.parent_agent_ids.some((pid) => roots.map((r) => r.id).includes(pid)));
  const layer2 = agents.filter((a) => a.parent_agent_ids.some((pid) => layer1.map((l) => l.id).includes(pid)));
  const others = agents.filter(
    (a) =>
      !roots.includes(a) &&
      !layer1.includes(a) &&
      !layer2.includes(a)
  );

  const riskColors = {
    low: { bg: "bg-emerald-950/40", border: "border-emerald-500/30", text: "text-emerald-400" },
    medium: { bg: "bg-cyan-950/40", border: "border-cyan-500/30", text: "text-cyan-400" },
    high: { bg: "bg-amber-950/40", border: "border-amber-500/30", text: "text-amber-400" },
    critical: { bg: "bg-rose-950/40", border: "border-rose-500/30", text: "text-rose-400" },
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl relative overflow-hidden">
      <div className="absolute top-0 right-0 p-3 bg-slate-800/20 text-[10px] font-mono text-slate-500 rounded-bl-lg">
        INTERACTIVE DAG ENGINE v2.1
      </div>

      <div className="flex flex-col gap-1 mb-6">
        <h3 className="text-lg font-sans font-medium text-slate-100 flex items-center gap-2">
          <GitBranch className="text-emerald-400 size-5" />
          Neural Gene Lineage & Ancestry Map
        </h3>
        <p className="text-xs text-slate-400">
          Visualize immutable parent-child genome chains. Click on any node to audit its specific security parameters and birth history.
        </p>
      </div>

      {/* SVG Connections Layer (Conceptual simulation of real flows) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative min-h-[340px]">
        
        {/* Layer 0 Column */}
        <div className="flex flex-col gap-6 justify-center">
          <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 border-b border-slate-800/60 pb-2 mb-2">
            Level 0 - Ancestral Roots
          </div>
          {roots.length === 0 ? (
            <div className="text-xs text-slate-500 italic p-4 border border-dashed border-slate-800 rounded-lg text-center">
              No primary roots registered
            </div>
          ) : (
            roots.map((agent) => {
              const isSelected = selectedAgent?.id === agent.id;
              const rProps = riskColors[agent.genome.risk_category] || riskColors.medium;
              return (
                <div
                  key={agent.id}
                  onClick={() => onSelectAgent(agent)}
                  className={`cursor-pointer transition-all duration-300 p-4 border rounded-xl flex flex-col gap-2 relative ${
                    isSelected
                      ? "bg-slate-800/80 border-emerald-500 shadow-lg shadow-emerald-500/5 ring-1 ring-emerald-500/20 scale-[1.02]"
                      : "bg-slate-950/60 border-slate-850 hover:border-slate-700 hover:bg-slate-900"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono font-semibold text-slate-200 truncate max-w-[150px]">
                      {agent.name.split(" ")[0]}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${rProps.bg} ${rProps.text} ${rProps.border} border`}>
                      {agent.genome.risk_category.toUpperCase()}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 truncate">{agent.creator}</span>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800/50">
                    <span className="font-mono">v{agent.active_version}.0</span>
                    <span className="text-emerald-400 font-mono text-[9px]">ROOT</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Layer 1 Column */}
        <div className="flex flex-col gap-6 justify-center">
          <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 border-b border-slate-800/60 pb-2 mb-2">
            Level 1 - Custom Variants (Forked)
          </div>
          {layer1.length === 0 ? (
            <div className="text-xs text-slate-500 italic p-4 border border-dashed border-slate-800 rounded-lg text-center">
              No second-tier lineages registered. Use "Fork Agent" to spawn child nodes.
            </div>
          ) : (
            layer1.map((agent) => {
              const isSelected = selectedAgent?.id === agent.id;
              const rProps = riskColors[agent.genome.risk_category] || riskColors.medium;
              return (
                <div
                  key={agent.id}
                  onClick={() => onSelectAgent(agent)}
                  className={`cursor-pointer transition-all duration-300 p-4 border rounded-xl flex flex-col gap-2 relative ${
                    isSelected
                      ? "bg-slate-800/80 border-emerald-500 shadow-lg shadow-emerald-500/5 ring-1 ring-emerald-500/20 scale-[1.02]"
                      : "bg-slate-950/60 border-slate-850 hover:border-slate-700 hover:bg-slate-900"
                  }`}
                >
                  {/* Left Connection Dot Indicator */}
                  <div className="absolute left-[-16px] top-1/2 -translate-y-1/2 hidden md:flex items-center">
                    <div className="w-4 h-[1px] bg-slate-700"></div>
                    <div className="size-1.5 rounded-full bg-emerald-400"></div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono font-semibold text-slate-200 truncate max-w-[150px]">
                      {agent.name.split(" ")[0]}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${rProps.bg} ${rProps.text} ${rProps.border} border`}>
                      {agent.genome.risk_category.toUpperCase()}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 truncate">{agent.creator}</span>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800/50">
                    <span className="font-mono">v{agent.active_version}.0</span>
                    <div className="flex items-center gap-1 text-cyan-400 font-mono text-[9px]">
                      <GitMerge className="size-2.5" /> FORKED
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Layer 2 Column */}
        <div className="flex flex-col gap-6 justify-center">
          <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 border-b border-slate-800/60 pb-2 mb-2">
            Level 2 - Specialized Clones (Grandchildren)
          </div>
          {layer2.length === 0 ? (
            <div className="text-xs text-slate-500 italic p-4 border border-dashed border-slate-800 rounded-lg text-center">
              No grandchildren cloned yet.
            </div>
          ) : (
            layer2.map((agent) => {
              const isSelected = selectedAgent?.id === agent.id;
              const rProps = riskColors[agent.genome.risk_category] || riskColors.medium;
              return (
                <div
                  key={agent.id}
                  onClick={() => onSelectAgent(agent)}
                  className={`cursor-pointer transition-all duration-300 p-4 border rounded-xl flex flex-col gap-2 relative ${
                    isSelected
                      ? "bg-slate-800/80 border-emerald-500 shadow-lg shadow-emerald-500/5 ring-1 ring-emerald-500/20 scale-[1.02]"
                      : "bg-slate-950/60 border-slate-850 hover:border-slate-700 hover:bg-slate-900"
                  }`}
                >
                  {/* Left Connection Indicator */}
                  <div className="absolute left-[-16px] top-1/2 -translate-y-1/2 hidden md:flex items-center">
                    <div className="w-4 h-[1px] bg-slate-700"></div>
                    <div className="size-1.5 rounded-full bg-cyan-400"></div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono font-semibold text-slate-200 truncate max-w-[150px]">
                      {agent.name.split(" ")[0]}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${rProps.bg} ${rProps.text} ${rProps.border} border`}>
                      {agent.genome.risk_category.toUpperCase()}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 truncate">{agent.creator}</span>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800/50">
                    <span className="font-mono">v{agent.active_version}.0</span>
                    <div className="flex items-center gap-1 text-purple-400 font-mono text-[9px]">
                      <GitMerge className="size-2.5" /> DESCENDANT
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>

      {/* Others (concept clones) */}
      {others.length > 0 && (
        <div className="mt-8 pt-4 border-t border-slate-800/60">
          <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-2">
            Isolated Variants / Custom Integrations
          </div>
          <div className="flex flex-wrap gap-4">
            {others.map((agent) => {
              const isSelected = selectedAgent?.id === agent.id;
              const rProps = riskColors[agent.genome.risk_category] || riskColors.medium;
              return (
                <div
                  key={agent.id}
                  onClick={() => onSelectAgent(agent)}
                  className={`cursor-pointer transition-all duration-300 p-3 min-w-[150px] border rounded-xl flex flex-col gap-1.5 relative ${
                    isSelected
                      ? "bg-slate-800/80 border-emerald-500 ring-1 ring-emerald-500/20"
                      : "bg-slate-950/40 border-slate-850 hover:bg-slate-900"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-mono font-medium text-slate-200 truncate max-w-[120px]">
                      {agent.name.split(" ")[0]}
                    </span>
                    <span className={`text-[8px] px-1 py-0.2 rounded font-mono ${rProps.bg} ${rProps.text}`}>
                      {agent.genome.risk_category.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[9px] text-slate-500 pt-1 border-t border-slate-800/40">
                    <span>v{agent.active_version}.0</span>
                    <span className="text-slate-400">Custom</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected Agent Quick Link Bar */}
      {selectedAgent && (
        <div className="mt-6 p-3 bg-slate-950/60 border border-slate-850 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <div className="size-2 rounded-full bg-emerald-400 animate-pulse"></div>
            <span className="text-slate-350">Currently selected descendant:</span>
            <span className="font-mono font-medium text-slate-100">{selectedAgent.name}</span>
          </div>
          
          <div className="flex items-center gap-1.5 text-slate-400 text-[10px]">
            <span className="font-mono bg-slate-900 border border-slate-800 px-2 py-1 rounded">
              DNA: {selectedAgent.certificate.genome_hash.substring(0, 12)}...
            </span>
            <span className="font-mono bg-slate-900 border border-slate-800 px-2 py-1 rounded">
              Parents: {selectedAgent.parent_agent_ids.length > 0 ? selectedAgent.parent_agent_ids.join(", ") : "None"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
