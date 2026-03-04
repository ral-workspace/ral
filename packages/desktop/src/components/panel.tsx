import { cn } from "@helm/ui";
import { useState } from "react";
import { IconX, IconArrowsMaximize } from "@tabler/icons-react";
import { Terminal } from "./terminal";
import { useLayoutStore, useWorkspaceStore } from "../stores";

interface PanelProps {
  className?: string;
}

const panelTabs = [
  { id: "problems", label: "Problems" },
  { id: "output", label: "Output" },
  { id: "debug-console", label: "Debug Console" },
  { id: "terminal", label: "Terminal" },
] as const;

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
          <Terminal cwd={projectPath ?? undefined} />
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
