import { cn, ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@ral/ui";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { IconX, IconArrowsMaximize, IconPlus, IconLayoutColumns, IconChevronDown, IconTrash } from "@tabler/icons-react";
import { invoke } from "@tauri-apps/api/core";
import { Terminal } from "./terminal";
import { useLayoutStore, useWorkspaceStore } from "../stores";
import { useSettingsStore } from "../stores";
import { terminalService } from "../services/terminal-service";
import { showNativeContextMenu } from "../lib/native-context-menu";
import type { NativeMenuItem } from "../lib/native-context-menu";
import "@vscode/codicons/dist/codicon.css";

/** Map process name to codicon icon name */
function getTerminalIconClass(processName: string): string {
  switch (processName) {
    case "bash":
      return "codicon-terminal-bash";
    case "pwsh":
    case "powershell":
      return "codicon-terminal-powershell";
    case "tmux":
      return "codicon-terminal-tmux";
    case "cmd":
    case "cmd.exe":
      return "codicon-terminal-cmd";
    default:
      return "codicon-terminal";
  }
}

function TerminalIcon({ processName, className }: { processName: string; className?: string }) {
  return (
    <span className={cn("codicon shrink-0", getTerminalIconClass(processName), className)} />
  );
}

interface ShellProfile {
  name: string;
  path: string;
  is_default: boolean;
}

function useShellProfiles() {
  const [profiles, setProfiles] = useState<ShellProfile[]>([]);
  const fetched = useRef(false);
  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    invoke<ShellProfile[]>("list_shells")
      .then(setProfiles)
      .catch(() => {});
  }, []);
  return profiles;
}

interface PanelProps {
  className?: string;
}

const panelTabs = [
  { id: "problems", label: "Problems" },
  { id: "output", label: "Output" },
  { id: "debug-console", label: "Debug Console" },
  { id: "terminal", label: "Terminal" },
] as const;

function TerminalInstanceRow({
  instanceId,
  groupId,
  prefix,
  isActive,
  isSingleInstance,
  onSplit,
}: {
  instanceId: number;
  groupId: number;
  prefix: string;
  isActive: boolean;
  isSingleInstance: boolean;
  onSplit: () => void;
}) {
  const processName = useSyncExternalStore(
    (cb) => terminalService.subscribe(cb),
    () => terminalService.getProcessName(instanceId),
  );
  return (
    <div
      className={cn(
        "group relative flex h-6 cursor-pointer select-none items-center gap-1 px-2 text-xs",
        isActive
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
      )}
      onClick={() => {
        terminalService.setActiveGroupId(groupId);
        terminalService.setActiveInstanceInGroup(groupId, instanceId);
      }}
      onMouseDown={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          if (isSingleInstance) {
            terminalService.killTerminal(groupId);
          } else {
            terminalService.killInstance(instanceId);
          }
        }
      }}
    >
      {isActive && (
        <div className="absolute bottom-0 left-0 top-0 w-px bg-primary" />
      )}
      {prefix && <span className="shrink-0 text-muted-foreground">{prefix}</span>}
      <TerminalIcon processName={processName} className="text-[13px]" />
      <span className="flex-1 truncate">
        {processName}
      </span>
      <div className="flex shrink-0 items-center gap-px opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSplit();
          }}
          className="flex h-5 w-5 items-center justify-center rounded hover:bg-foreground/10"
          title="Split Terminal"
        >
          <IconLayoutColumns className="size-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (isSingleInstance) {
              terminalService.killTerminal(groupId);
            } else {
              terminalService.killInstance(instanceId);
            }
          }}
          className="flex h-5 w-5 items-center justify-center rounded hover:bg-foreground/10"
          title="Kill Terminal"
        >
          <IconX className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function TerminalGroupRows({
  groupId,
  activeGroupId,
  onSplit,
}: {
  groupId: number;
  activeGroupId: number | null;
  onSplit: (groupId: number) => void;
}) {
  const group = useSyncExternalStore(
    (cb) => terminalService.subscribe(cb),
    () => terminalService.getGroup(groupId),
  );
  if (!group) return null;

  const { instanceIds, activeInstanceId } = group;
  const count = instanceIds.length;
  const isActiveGroup = activeGroupId === groupId;

  return (
    <>
      {instanceIds.map((instId, i) => {
        let prefix = "";
        if (count > 1) {
          if (i === 0) prefix = "┌ ";
          else if (i === count - 1) prefix = "└ ";
          else prefix = "├ ";
        }
        return (
          <TerminalInstanceRow
            key={instId}
            instanceId={instId}
            groupId={groupId}
            prefix={prefix}
            isActive={isActiveGroup && instId === activeInstanceId}
            isSingleInstance={count === 1}
            onSplit={() => onSplit(groupId)}
          />
        );
      })}
    </>
  );
}

