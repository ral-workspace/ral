import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  IconChevronDown,
  IconChevronRight,
} from "@tabler/icons-react";
import { FileIcon, FolderIcon } from "./file-icon";

interface DirEntry {
  name: string;
  path: string;
  is_directory: boolean;
}

export interface CreatingItem {
  parentPath: string;
  type: "file" | "folder";
}

interface FileTreeProps {
  rootPath: string;
  onFileOpen?: (path: string, pinned: boolean) => void;
  creatingItem?: CreatingItem | null;
  onCreatingDone?: () => void;
  selectedPath: string | null;
  onSelect?: (path: string, isDirectory: boolean) => void;
  refreshCounter: number;
}

export function FileTree({
  rootPath,
  onFileOpen,
  creatingItem,
  onCreatingDone,
  selectedPath,
  onSelect,
  refreshCounter,
}: FileTreeProps) {
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    invoke<DirEntry[]>("read_dir", { path: rootPath })
      .then(setEntries)
      .catch(() => setEntries([]));
  }, [rootPath]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    invoke<DirEntry[]>("read_dir", { path: rootPath })
      .then((result) => {
        if (!cancelled) setEntries(result);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rootPath, refreshCounter]);

  if (loading) {
    return (
      <div className="px-4 py-2 text-[11px] text-muted-foreground">
        Loading...
      </div>
    );
  }

  const showInlineInput = creatingItem?.parentPath === rootPath;

  const handleCreated = () => {
    reload();
    onCreatingDone?.();
  };

  return (
    <div className="overflow-auto">
      {showInlineInput && (
        <InlineInput
          parentPath={rootPath}
          type={creatingItem!.type}
          depth={0}
          onFileOpen={onFileOpen}
          onDone={handleCreated}
        />
      )}
      {entries.map((entry) => (
        <TreeItem
          key={entry.path}
          entry={entry}
          depth={0}
          onFileOpen={onFileOpen}
          creatingItem={creatingItem}
          onCreatingDone={handleCreated}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function InlineInput({
  parentPath,
  type,
  depth,
  onFileOpen,
  onDone,
}: {
  parentPath: string;
  type: "file" | "folder";
  depth: number;
  onFileOpen?: (path: string, pinned: boolean) => void;
  onDone?: () => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const committedRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commit = async () => {
    if (committedRef.current) return;
    committedRef.current = true;

    const name = value.trim();
    if (!name || name.includes("/") || name.includes("\\")) {
      onDone?.();
      return;
    }

    const fullPath = `${parentPath}/${name}`;
    try {
      if (type === "folder") {
        await invoke("create_dir", { path: fullPath });
      } else {
        await invoke("create_file", { path: fullPath });
      }
      onDone?.();
      if (type === "file") {
        onFileOpen?.(fullPath, true);
      }
    } catch (err) {
      console.error("Failed to create:", err);
      onDone?.();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      committedRef.current = true;
      onDone?.();
    }
  };

  return (
    <div
      className="flex h-[22px] w-full min-w-0 items-center gap-1 pr-2"
      style={{ paddingLeft: depth * 16 + 20 }}
    >
      {type === "folder" ? (
        <>
          <IconChevronRight className="size-3 shrink-0 text-sidebar-foreground/50" />
          <FolderIcon folderName={value || "folder"} expanded={false} className="size-4 shrink-0" />
        </>
      ) : (
        <>
          <span className="size-3 shrink-0" />
          <FileIcon fileName={value || "file"} className="size-4 shrink-0" />
        </>
      )}
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
        className="h-[18px] min-w-0 flex-1 bg-transparent text-[13px] text-sidebar-foreground outline-none ring-1 ring-blue-500 rounded-sm px-1"
      />
    </div>
  );
}

function TreeItem({
  entry,
  depth,
  onFileOpen,
  creatingItem,
  onCreatingDone,
  selectedPath,
  onSelect,
}: {
  entry: DirEntry;
  depth: number;
  onFileOpen?: (path: string, pinned: boolean) => void;
  creatingItem?: CreatingItem | null;
  onCreatingDone?: () => void;
  selectedPath: string | null;
  onSelect?: (path: string, isDirectory: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<DirEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  const showInlineInput = creatingItem?.parentPath === entry.path && entry.is_directory;

  const reloadChildren = useCallback(() => {
    invoke<DirEntry[]>("read_dir", { path: entry.path })
      .then(setChildren)
      .catch(() => setChildren([]));
  }, [entry.path]);

  // Auto-expand folder when creating inside it
  useEffect(() => {
    if (showInlineInput && !expanded) {
      if (children === null) {
        setLoading(true);
        invoke<DirEntry[]>("read_dir", { path: entry.path })
          .then(setChildren)
          .catch(() => setChildren([]))
          .finally(() => setLoading(false));
      }
      setExpanded(true);
    }
  }, [showInlineInput]);

  const handleClick = () => {
    onSelect?.(entry.path, entry.is_directory);
    if (entry.is_directory) {
      if (!expanded && children === null) {
        setLoading(true);
        invoke<DirEntry[]>("read_dir", { path: entry.path })
          .then(setChildren)
          .catch(() => setChildren([]))
          .finally(() => setLoading(false));
      }
      setExpanded((v) => !v);
    } else {
      onFileOpen?.(entry.path, false);
    }
  };

  const handleDoubleClick = () => {
    if (!entry.is_directory) {
      onFileOpen?.(entry.path, true);
    }
  };

  const handleCreated = () => {
    reloadChildren();
    onCreatingDone?.();
  };

  return (
    <>
      <button
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        className={`flex h-[22px] w-full items-center gap-1 pr-2 text-[13px] text-sidebar-foreground hover:bg-sidebar-accent ${selectedPath === entry.path ? "bg-sidebar-accent" : ""}`}
        style={{ paddingLeft: depth * 16 + 20 }}
      >
        {entry.is_directory ? (
          <>
            {expanded ? (
              <IconChevronDown className="size-3 shrink-0 text-sidebar-foreground/50" />
            ) : (
              <IconChevronRight className="size-3 shrink-0 text-sidebar-foreground/50" />
            )}
            <FolderIcon
              folderName={entry.name}
              expanded={expanded}
              className="size-4 shrink-0"
            />
          </>
        ) : (
          <>
            <span className="size-3 shrink-0" />
            <FileIcon fileName={entry.name} className="size-4 shrink-0" />
          </>
        )}
        <span className="truncate">{entry.name}</span>
      </button>

      {entry.is_directory && expanded && (
        <>
          {showInlineInput && (
            <InlineInput
              parentPath={entry.path}
              type={creatingItem!.type}
              depth={depth + 1}
              onFileOpen={onFileOpen}
              onDone={handleCreated}
            />
          )}
          {loading ? (
            <div
              className="flex h-[22px] items-center text-[11px] text-muted-foreground"
              style={{ paddingLeft: (depth + 1) * 16 + 20 }}
            >
              Loading...
            </div>
          ) : (
            children?.map((child) => (
              <TreeItem
                key={child.path}
                entry={child}
                depth={depth + 1}
                onFileOpen={onFileOpen}
                creatingItem={creatingItem}
                onCreatingDone={handleCreated}
                selectedPath={selectedPath}
                onSelect={onSelect}
              />
            ))
          )}
        </>
      )}
    </>
  );
}
