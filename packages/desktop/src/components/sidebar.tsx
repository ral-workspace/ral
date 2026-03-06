import { cn, Tooltip, TooltipContent, TooltipTrigger } from "@helm/ui";
import {
  IconFiles,
  IconSearch,
  IconGitBranch,
  IconPuzzle,
  IconChevronDown,
  IconChevronRight,
  IconFilePlus,
  IconFolderPlus,
  IconRefresh,
  IconFoldDown,
} from "@tabler/icons-react";
import { useCallback, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FileTree, type CreatingItem } from "./file-tree";
import { SearchView } from "./search-view";
import { useWorkspaceStore, useEditorStore, useLayoutStore } from "../stores";
import { isDocumentFile, isDbYamlFile } from "../lib/file-type";

interface SidebarProps {
  className?: string;
}

const activityItems = [
  { icon: IconFiles, label: "Explorer", id: "explorer" },
  { icon: IconSearch, label: "Search", id: "search" },
  { icon: IconGitBranch, label: "Source Control", id: "scm" },
  { icon: IconPuzzle, label: "Extensions", id: "extensions" },
];

export function Sidebar({ className }: SidebarProps) {
  const projectPath = useWorkspaceStore((s) => s.projectPath);
  const selectFolder = useWorkspaceStore((s) => s.selectFolder);
  const openFile = useEditorStore((s) => s.openFile);
  const openPreview = useEditorStore((s) => s.openPreview);
  const openDatabase = useEditorStore((s) => s.openDatabase);

  const handleFileOpen = useCallback(
    (path: string, pinned: boolean) => {
      if (isDbYamlFile(path)) {
        openDatabase(path);
      } else if (isDocumentFile(path)) {
        openPreview(path);
      } else {
        openFile(path, pinned);
      }
    },
    [openFile, openPreview, openDatabase],
  );

  const activeView = useLayoutStore((s) => s.sidebarView);
  const setSidebarView = useLayoutStore((s) => s.setSidebarView);
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [creatingItem, setCreatingItem] = useState<CreatingItem | null>(null);
  const fileTreeRefreshKey = useLayoutStore((s) => s.fileTreeRefreshKey);
  const [manualRefreshKey, setManualRefreshKey] = useState(0);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedIsDir, setSelectedIsDir] = useState(false);

  const folderName = projectPath?.split("/").pop() ?? null;

  const handleOpenFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      selectFolder(selected);
    }
  };

  return (
    <div
      className={cn(
        "flex h-full flex-col bg-sidebar text-sidebar-foreground",
        className,
      )}
    >
      {/* Activity Bar - horizontal icons */}
      <div className="flex h-10 items-center justify-center gap-0.5 px-2">
        {activityItems.map((item) => (
          <Tooltip key={item.id}>
            <TooltipTrigger asChild>
              <button
                onClick={() => setSidebarView(item.id)}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground",
                  activeView === item.id && "text-sidebar-foreground",
                )}
              >
                <item.icon className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{item.label}</TooltipContent>
          </Tooltip>
        ))}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="flex h-7 w-7 items-center justify-center rounded text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground"
            >
              <IconChevronDown className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">More Views</TooltipContent>
        </Tooltip>
      </div>

      {/* Sidebar Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {activeView === "explorer" && (
          <>
            {/* Explorer Section Header */}
            <div className="group/header flex h-6 items-center hover:bg-sidebar-accent">
              <button
                onClick={() => setExplorerOpen((v) => !v)}
                className="flex flex-1 items-center gap-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/80"
              >
                {explorerOpen ? (
                  <IconChevronDown className="size-3" />
                ) : (
                  <IconChevronRight className="size-3" />
                )}
                <span className="truncate">{folderName ?? "No Folder Opened"}</span>
              </button>
              {projectPath && (
                <div className="flex items-center gap-0.5 pr-2 opacity-0 group-hover/header:opacity-100">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => {
                          const parent = selectedIsDir && selectedPath ? selectedPath : projectPath!;
                          setCreatingItem({ parentPath: parent, type: "file" });
                          setExplorerOpen(true);
                        }}
                        className="flex size-4 items-center justify-center rounded text-sidebar-foreground/60 hover:text-sidebar-foreground"
                      >
                        <IconFilePlus className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">New File</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => {
                          const parent = selectedIsDir && selectedPath ? selectedPath : projectPath!;
                          setCreatingItem({ parentPath: parent, type: "folder" });
                          setExplorerOpen(true);
                        }}
                        className="flex size-4 items-center justify-center rounded text-sidebar-foreground/60 hover:text-sidebar-foreground"
                      >
                        <IconFolderPlus className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">New Folder</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setManualRefreshKey((k) => k + 1)}
                        className="flex size-4 items-center justify-center rounded text-sidebar-foreground/60 hover:text-sidebar-foreground"
                      >
                        <IconRefresh className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Refresh Explorer</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className="flex size-4 items-center justify-center rounded text-sidebar-foreground/60 hover:text-sidebar-foreground"
                      >
                        <IconFoldDown className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Collapse Folders</TooltipContent>
                  </Tooltip>
                </div>
              )}
            </div>

            {/* Explorer Content */}
            {explorerOpen && (
              projectPath ? (
                <div className="flex-1 overflow-auto">
                  <FileTree
                    rootPath={projectPath}
                    onFileOpen={handleFileOpen}
                    creatingItem={creatingItem}
                    onCreatingDone={() => setCreatingItem(null)}
                    selectedPath={selectedPath}
                    onSelect={(path, isDir) => {
                      setSelectedPath(path);
                      setSelectedIsDir(isDir);
                    }}
                    onRequestCreate={(parentPath, type) => {
                      setCreatingItem({ parentPath, type });
                      setExplorerOpen(true);
                    }}
                    refreshCounter={fileTreeRefreshKey + manualRefreshKey}
                  />
                </div>
              ) : (
                <div className="flex-1 overflow-auto px-5 py-4">
                  <p className="text-[13px] leading-relaxed text-sidebar-foreground/80">
                    You have not yet opened a folder.
                  </p>

                  <button
                    onClick={handleOpenFolder}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-sm bg-[#0078d4] px-3 py-[5px] text-[13px] text-white hover:bg-[#006cbd]"
                  >
                    Open Folder
                  </button>

                  <p className="mt-4 text-[13px] leading-relaxed text-sidebar-foreground/80">
                    You can clone a repository locally.
                  </p>

                  <button className="mt-3 flex w-full items-center justify-center gap-2 rounded-sm border border-sidebar-border bg-transparent px-3 py-[5px] text-[13px] text-[#3794ff] hover:bg-sidebar-accent">
                    Clone Repository
                  </button>
                </div>
              )
            )}

            {/* Bottom Collapsible Sections */}
            <div className="border-t border-sidebar-border">
              <button
                onClick={() => setTimelineOpen((v) => !v)}
                className="flex h-[22px] w-full items-center gap-1 px-2 text-[11px] font-semibold text-sidebar-foreground/80 hover:bg-sidebar-accent"
              >
                {timelineOpen ? (
                  <IconChevronDown className="size-3" />
                ) : (
                  <IconChevronRight className="size-3" />
                )}
                Timeline
              </button>
              <button
                onClick={() => setOutlineOpen((v) => !v)}
                className="flex h-[22px] w-full items-center gap-1 px-2 text-[11px] font-semibold text-sidebar-foreground/80 hover:bg-sidebar-accent"
              >
                {outlineOpen ? (
                  <IconChevronDown className="size-3" />
                ) : (
                  <IconChevronRight className="size-3" />
                )}
                Outline
              </button>
            </div>
          </>
        )}

        {activeView === "search" && <SearchView />}
      </div>
    </div>
  );
}
