import { useCallback, useRef, useState } from "react";
import { cn } from "@helm/ui";
import { IconX, IconSettings, IconWorldWww, IconFileDiff, IconPresentation, IconTable } from "@tabler/icons-react";
import { useEditorStore, useWorkspaceStore } from "../stores";
import type { OpenTab } from "../types/editor";
import { FileIcon } from "./file-icon";
import { type NativeMenuItem, showNativeContextMenu } from "../lib/native-context-menu";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

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
  if (tab.type === "preview")
    return (
      <IconPresentation className="size-3.5 shrink-0 text-muted-foreground" />
    );
  if (tab.type === "database")
    return (
      <IconTable className="size-3.5 shrink-0 text-muted-foreground" />
    );
  return <FileIcon fileName={tab.name} className="size-3.5 shrink-0" />;
}

type DropSide = "left" | "right";

interface DropTarget {
  index: number;
  side: DropSide;
}

export function TabBar() {
  const openTabs = useEditorStore((s) => s.openTabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const dirtyFiles = useEditorStore((s) => s.dirtyFiles);
  const selectTab = useEditorStore((s) => s.selectTab);
  const closeTab = useEditorStore((s) => s.closeTab);
  const closeOtherTabs = useEditorStore((s) => s.closeOtherTabs);
  const closeTabsToTheRight = useEditorStore((s) => s.closeTabsToTheRight);
  const closeSavedTabs = useEditorStore((s) => s.closeSavedTabs);
  const closeAllTabs = useEditorStore((s) => s.closeAllTabs);
  const pinTab = useEditorStore((s) => s.pinTab);
  const moveTab = useEditorStore((s) => s.moveTab);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const tabRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  const getDropSide = useCallback((e: React.DragEvent, tab: HTMLElement): DropSide => {
    const rect = tab.getBoundingClientRect();
    return (e.clientX - rect.left) <= rect.width / 2 ? "left" : "right";
  }, []);

  const handleDragStart = useCallback(
    (e: React.DragEvent, index: number) => {
      setDragIndex(index);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(index));
      // Use the tab element itself as drag image (like VS Code)
      const tab = tabRefs.current.get(index);
      if (tab) {
        e.dataTransfer.setDragImage(tab, 0, 0);
      }
    },
    [],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const side = getDropSide(e, e.currentTarget as HTMLElement);
      setDropTarget({ index, side });
    },
    [getDropSide],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (dragIndex === null) return;

      const side = getDropSide(e, e.currentTarget as HTMLElement);
      // Compute target index based on which side of the tab we dropped on
      let targetIndex = side === "right" ? index + 1 : index;
      // Adjust for the removed source element
      if (dragIndex < targetIndex) {
        targetIndex--;
      }

      if (dragIndex !== targetIndex) {
        moveTab(dragIndex, targetIndex);
      }
      setDragIndex(null);
      setDropTarget(null);
    },
    [dragIndex, moveTab, getDropSide],
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDropTarget(null);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if leaving the tab bar entirely
    const related = e.relatedTarget as HTMLElement | null;
    if (!related || !e.currentTarget.contains(related)) {
      setDropTarget(null);
    }
  }, []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, tab: OpenTab, index: number) => {
      e.preventDefault();
      e.stopPropagation();

      const isLast = index === openTabs.length - 1;
      const items: NativeMenuItem[] = [
        { type: "item", id: "close", label: "Close" },
        { type: "item", id: "close-others", label: "Close Others", disabled: openTabs.length <= 1 },
        { type: "item", id: "close-right", label: "Close to the Right", disabled: isLast },
        { type: "item", id: "close-saved", label: "Close Saved" },
        { type: "item", id: "close-all", label: "Close All" },
      ];

      if (tab.type === "file") {
        items.push(
          { type: "separator" },
          { type: "item", id: "copy-path", label: "Copy Path" },
          { type: "item", id: "copy-relative-path", label: "Copy Relative Path" },
        );
      }

      showNativeContextMenu(items).then((actionId) => {
        if (!actionId) return;
        switch (actionId) {
          case "close":
            closeTab(tab.id);
            break;
          case "close-others":
            closeOtherTabs(tab.id);
            break;
          case "close-right":
            closeTabsToTheRight(tab.id);
            break;
          case "close-saved":
            closeSavedTabs();
            break;
          case "close-all":
            closeAllTabs();
            break;
          case "copy-path":
            writeText(tab.id);
            break;
          case "copy-relative-path": {
            const root = useWorkspaceStore.getState().projectPath ?? "";
            const relative = root && tab.id.startsWith(root + "/")
              ? tab.id.slice(root.length + 1)
              : tab.id;
            writeText(relative);
            break;
          }
        }
      });
    },
    [openTabs, closeTab, closeOtherTabs, closeTabsToTheRight, closeSavedTabs, closeAllTabs],
  );

  // Middle-click to close tab (like VS Code)
  const handleAuxClick = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      if (e.button === 1) {
        e.preventDefault();
        closeTab(tabId);
      }
    },
    [closeTab],
  );

  return (
    <div
      className="relative flex h-9 items-center overflow-x-auto scrollbar-none"
      onDragLeave={handleDragLeave}
    >
      {openTabs.map((tab, index) => {
        const isDragging = dragIndex === index;
        const showLeftIndicator = dropTarget?.index === index && dropTarget.side === "left" && dragIndex !== index && dragIndex !== index - 1;
        const showRightIndicator = dropTarget?.index === index && dropTarget.side === "right" && dragIndex !== index && dragIndex !== index + 1;

        return (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) tabRefs.current.set(index, el);
              else tabRefs.current.delete(index);
            }}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            onClick={() => selectTab(tab.id)}
            onDoubleClick={() => pinTab(tab.id)}
            onContextMenu={(e) => handleContextMenu(e, tab, index)}
            onAuxClick={(e) => handleAuxClick(e, tab.id)}
            className={cn(
              "group relative z-10 flex h-full items-center gap-1.5 border-r px-3 text-[12px] shrink-0 transition-opacity",
              activeTabId === tab.id
                ? "bg-background text-foreground"
                : "bg-muted/30 text-muted-foreground hover:bg-muted/50",
              isDragging && "opacity-40",
            )}
          >
            {/* Drop indicator - left */}
            {showLeftIndicator && (
              <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary z-20" />
            )}
            {/* Drop indicator - right */}
            {showRightIndicator && (
              <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-primary z-20" />
            )}
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
        );
      })}
      {/* Border line behind tabs — active tab covers it */}
      <div className="absolute bottom-0 left-0 right-0 z-0 h-px bg-border" />
    </div>
  );
}
