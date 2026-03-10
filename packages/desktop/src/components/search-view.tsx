import { useCallback, useEffect, useRef } from "react";
import { cn, Tooltip, TooltipContent, TooltipTrigger } from "@ral/ui";
import {
  IconChevronDown,
  IconChevronRight,
  IconRegex,
  IconLetterCase,
  IconAbc,
  IconFilter,
  IconX,
} from "@tabler/icons-react";
import { useSearchStore, type FileGroup } from "../stores/search-store";
import { useWorkspaceStore, useEditorStore } from "../stores";
import { FileIcon } from "./file-icon";

export function SearchView() {
  const projectPath = useWorkspaceStore((s) => s.projectPath);
  const openFile = useEditorStore((s) => s.openFile);

  const query = useSearchStore((s) => s.query);
  const isRegex = useSearchStore((s) => s.isRegex);
  const isCaseSensitive = useSearchStore((s) => s.isCaseSensitive);
  const isWholeWord = useSearchStore((s) => s.isWholeWord);
  const showFilters = useSearchStore((s) => s.showFilters);
  const includePattern = useSearchStore((s) => s.includePattern);
  const excludePattern = useSearchStore((s) => s.excludePattern);
  const groupedResults = useSearchStore((s) => s.groupedResults);
  const fileNameResults = useSearchStore((s) => s.fileNameResults);
  const isSearching = useSearchStore((s) => s.isSearching);
  const totalMatches = useSearchStore((s) => s.totalMatches);
  const totalFiles = useSearchStore((s) => s.totalFiles);

  const setQuery = useSearchStore((s) => s.setQuery);
  const toggleRegex = useSearchStore((s) => s.toggleRegex);
  const toggleCaseSensitive = useSearchStore((s) => s.toggleCaseSensitive);
  const toggleWholeWord = useSearchStore((s) => s.toggleWholeWord);
  const toggleFilters = useSearchStore((s) => s.toggleFilters);
  const setIncludePattern = useSearchStore((s) => s.setIncludePattern);
  const setExcludePattern = useSearchStore((s) => s.setExcludePattern);
  const toggleFileExpanded = useSearchStore((s) => s.toggleFileExpanded);
  const performSearch = useSearchStore((s) => s.performSearch);
  const clearResults = useSearchStore((s) => s.clearResults);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const triggerSearch = useCallback(() => {
    if (!projectPath) return;
    performSearch(projectPath);
  }, [projectPath, performSearch]);

  // Debounced search on query change
  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (!projectPath) return;
        // Use latest store state
        useSearchStore.getState().performSearch(projectPath);
      }, 300);
    },
    [setQuery, projectPath],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      clearTimeout(debounceRef.current);
      triggerSearch();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      clearResults();
    }
  };

  const handleMatchClick = (filePath: string, _lineNumber: number) => {
    openFile(filePath, true);
    // TODO: scroll to line once editor supports it
  };

  const relativePath = (filePath: string) => {
    if (!projectPath) return filePath;
    return filePath.startsWith(projectPath)
      ? filePath.slice(projectPath.length + 1)
      : filePath;
  };

  return (
    <div className="flex h-full flex-col">
      {/* Search Header */}
      <div className="flex h-6 items-center px-2 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/80">
        Search
      </div>

      {/* Search Input */}
      <div className="px-2 pb-2">
        <div className="flex items-center gap-0.5 rounded border bg-sidebar-accent/50 focus-within:ring-1 focus-within:ring-ring">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search"
            className="min-w-0 flex-1 bg-transparent px-2 py-1 text-xs text-sidebar-foreground placeholder:text-sidebar-foreground/40 focus:outline-none"
          />
          <ToggleButton
            active={isRegex}
            onClick={toggleRegex}
            title="Use Regular Expression"
          >
            <IconRegex className="size-3.5" />
          </ToggleButton>
          <ToggleButton
            active={isCaseSensitive}
            onClick={toggleCaseSensitive}
            title="Match Case"
          >
            <IconLetterCase className="size-3.5" />
          </ToggleButton>
          <ToggleButton
            active={isWholeWord}
            onClick={toggleWholeWord}
            title="Match Whole Word"
          >
            <IconAbc className="size-3.5" />
          </ToggleButton>
          <ToggleButton
            active={showFilters}
            onClick={toggleFilters}
            title="Toggle Search Details"
          >
            <IconFilter className="size-3.5" />
          </ToggleButton>
        </div>

        {/* Include/Exclude Filters */}
        {showFilters && (
          <div className="mt-1 space-y-1">
            <input
              type="text"
              value={includePattern}
              onChange={(e) => setIncludePattern(e.target.value)}
              placeholder="files to include (e.g. *.ts, src/**)"
              className="w-full rounded border bg-sidebar-accent/50 px-2 py-1 text-[11px] text-sidebar-foreground placeholder:text-sidebar-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <input
              type="text"
              value={excludePattern}
              onChange={(e) => setExcludePattern(e.target.value)}
              placeholder="files to exclude (e.g. node_modules, dist)"
              className="w-full rounded border bg-sidebar-accent/50 px-2 py-1 text-[11px] text-sidebar-foreground placeholder:text-sidebar-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        )}
      </div>

      {/* Status */}
      {totalMatches > 0 && (
        <div className="flex items-center justify-between px-2 pb-1">
          <span className="text-[11px] text-sidebar-foreground/60">
            {totalMatches} result{totalMatches !== 1 ? "s" : ""} in {totalFiles}{" "}
            file{totalFiles !== 1 ? "s" : ""}
          </span>
          <button
            onClick={clearResults}
            className="text-sidebar-foreground/40 hover:text-sidebar-foreground"
            title="Clear Search Results"
          >
            <IconX className="size-3.5" />
          </button>
        </div>
      )}

      {isSearching && (
        <div className="px-2 pb-1">
          <span className="text-[11px] text-sidebar-foreground/60">
            Searching...
          </span>
        </div>
      )}

      {/* Results Tree */}
      <div className="flex-1 overflow-auto">
        {/* File name matches */}
        {fileNameResults.length > 0 && (
          <div>
            <div className="flex h-[22px] items-center px-2 text-[10px] font-medium uppercase tracking-wide text-sidebar-foreground/50">
              File name matches
            </div>
            {fileNameResults.map((relPath) => {
              const fileName = relPath.split("/").pop() ?? relPath;
              const dirPath = relPath.includes("/")
                ? relPath.slice(0, relPath.lastIndexOf("/"))
                : "";
              return (
                <button
                  key={relPath}
                  onClick={() =>
                    openFile(
                      projectPath ? `${projectPath}/${relPath}` : relPath,
                      true,
                    )
                  }
                  className="flex h-[22px] w-full items-center gap-1 px-2 text-left hover:bg-sidebar-accent"
                >
                  <FileIcon fileName={fileName} className="size-4 shrink-0" />
                  <span className="truncate text-xs text-sidebar-foreground">
                    {fileName}
                  </span>
                  {dirPath && (
                    <span className="ml-auto truncate text-[10px] text-sidebar-foreground/40">
                      {dirPath}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Content matches */}
        {groupedResults.map((group) => (
          <FileGroupItem
            key={group.filePath}
            group={group}
            relativePath={relativePath}
            onToggle={() => toggleFileExpanded(group.filePath)}
            onMatchClick={handleMatchClick}
          />
        ))}

        {!isSearching && query && totalMatches === 0 && fileNameResults.length === 0 && (
          <div className="px-4 py-3 text-center text-xs text-sidebar-foreground/50">
            No results found
          </div>
        )}
      </div>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded transition-colors",
            active
              ? "bg-sidebar-foreground/20 text-sidebar-foreground"
              : "text-sidebar-foreground/40 hover:text-sidebar-foreground/70",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{title}</TooltipContent>
    </Tooltip>
  );
}

function FileGroupItem({
  group,
  relativePath,
  onToggle,
  onMatchClick,
}: {
  group: FileGroup;
  relativePath: (path: string) => string;
  onToggle: () => void;
  onMatchClick: (filePath: string, lineNumber: number) => void;
}) {
  const relPath = relativePath(group.filePath);
  const fileName = relPath.split("/").pop() ?? relPath;
  const dirPath = relPath.includes("/")
    ? relPath.slice(0, relPath.lastIndexOf("/"))
    : "";

  return (
    <div>
      {/* File Header */}
      <button
        onClick={onToggle}
        className="flex h-[22px] w-full items-center gap-1 px-2 text-left hover:bg-sidebar-accent"
      >
        {group.expanded ? (
          <IconChevronDown className="size-3 shrink-0 text-sidebar-foreground/60" />
        ) : (
          <IconChevronRight className="size-3 shrink-0 text-sidebar-foreground/60" />
        )}
        <FileIcon fileName={fileName} className="size-4 shrink-0" />
        <span className="truncate text-xs text-sidebar-foreground">
          {fileName}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          {dirPath && (
            <span className="truncate text-[10px] text-sidebar-foreground/40">
              {dirPath}
            </span>
          )}
          <span className="flex h-4 min-w-[18px] items-center justify-center rounded-full bg-sidebar-foreground/10 px-1.5 text-[10px] text-sidebar-foreground/60">
            {group.matches.length}
          </span>
        </span>
      </button>

      {/* Match Lines */}
      {group.expanded &&
        group.matches.map((match, i) => (
          <button
            key={`${match.line_number}-${match.match_start}-${i}`}
            onClick={() => onMatchClick(match.file_path, match.line_number)}
            className="flex h-[22px] w-full items-center gap-1.5 pl-7 pr-2 text-left hover:bg-sidebar-accent"
          >
            <span className="w-8 shrink-0 text-right text-[10px] text-sidebar-foreground/40">
              {match.line_number}
            </span>
            <HighlightedLine
              line={match.line_content}
              matchStart={match.match_start}
              matchEnd={match.match_end}
            />
          </button>
        ))}
    </div>
  );
}

function HighlightedLine({
  line,
  matchStart,
  matchEnd,
}: {
  line: string;
  matchStart: number;
  matchEnd: number;
}) {
  const trimmed = line.trimStart();
  const offset = line.length - trimmed.length;
  const start = Math.max(0, matchStart - offset);
  const end = Math.max(0, matchEnd - offset);

  const before = trimmed.slice(0, start);
  const match = trimmed.slice(start, end);
  const after = trimmed.slice(end);

  return (
    <span className="truncate text-xs">
      <span className="text-sidebar-foreground/70">{before}</span>
      <span className="rounded-sm bg-yellow-500/30 text-sidebar-foreground font-medium">
        {match}
      </span>
      <span className="text-sidebar-foreground/70">{after}</span>
    </span>
  );
}
