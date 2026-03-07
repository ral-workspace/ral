import { useEffect, useRef, useSyncExternalStore } from "react";
import { terminalService } from "../services/terminal-service";
import { useSettingsStore } from "../stores";

export function Terminal({ cwd }: { cwd?: string }) {
  const settings = useSettingsStore((s) => s.settings);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevIdRef = useRef<number | null>(null);

  const activeId = useSyncExternalStore(
    (cb) => terminalService.subscribe(cb),
    () => terminalService.getActiveTerminalId(),
  );

  // Create initial terminal if none exists
  useEffect(() => {
    if (terminalService.getTerminalIds().length === 0) {
      terminalService.createTerminal(cwd, settings);
    }
  }, []);

  // Attach/detach when activeId changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Detach previous
    if (prevIdRef.current !== null && prevIdRef.current !== activeId) {
      terminalService.detachFromDOM(prevIdRef.current);
    }

    // Attach current
    if (activeId !== null) {
      terminalService.attachToDOM(activeId, container);
    }

    prevIdRef.current = activeId;

    return () => {
      if (activeId !== null) {
        terminalService.detachFromDOM(activeId);
      }
    };
  }, [activeId]);

  // Update existing terminals when settings change
  useEffect(() => {
    terminalService.updateTerminalSettings(settings);
  }, [
    settings["terminal.fontSize"],
    settings["terminal.fontFamily"],
    settings["terminal.lineHeight"],
    settings["terminal.cursorBlink"],
  ]);

  return <div ref={containerRef} className="h-full w-full pl-5 pt-2" />;
}
