import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  IconChevronDown,
  IconChevronRight,
} from "@tabler/icons-react";
import { FileIcon, FolderIcon } from "./file-icon";
import type { NativeMenuItem } from "../lib/native-context-menu";
import { useNativeContextMenu } from "../lib/use-native-context-menu";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useLayoutStore } from "../stores/layout-store";
import { createFile, createDir, renamePath, deletePath } from "../services/file-operations";

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
  onRequestCreate?: (parentPath: string, type: "file" | "folder") => void;
  refreshCounter: number;
}

function basename(path: string): string {
  return path.split("/").pop() || path;
}

function dirname(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

function isDescendantOrSelf(child: string, parent: string): boolean {
  return child === parent || child.startsWith(parent + "/");
}

/**
 * Walk up from `el` to find the closest tree-row with data-tree-path.
 * Returns { path, isDir } or null.
 */
function findTreeRow(el: HTMLElement | null): { path: string; isDir: boolean } | null {
  let cur = el;
  while (cur) {
    if (cur.dataset?.treePath) {
      return { path: cur.dataset.treePath, isDir: cur.dataset.treeDir === "true" };
    }
    cur = cur.parentElement;
  }
  return null;
}

/**
 * Resolve the drop target folder from a hovered element.
 * - If hovering a folder row → that folder
 * - If hovering a file row → its parent folder
 */
function resolveDropFolder(el: HTMLElement | null, rootPath: string): string | null {
  const row = findTreeRow(el);
  if (!row) return rootPath; // hovering empty space → root
  if (row.isDir) return row.path;
  return dirname(row.path) || rootPath;
}

export function FileTree({
  rootPath,
  onFileOpen,
  creatingItem,
  onCreatingDone,
  selectedPath,
  onSelect,
  onRequestCreate,
  refreshCounter,
}: FileTreeProps) {
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragSource, setDragSource] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const dropTargetRef = useRef<string | null>(null);
  const autoExpandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoExpandPathRef = useRef<string | null>(null);
  const [autoExpandTrigger, setAutoExpandTrigger] = useState(0);

  const reload = useCallback(() => {
    invoke<DirEntry[]>("read_dir", { path: rootPath })
      .then(setEntries)
      .catch(() => setEntries([]));
  }, [rootPath]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    invoke<DirEntry[]>("read_dir", { path: rootPath })
      .then((result) => { if (!cancelled) setEntries(result); })
      .catch(() => { if (!cancelled) setEntries([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [rootPath, refreshCounter]);

  const clearAutoExpand = useCallback(() => {
    if (autoExpandTimerRef.current) {
      clearTimeout(autoExpandTimerRef.current);
      autoExpandTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearAutoExpand(), [clearAutoExpand]);

  // All DnD is handled at the container level (event delegation)
  const handleDragStart = useCallback((e: React.DragEvent) => {
    const row = findTreeRow(e.target as HTMLElement);
    if (!row) return;
    e.dataTransfer.setData("text/plain", row.path);
    e.dataTransfer.effectAllowed = "move";
    setDragSource(row.path);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const el = e.target as HTMLElement;
    findTreeRow(el);
    const folder = resolveDropFolder(el, rootPath);
    if (folder !== dropTargetRef.current) {
      dropTargetRef.current = folder;
      setDropTarget(folder);
      // Auto-expand timer
      clearAutoExpand();
      if (folder && folder !== rootPath) {
        autoExpandTimerRef.current = setTimeout(() => {
          autoExpandPathRef.current = folder;
          setAutoExpandTrigger((n) => n + 1);
        }, 500);
      }
    }
  }, [rootPath, clearAutoExpand]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    const related = e.relatedTarget as HTMLElement | null;
    const leaving = !e.currentTarget.contains(related);
    if (leaving) {
      dropTargetRef.current = null;
      setDropTarget(null);
      clearAutoExpand();
    }
  }, [clearAutoExpand]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const sourcePath = e.dataTransfer.getData("text/plain");
    const targetFolder = resolveDropFolder(e.target as HTMLElement, rootPath);

    dropTargetRef.current = null;
    setDropTarget(null);
    setDragSource(null);
    clearAutoExpand();

    if (!sourcePath || !targetFolder) return;
    if (isDescendantOrSelf(targetFolder, sourcePath)) return;
    if (dirname(sourcePath) === targetFolder) return;

    const destination = `${targetFolder}/${basename(sourcePath)}`;
    try {
      await renamePath(sourcePath, destination);
      reload();
    } catch (err) {
      console.error("Failed to move file:", err);
    }
  }, [rootPath, clearAutoExpand, reload]);

  const handleDragEnd = useCallback(() => {
    dropTargetRef.current = null;
    setDragSource(null);
    setDropTarget(null);
    clearAutoExpand();
  }, [clearAutoExpand]);

  if (loading) {
    return (
      <div className="px-4 py-2 text-[11px] text-muted-foreground">Loading...</div>
    );
  }

  const showInlineInput = creatingItem?.parentPath === rootPath;
  const handleCreated = () => { reload(); onCreatingDone?.(); };

  return (
    <div
      className="overflow-auto"
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onDragEnd={handleDragEnd}
    >
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
          rootPath={rootPath}
          onFileOpen={onFileOpen}
          creatingItem={creatingItem}
          onCreatingDone={handleCreated}
          selectedPath={selectedPath}
          onSelect={onSelect}
          onRequestCreate={onRequestCreate}
          onTreeReload={reload}
          dropTarget={dropTarget}
          dragSource={dragSource}
          autoExpandPathRef={autoExpandPathRef}
          autoExpandTrigger={autoExpandTrigger}
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

  useEffect(() => { inputRef.current?.focus(); }, []);

  const commit = async () => {
    if (committedRef.current) return;
    committedRef.current = true;
    const name = value.trim();
    if (!name || name.includes("/") || name.includes("\\")) { onDone?.(); return; }
    const fullPath = `${parentPath}/${name}`;
    try {
      if (type === "folder") { await createDir(fullPath); }
      else { await createFile(fullPath); }
      onDone?.();
      if (type === "file") { onFileOpen?.(fullPath, true); }
    } catch (err) { console.error("Failed to create:", err); onDone?.(); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); commit(); }
    else if (e.key === "Escape") { e.preventDefault(); committedRef.current = true; onDone?.(); }
  };

  return (
    <div
      className="flex h-[22px] w-full min-w-0 items-center gap-1 pr-2"
      style={{ paddingLeft: depth * 8 + 20 }}
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
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className="h-[18px] min-w-0 flex-1 bg-transparent text-[13px] text-sidebar-foreground outline-none ring-1 ring-blue-500 rounded-sm px-1"
      />
    </div>
  );
}

function RenameInput({
  entry,
  depth,
  expanded,
  onDone,
}: {
  entry: DirEntry;
  depth: number;
  expanded: boolean;
  onDone: (newPath: string | null) => void;
}) {
  const [value, setValue] = useState(entry.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const committedRef = useRef(false);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    // Select filename without extension for files
    if (!entry.is_directory) {
      const dotIdx = entry.name.lastIndexOf(".");
      if (dotIdx > 0) {
        input.setSelectionRange(0, dotIdx);
      } else {
        input.select();
      }
    } else {
      input.select();
    }
  }, []);

  const commit = async () => {
    if (committedRef.current) return;
    committedRef.current = true;
    const newName = value.trim();
    if (!newName || newName === entry.name || newName.includes("/") || newName.includes("\\")) {
      onDone(null);
      return;
    }
    const parentDir = entry.path.slice(0, entry.path.lastIndexOf("/"));
    const newPath = `${parentDir}/${newName}`;
    try {
      await renamePath(entry.path, newPath);
      onDone(newPath);
    } catch (err) {
      console.error("Failed to rename:", err);
      onDone(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); commit(); }
    else if (e.key === "Escape") { e.preventDefault(); committedRef.current = true; onDone(null); }
  };

  return (
    <div
      className="flex h-[22px] w-full min-w-0 items-center gap-1 pr-2"
      style={{ paddingLeft: depth * 8 + 20 }}
    >
      {entry.is_directory ? (
        <>
          {expanded ? (
            <IconChevronDown className="size-3 shrink-0 text-sidebar-foreground/50" />
          ) : (
            <IconChevronRight className="size-3 shrink-0 text-sidebar-foreground/50" />
          )}
          <FolderIcon folderName={value || entry.name} expanded={expanded} className="size-4 shrink-0" />
        </>
      ) : (
        <>
          <span className="size-3 shrink-0" />
          <FileIcon fileName={value || entry.name} className="size-4 shrink-0" />
        </>
      )}
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className="h-[18px] min-w-0 flex-1 bg-transparent text-[13px] text-sidebar-foreground outline-none ring-1 ring-blue-500 rounded-sm px-1"
      />
    </div>
  );
}

function TreeItem({
  entry,
  depth,
  rootPath,
  onFileOpen,
  creatingItem,
  onCreatingDone,
  selectedPath,
  onSelect,
  onRequestCreate,
  onTreeReload,
  dropTarget,
  dragSource,
  autoExpandPathRef,
  autoExpandTrigger,
}: {
  entry: DirEntry;
  depth: number;
  rootPath: string;
  onFileOpen?: (path: string, pinned: boolean) => void;
  creatingItem?: CreatingItem | null;
  onCreatingDone?: () => void;
  selectedPath: string | null;
  onSelect?: (path: string, isDirectory: boolean) => void;
  onRequestCreate?: (parentPath: string, type: "file" | "folder") => void;
  onTreeReload?: () => void;
  dropTarget: string | null;
  dragSource: string | null;
  autoExpandPathRef: React.MutableRefObject<string | null>;
  autoExpandTrigger: number;
}) {
  const expanded = useLayoutStore((s) => s.expandedPaths.has(entry.path));
  const toggleExpanded = useLayoutStore((s) => s.toggleExpanded);
  const setExpanded = useLayoutStore((s) => s.setExpanded);
  const [children, setChildren] = useState<DirEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [renaming, setRenaming] = useState(false);

  const showInlineInput = creatingItem?.parentPath === entry.path && entry.is_directory;
  const isDragOver = dropTarget === entry.path && entry.is_directory;
  const isDragging = dragSource === entry.path;

  const reloadChildren = useCallback(() => {
    invoke<DirEntry[]>("read_dir", { path: entry.path })
      .then(setChildren)
      .catch(() => setChildren([]));
  }, [entry.path]);

  const loadAndExpand = useCallback(() => {
    if (children === null) {
      setLoading(true);
      invoke<DirEntry[]>("read_dir", { path: entry.path })
        .then(setChildren)
        .catch(() => setChildren([]))
        .finally(() => setLoading(false));
    }
    setExpanded(entry.path, true);
  }, [children, entry.path, setExpanded]);

  // Auto-expand folder when creating inside it
  useEffect(() => {
    if (showInlineInput && !expanded) loadAndExpand();
  }, [showInlineInput]);

  // Auto-expand on drag hover (triggered from parent via ref + counter)
  useEffect(() => {
    if (
      autoExpandPathRef.current === entry.path &&
      entry.is_directory &&
      !expanded
    ) {
      loadAndExpand();
      autoExpandPathRef.current = null;
    }
  }, [autoExpandTrigger]);

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
      toggleExpanded(entry.path);
    } else {
      onFileOpen?.(entry.path, false);
    }
  };

  const handleDoubleClick = () => {
    if (!entry.is_directory) onFileOpen?.(entry.path, true);
  };

  const handleCreated = () => { reloadChildren(); onCreatingDone?.(); };

  const getContextMenuItems = useCallback((): NativeMenuItem[] => {
    const items: NativeMenuItem[] = [];
    if (entry.is_directory) {
      items.push({ type: "item", id: "new-file", label: "New File" });
      items.push({ type: "item", id: "new-folder", label: "New Folder" });
      items.push({ type: "separator" });
    }
    items.push({ type: "item", id: "rename", label: "Rename" });
    items.push({ type: "item", id: "delete", label: "Delete" });
    items.push({ type: "separator" });
    items.push({ type: "item", id: "copy-path", label: "Copy Path" });
    items.push({ type: "item", id: "copy-relative-path", label: "Copy Relative Path" });
    return items;
  }, [entry.is_directory]);

  const handleContextMenuAction = useCallback((actionId: string) => {
    switch (actionId) {
      case "new-file":
        onRequestCreate?.(entry.path, "file");
        break;
      case "new-folder":
        onRequestCreate?.(entry.path, "folder");
        break;
      case "rename":
        setRenaming(true);
        break;
      case "delete":
        deletePath(entry.path)
          .then(() => {
            onTreeReload?.();
            reloadChildren();
          })
          .catch((err) => console.error("Failed to delete:", err));
        break;
      case "copy-path":
        writeText(entry.path);
        break;
      case "copy-relative-path": {
        const relative = entry.path.startsWith(rootPath + "/")
          ? entry.path.slice(rootPath.length + 1)
          : entry.path;
        writeText(relative);
        break;
      }
    }
  }, [entry.path, entry.is_directory, rootPath, onRequestCreate, onTreeReload, reloadChildren]);

  const { onContextMenu } = useNativeContextMenu(getContextMenuItems, handleContextMenuAction);

  return (
    <>
      {renaming ? (
        <RenameInput
          entry={entry}
          depth={depth}
          expanded={expanded}
          onDone={(newPath) => {
            setRenaming(false);
            if (newPath) onTreeReload?.();
          }}
        />
      ) : (
      <div
        draggable
        data-tree-path={entry.path}
        data-tree-dir={entry.is_directory ? "true" : "false"}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={onContextMenu}
        role="treeitem"
        className={[
          "flex h-[22px] w-full cursor-default items-center gap-1 pr-2 text-[13px] text-sidebar-foreground hover:bg-sidebar-accent",
          selectedPath === entry.path ? "bg-sidebar-accent" : "",
          isDragOver ? "bg-blue-500/20 outline outline-1 outline-blue-500/50" : "",
          isDragging ? "opacity-50" : "",
        ].join(" ")}
        style={{ paddingLeft: depth * 8 + 20 }}
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
      </div>
      )}

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
              style={{ paddingLeft: (depth + 1) * 8 + 20 }}
            >
              Loading...
            </div>
          ) : (
            children?.map((child) => (
              <TreeItem
                key={child.path}
                entry={child}
                depth={depth + 1}
                rootPath={rootPath}
                onFileOpen={onFileOpen}
                creatingItem={creatingItem}
                onCreatingDone={handleCreated}
                selectedPath={selectedPath}
                onSelect={onSelect}
                onRequestCreate={onRequestCreate}
                onTreeReload={onTreeReload}
                dropTarget={dropTarget}
                dragSource={dragSource}
                autoExpandPathRef={autoExpandPathRef}
                autoExpandTrigger={autoExpandTrigger}
              />
            ))
          )}
        </>
      )}
    </>
  );
}