function TerminalTabs({ cwd }: { cwd?: string }) {
  const settings = useSettingsStore((s) => s.settings);

  const groupIds = useSyncExternalStore(
    (cb) => terminalService.subscribe(cb),
    () => terminalService.getGroupIds(),
  );

  const activeGroupId = useSyncExternalStore(
    (cb) => terminalService.subscribe(cb),
    () => terminalService.getActiveGroupId(),
  );

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      {/* Terminal content */}
      <ResizablePanel defaultSize="80%" minSize="40%">
        <div className="h-full overflow-hidden">
          <Terminal cwd={cwd} />
        </div>
      </ResizablePanel>

      <ResizableHandle />

      {/* Tab list (right side, vertical) */}
      <ResizablePanel defaultSize="20%" minSize="10%" maxSize="40%">
        <div className="h-full overflow-y-auto scrollbar-none">
          {groupIds.map((gid) => (
            <TerminalGroupRows
              key={gid}
              groupId={gid}
              activeGroupId={activeGroupId}
              onSplit={(groupId) => terminalService.splitTerminal(groupId, cwd, settings)}
            />
          ))}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

export function TerminalPanel({ className }: PanelProps) {
  const setShowBottomPanel = useLayoutStore((s) => s.setShowBottomPanel);
  const projectPath = useWorkspaceStore((s) => s.projectPath);
  const settings = useSettingsStore((s) => s.settings);
  const [activeTab, setActiveTab] = useState("terminal");
  const shellProfiles = useShellProfiles();

  const activeGroupId = useSyncExternalStore(
    (cb) => terminalService.subscribe(cb),
    () => terminalService.getActiveGroupId(),
  );

  const cwd = projectPath ?? undefined;

  const handleNewTerminalDropdown = useCallback(async () => {
    const items: NativeMenuItem[] = [
      { type: "item", id: "new", label: "New Terminal" },
      { type: "item", id: "split", label: "Split Terminal" },
      { type: "separator" },
    ];
    for (const profile of shellProfiles) {
      items.push({
        type: "item",
        id: `shell:${profile.path}`,
        label: profile.is_default ? `${profile.name} (Default)` : profile.name,
      });
    }

    const id = await showNativeContextMenu(items);
    if (!id) return;

    if (id === "new") {
      terminalService.createTerminal(cwd, settings);
    } else if (id === "split") {
      if (activeGroupId !== null) {
        terminalService.splitTerminal(activeGroupId, cwd, settings);
      }
    } else if (id.startsWith("shell:")) {
      const shellPath = id.slice(6);
      terminalService.createTerminal(cwd, settings, shellPath);
    }
  }, [shellProfiles, cwd, settings, activeGroupId]);

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
          {activeTab === "terminal" && (
            <>
              {/* New Terminal + Dropdown */}
              <div className="flex items-center">
                <button
                  title="New Terminal"
                  onClick={() => terminalService.createTerminal(cwd, settings)}
                  className="flex h-5 w-5 items-center justify-center rounded-l text-muted-foreground transition-colors hover:text-foreground"
                >
                  <IconPlus className="size-3.5" />
                </button>
                <button
                  title="Terminal Profiles"
                  onClick={handleNewTerminalDropdown}
                  className="flex h-5 w-3 items-center justify-center rounded-r text-muted-foreground transition-colors hover:text-foreground"
                >
                  <IconChevronDown className="size-3" />
                </button>
              </div>
              {/* Split */}
              <button
                title="Split Terminal"
                onClick={() => {
                  if (activeGroupId !== null) {
                    terminalService.splitTerminal(activeGroupId, cwd, settings);
                  }
                }}
                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
              >
                <IconLayoutColumns className="size-3.5" />
              </button>
              {/* Kill */}
              <button
                title="Kill Terminal"
                onClick={() => {
                  if (activeGroupId !== null) {
                    terminalService.killTerminal(activeGroupId);
                  }
                }}
                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
              >
                <IconTrash className="size-3.5" />
              </button>
            </>
          )}
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
