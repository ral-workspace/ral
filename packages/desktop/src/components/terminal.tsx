import { useEffect, useRef, useSyncExternalStore } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@helm/ui";
import { terminalService } from "../services/terminal-service";
import { useSettingsStore } from "../stores";

/** Mounts a single xterm instance into a container */
function TerminalPane({ instanceId }: { instanceId: number }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    terminalService.attachToDOM(instanceId, container);
    return () => {
      terminalService.detachFromDOM(instanceId);
    };
  }, [instanceId]);

  return <div ref={containerRef} className="h-full w-full pl-5 pt-2" />;
}

/** Renders all instances in a group as horizontal split panes */
export function Terminal({ cwd }: { cwd?: string }) {
  const settings = useSettingsStore((s) => s.settings);

  const activeGroupId = useSyncExternalStore(
    (cb) => terminalService.subscribe(cb),
    () => terminalService.getActiveGroupId(),
  );

  const group = useSyncExternalStore(
    (cb) => terminalService.subscribe(cb),
    () => activeGroupId !== null ? terminalService.getGroup(activeGroupId) : undefined,
  );

  // Create initial terminal if none exists
  const creatingRef = useRef(false);
  useEffect(() => {
    if (terminalService.getGroupIds().length === 0 && !creatingRef.current) {
      creatingRef.current = true;
      terminalService.createTerminal(cwd, settings);
    }
  }, []);

  // Update existing terminals when settings change
  useEffect(() => {
    terminalService.updateTerminalSettings(settings);
  }, [
    settings["terminal.fontSize"],
    settings["terminal.fontFamily"],
    settings["terminal.lineHeight"],
    settings["terminal.cursorBlink"],
  ]);

  if (!group || group.instanceIds.length === 0) {
    return <div className="h-full w-full" />;
  }

  // Single instance — no split needed
  if (group.instanceIds.length === 1) {
    return <TerminalPane instanceId={group.instanceIds[0]} />;
  }

  // Multiple instances — horizontal split (like VS Code when panel is at bottom)
  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
      {group.instanceIds.map((instId, i) => (
        <div key={instId} className="contents">
          {i > 0 && <ResizableHandle />}
          <ResizablePanel minSize="80px">
            <TerminalPane instanceId={instId} />
          </ResizablePanel>
        </div>
      ))}
    </ResizablePanelGroup>
  );
}
