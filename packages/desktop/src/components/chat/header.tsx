import { cn, Button } from "@helm/ui";
import { useRef, useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  IconRobot,
  IconChevronDown,
  IconPlus,
} from "@tabler/icons-react";
import type { SessionSummary } from "../../services/chat-history";

interface ChatHeaderProps {
  currentLabel: string;
  sessionId: string | null;
  sessions: SessionSummary[];
  connected: boolean;
  onNewChat: () => void;
  onViewSession: (sessionId: string) => void;
  onLoadSessions: () => void;
}

export function ChatHeader({
  currentLabel,
  sessionId,
  sessions,
  connected,
  onNewChat,
  onViewSession,
  onLoadSessions,
}: ChatHeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load sessions when dropdown opens
  useEffect(() => {
    if (dropdownOpen) onLoadSessions();
  }, [dropdownOpen, onLoadSessions]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) return;
      setDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  const toggleDropdown = useCallback(() => {
    if (!dropdownOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 2,
        left: rect.left,
        width: Math.max(rect.width, 240),
      });
    }
    setDropdownOpen((v) => !v);
  }, [dropdownOpen]);

  const handleNewChat = () => {
    onNewChat();
    setDropdownOpen(false);
  };

  const handleViewSession = (sid: string) => {
    onViewSession(sid);
    setDropdownOpen(false);
  };

  return (
    <>
      <div className="flex h-9 items-center border-b px-3">
        <button
          ref={triggerRef}
          onClick={toggleDropdown}
          className="flex items-center gap-1 rounded px-1 py-0.5 text-[11px] text-foreground transition-colors hover:bg-accent/50"
        >
          <IconRobot className="size-3.5 text-muted-foreground" />
          <span className="max-w-[120px] truncate">{currentLabel}</span>
          <IconChevronDown className="size-3 text-muted-foreground" />
        </button>
        <div className="flex-1" />
        <div className="flex items-center gap-0.5">
          <span
            title={connected ? "Connected" : "Disconnected"}
            className={cn(
              "mr-0.5 size-1.5 rounded-full",
              connected ? "bg-green-500" : "bg-red-500",
            )}
          />
          <Button
            variant="ghost"
            size="icon-xs"
            title="New Chat"
            onClick={handleNewChat}
          >
            <IconPlus />
          </Button>
        </div>
      </div>

      {/* Session dropdown portal */}
      {dropdownOpen && dropdownPos && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-50 max-h-64 overflow-y-auto rounded-md border bg-popover shadow-md"
          style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
        >
          <button
            onClick={handleNewChat}
            className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent/50"
          >
            <IconPlus className="size-3 text-muted-foreground" />
            <span className="text-xs text-foreground">New Chat</span>
          </button>
          {sessions.length > 0 && (
            <>
              <div className="border-t" />
              <div className="px-3 py-1.5">
                <span className="text-[10px] text-muted-foreground">Recent</span>
              </div>
              {sessions.map((s) => (
                <button
                  key={s.sessionId}
                  onClick={() => handleViewSession(s.sessionId)}
                  className={cn(
                    "w-full px-3 py-1.5 text-left transition-colors hover:bg-accent/50",
                    s.sessionId === sessionId && "bg-accent/30",
                  )}
                >
                  <p className="truncate text-xs text-foreground">
                    {s.preview || "Empty session"}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {new Date(s.createdAt).toLocaleString()}
                  </p>
                </button>
              ))}
            </>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
