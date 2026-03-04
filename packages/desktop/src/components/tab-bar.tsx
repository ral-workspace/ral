import { cn } from "@helm/ui";
import { IconX, IconSettings, IconWorldWww, IconFileDiff } from "@tabler/icons-react";
import { useEditorStore } from "../stores";
import type { OpenTab } from "../types/editor";
import { FileIcon } from "./file-icon";

function getTabIcon(tab: OpenTab) {
  if (tab.type === "settings")
    return (
      <IconSettings className="size-3.5 shrink-0 text-muted-foreground" />
    );
  if (tab.type === "browser")
    return (
      <IconWorldWww className="size-3.5 shrink-0 text-muted-foreground" />
    );
  if (tab.type === "diff")
    return (
      <IconFileDiff className="size-3.5 shrink-0 text-muted-foreground" />
    );
  return <FileIcon fileName={tab.name} className="size-3.5 shrink-0" />;
}

export function TabBar() {
  const openTabs = useEditorStore((s) => s.openTabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const dirtyFiles = useEditorStore((s) => s.dirtyFiles);
  const selectTab = useEditorStore((s) => s.selectTab);
  const closeTab = useEditorStore((s) => s.closeTab);
  const pinTab = useEditorStore((s) => s.pinTab);

  return (
    <div className="relative flex h-9 items-center overflow-x-auto scrollbar-none">
      {openTabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => selectTab(tab.id)}
          onDoubleClick={() => pinTab(tab.id)}
          className={cn(
            "group relative z-10 flex h-full items-center gap-1.5 border-r px-3 text-[12px] shrink-0",
            activeTabId === tab.id
              ? "bg-background text-foreground"
              : "bg-muted/30 text-muted-foreground hover:bg-muted/50",
          )}
        >
          {getTabIcon(tab)}
          <span className={cn(!tab.pinned && "italic")}>{tab.name}</span>
          {dirtyFiles.has(tab.id) ? (
            <span
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              className="ml-1 flex size-4 items-center justify-center rounded group-hover:opacity-100"
            >
              <span className="size-2 rounded-full bg-foreground/60 group-hover:hidden" />
              <IconX className="hidden size-3 group-hover:block" />
            </span>
          ) : (
            <span
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              className="ml-1 flex size-4 items-center justify-center rounded opacity-0 hover:bg-foreground/10 group-hover:opacity-100"
            >
              <IconX className="size-3" />
            </span>
          )}
        </button>
      ))}
      {/* Border line behind tabs — active tab covers it */}
      <div className="absolute bottom-0 left-0 right-0 z-0 h-px bg-border" />
    </div>
  );
}
