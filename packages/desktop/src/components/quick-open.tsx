import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@helm/ui";
import { IconSearch } from "@tabler/icons-react";
import { useWorkspaceStore, useEditorStore } from "../stores";
import { FileIcon } from "./file-icon";

interface QuickOpenProps {
  open: boolean;
  onClose: () => void;
}

export function QuickOpen({ open, onClose }: QuickOpenProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const projectPath = useWorkspaceStore((s) => s.projectPath);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      // Focus input after dialog opens
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Debounced search
  const search = useCallback(
    (q: string) => {
      if (!projectPath) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (!q.trim()) {
        // Show recent/all files when query is empty
        debounceRef.current = setTimeout(async () => {
          try {
            const files = await invoke<string[]>("search_files", {
              rootPath: projectPath,
              query: "",
              maxResults: 50,
            });
            setResults(files);
            setSelectedIndex(0);
          } catch {
            setResults([]);
          }
        }, 50);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        try {
          const files = await invoke<string[]>("search_files", {
            rootPath: projectPath,
            query: q,
            maxResults: 50,
          });
          setResults(files);
          setSelectedIndex(0);
        } catch {
          setResults([]);
        }
      }, 80);
    },
    [projectPath],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setQuery(val);
      search(val);
    },
    [search],
  );

  const openFile = useCallback(
    (relativePath: string) => {
      if (!projectPath) return;
      const fullPath = `${projectPath}/${relativePath}`;
      useEditorStore.getState().openFile(fullPath, true);
      onClose();
    },
    [projectPath, onClose],
  );

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (results[selectedIndex]) {
            openFile(results[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [results, selectedIndex, openFile, onClose],
  );

  // Extract filename from path for display
  const getFileName = (path: string) => {
    const idx = path.lastIndexOf("/");
    return idx >= 0 ? path.slice(idx + 1) : path;
  };

  const getDirectory = (path: string) => {
    const idx = path.lastIndexOf("/");
    return idx >= 0 ? path.slice(0, idx) : "";
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogHeader className="sr-only">
        <DialogTitle>Quick Open</DialogTitle>
        <DialogDescription>Search for a file to open</DialogDescription>
      </DialogHeader>
      <DialogContent className="overflow-hidden p-0" showCloseButton={false}>
        <div onKeyDown={handleKeyDown}>
          {/* Search input */}
          <div className="flex h-12 items-center gap-2 border-b px-3">
            <IconSearch className="size-4 shrink-0 opacity-50" />
            <input
              ref={inputRef}
              type="text"
              className="flex h-10 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Search files by name..."
              value={query}
              onChange={handleInputChange}
              autoFocus
            />
          </div>

          {/* Results */}
          <div
            ref={listRef}
            className="max-h-[300px] overflow-y-auto scroll-py-1 p-1"
          >
            {results.length === 0 && query.trim() && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No matching files
              </div>
            )}
            {results.map((filePath, index) => {
              const fileName = getFileName(filePath);
              const dir = getDirectory(filePath);
              return (
                <button
                  key={filePath}
                  type="button"
                  className={`relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none ${
                    index === selectedIndex
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground"
                  }`}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => openFile(filePath)}
                >
                  <FileIcon
                    fileName={fileName}
                    className="size-4 shrink-0"
                  />
                  <span className="truncate">{fileName}</span>
                  {dir && (
                    <span className="ml-auto truncate text-xs text-muted-foreground">
                      {dir}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
