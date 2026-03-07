import { cn } from "@helm/ui";
import { useState, useSyncExternalStore } from "react";
import { IconX, IconArrowsMaximize, IconPlus } from "@tabler/icons-react";
import { Terminal } from "./terminal";
import { useLayoutStore, useWorkspaceStore } from "../stores";
import { useSettingsStore } from "../stores";
import { terminalService } from "../services/terminal-service";

interface PanelProps {
  className?: string;
}

const panelTabs = [
  { id: "problems", label: "Problems" },
  { id: "output", label: "Output" },
  { id: "debug-console", label: "Debug Console" },
  { id: "terminal", label: "Terminal" },
] as const;

function TerminalTabs({ cwd }: { cwd?: string }) {
  const settings = useSettingsStore((s) => s.settings);

  const terminalIds = useSyncExternalStore(
    (cb) => terminalService.subscribe(cb),
    () => terminalService.getTerminalIds(),
  );

  const activeId = useSyncExternalStore(
    (cb) => terminalService.subscribe(cb),
    () => terminalService.getActiveTerminalId(),
  );

  return (
    <div className="flex h-full flex-col">
      {/* Terminal instance tabs */}
      <div className="flex h-8 items-center gap-0.5 border-b px-1">
        {terminalIds.map((id, index) => (
          <div
            key={id}
            className={cn(
              "group flex items-center gap-1 rounded px-2 py-0.5 text-[11px] cursor-pointer select-none",
              activeId === id
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => terminalService.setActiveTerminalId(id)}
            onMouseDown={(e) => {
              // Middle click to kill
              if (e.button === 1) {
                e.preventDefault();
                terminalService.killTerminal(id);
              }
            }}
          >
            <span>Terminal {index + 1}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                terminalService.killTerminal(id);
              }}
              className="flex h-4 w-4 items-center justify-center rounded opacity-0 transition-opacity hover:bg-foreground/10 group-hover:opacity-100"
            >
              <IconX className="size-3" />
            </button>
          </div>
        ))}
        <button
          title="New Terminal"
          onClick={() => terminalService.createTerminal(cwd, settings)}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
        >
          <IconPlus className="size-3.5" />
        </button>
      </div>

      {/* Terminal content */}
      <div className="flex-1 overflow-hidden">
        <Terminal cwd={cwd} />
      </div>
    </div>
  );
}

export function TerminalPanel({ className }: PanelProps) {
  const setShowBottomPanel = useLayoutStore((s) => s.setShowBottomPanel);
  const projectPath = useWorkspaceStore((s) => s.projectPath);
  const [activeTab, setActiveTab] = useState("terminal");

  return (
    <div className={cn("flex h-full flex-col bg-background", className)}>
      {/* Header */}
      <div className="flex h-9 items-center border-b px-2">
        {/* Tabs */}
        <div className="flex items-center gap-0.5">
          {panelTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] transition-colors",
                activeTab === tab.id
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Action buttons */}
        <div className="flex items-center gap-0.5">
          <button
            title="Maximize Panel"
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
          >
            <IconArrowsMaximize className="size-3.5" />
          </button>
          <button
            title="Close Panel"
            onClick={() => setShowBottomPanel(false)}
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
          >
            <IconX className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "terminal" ? (
          <TerminalTabs cwd={projectPath ?? undefined} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="text-xs text-muted-foreground">
              {panelTabs.find((t) => t.id === activeTab)?.label} — not yet implemented
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export { AiChat as AiPanel } from "./chat";
