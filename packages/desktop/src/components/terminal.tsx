import { useEffect, useRef } from "react";
import { terminalService } from "../services/terminal-service";
import { useSettingsStore } from "../stores";

interface TerminalProps {
  cwd?: string;
}

export function Terminal({ cwd }: TerminalProps) {
  const settings = useSettingsStore((s) => s.settings);
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    let id = terminalService.getActiveTerminalId();

    if (id === null) {
      // No existing terminal — create one
      let cancelled = false;
      terminalService.createTerminal(cwd, settings).then((newId) => {
        if (cancelled) return;
        terminalIdRef.current = newId;
        terminalService.attachToDOM(newId, container);
      });

      return () => {
        cancelled = true;
        if (terminalIdRef.current !== null) {
          terminalService.detachFromDOM(terminalIdRef.current);
        }
      };
    }

    // Existing terminal — just re-attach
    terminalIdRef.current = id;
    terminalService.attachToDOM(id, container);

    return () => {
      if (terminalIdRef.current !== null) {
        terminalService.detachFromDOM(terminalIdRef.current);
      }
    };
  }, [cwd]);

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
