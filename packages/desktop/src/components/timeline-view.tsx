import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { IconHistory, IconX } from "@tabler/icons-react";
import {
  getHistoryEntries,
  getHistoryContent,
  deleteHistoryEntry,
  restoreHistoryEntry,
  type HistoryEntry,
} from "../services/history-service";
import { useEditorStore, useSettingsStore } from "../stores";
import { invalidateBufferCache } from "../hooks/use-codemirror";

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sourceLabel(source: string): string {
  switch (source) {
    case "save":
      return "Saved";
    case "restore-backup":
      return "Before Restore";
    case "ai-edit":
      return "AI Edit";
    default:
      return source;
  }
}

interface TimelineViewProps {
  filePath: string | null;
}

export function TimelineView({ filePath }: TimelineViewProps) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const openDiff = useEditorStore((s) => s.openDiff);
  const settings = useSettingsStore((s) => s.settings);

  const refresh = useCallback(() => {
    if (!filePath) {
      setEntries([]);
      return;
    }
    getHistoryEntries(filePath)
      .then(setEntries)
      .catch(() => setEntries([]));
  }, [filePath]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleClick = async (entry: HistoryEntry) => {
    if (!filePath) return;
    try {
      const oldContent = await getHistoryContent(filePath, entry.id);
      const currentContent = await invoke<string>("read_file", {
        path: filePath,
      });
      openDiff(filePath, oldContent, currentContent);
    } catch {
      // entry may have been deleted
    }
  };

  const handleRestore = async (entry: HistoryEntry) => {
    if (!filePath) return;
    try {
      await restoreHistoryEntry(
        filePath,
        entry.id,
        settings["history.maxEntries"],
        settings["history.maxFileSize"],
      );
      invalidateBufferCache(filePath);
      useEditorStore.getState().bumpFileVersion(filePath);
      refresh();
    } catch {
      // entry may have been deleted
    }
  };

  const handleDelete = async (entry: HistoryEntry) => {
    if (!filePath) return;
    try {
      await deleteHistoryEntry(filePath, entry.id);
      refresh();
    } catch {
      // ignore
    }
  };

  if (!filePath) {
    return (
      <div className="px-4 py-2 text-[11px] text-sidebar-foreground/50">
        No file selected
      </div>
    );
  }

  const fileName = filePath.split("/").pop() ?? filePath;

  if (entries.length === 0) {
    return (
      <div className="px-4 py-2 text-[11px] text-sidebar-foreground/50">
        <span className="text-sidebar-foreground/70">{fileName}</span>
        {" — no history"}
      </div>
    );
  }

  return (
    <div className="max-h-[200px] overflow-auto">
      <div className="px-4 py-1 text-[11px] text-sidebar-foreground/70 truncate">
        {fileName}
      </div>
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="group flex h-[22px] w-full cursor-pointer items-center gap-1.5 px-4 text-[11px] hover:bg-sidebar-accent"
          onClick={() => handleClick(entry)}
          onContextMenu={(e) => {
            e.preventDefault();
            // Simple context menu via buttons on hover
          }}
        >
          <IconHistory className="size-3 shrink-0 text-sidebar-foreground/50" />
          <span className="flex-1 truncate">
            {formatRelativeTime(entry.timestamp)}
          </span>
          <span className="shrink-0 text-sidebar-foreground/40">
            {sourceLabel(entry.source)}
          </span>
          <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRestore(entry);
              }}
              className="rounded px-1 text-[10px] text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              title="Restore"
            >
              Restore
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(entry);
              }}
              className="flex items-center rounded text-sidebar-foreground/40 hover:text-sidebar-foreground"
              title="Delete"
            >
              <IconX className="size-3" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
