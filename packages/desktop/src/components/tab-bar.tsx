import { useCallback, useRef, useState } from "react";
import { cn } from "@helm/ui";
import { IconX, IconSettings, IconWorldWww, IconFileDiff, IconPresentation, IconTable } from "@tabler/icons-react";
import { useEditorStore, useWorkspaceStore } from "../stores";
import type { OpenTab, EditorGroup } from "../types/editor";
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

interface TabBarProps {
  groupId: string;
}

export function TabBar({ groupId }: TabBarProps) {
  const group = useEditorStore(
    useCallback((s) => s.groups.get(groupId), [groupId]),
  ) as EditorGroup | undefined;
  const dirtyFiles = useEditorStore((s) => s.dirtyFiles);
  const selectTabInGroup = useEditorStore((s) => s.selectTabInGroup);
  const closeTabInGroup = useEditorStore((s) => s.closeTabInGroup);
  const closeOtherTabsInGroup = useEditorStore((s) => s.closeOtherTabsInGroup);
  const closeTabsToTheRightInGroup = useEditorStore((s) => s.closeTabsToTheRightInGroup);
  const closeSavedTabsInGroup = useEditorStore((s) => s.closeSavedTabsInGroup);
  const closeAllTabsInGroup = useEditorStore((s) => s.closeAllTabsInGroup);
  const pinTabInGroup = useEditorStore((s) => s.pinTabInGroup);
  const moveTabInGroup = useEditorStore((s) => s.moveTabInGroup);
  const moveTabToGroup = useEditorStore((s) => s.moveTabToGroup);
  const splitGroup = useEditorStore((s) => s.splitGroup);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const tabRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  const openTabs = group?.openTabs ?? [];
  const activeTabId = group?.activeTabId ?? null;

  const getDropSide = useCallback((e: React.DragEvent, tab: HTMLElement): DropSide => {
    const rect = tab.getBoundingClientRect();
    return (e.clientX - rect.left) <= rect.width / 2 ? "left" : "right";
  }, []);

  const handleDragStart = useCallback(
    (e: React.DragEvent, index: number, tabId: string) => {
      setDragIndex(index);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(index));
      e.dataTransfer.setData("application/helm-tab", JSON.stringify({ groupId, tabId }));
      const tab = tabRefs.current.get(index);
      if (tab) {
        e.dataTransfer.setDragImage(tab, 0, 0);
      }
    },
    [groupId],
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

      const side = getDropSide(e, e.currentTarget as HTMLElement);
      let targetIndex = side === "right" ? index + 1 : index;

      // Check for cross-group tab transfer
      const helmTabData = e.dataTransfer.getData("application/helm-tab");
      if (helmTabData) {
        try {
          const { groupId: sourceGroupId, tabId } = JSON.parse(helmTabData);
          if (sourceGroupId !== groupId) {
            moveTabToGroup(sourceGroupId, groupId, tabId, targetIndex);
            setDragIndex(null);
            setDropTarget(null);
            return;
          }
        } catch { /* ignore parse errors */ }
      }

      // Same-group reorder
      if (dragIndex === null) return;
      if (dragIndex < targetIndex) {
        targetIndex--;
      }

      if (dragIndex !== targetIndex) {
        moveTabInGroup(groupId, dragIndex, targetIndex);
      }
      setDragIndex(null);
      setDropTarget(null);
    },
    [dragIndex, groupId, moveTabInGroup, moveTabToGroup, getDropSide],
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDropTarget(null);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
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
        { type: "separator" },
        { type: "item", id: "split-right", label: "Split Right" },
        { type: "item", id: "split-down", label: "Split Down" },
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
            closeTabInGroup(groupId, tab.id);
            break;
          case "close-others":
            closeOtherTabsInGroup(groupId, tab.id);
            break;
          case "close-right":
            closeTabsToTheRightInGroup(groupId, tab.id);
            break;
          case "close-saved":
            closeSavedTabsInGroup(groupId);
            break;
          case "close-all":
            closeAllTabsInGroup(groupId);
            break;
          case "split-right":
            splitGroup(groupId, "horizontal");
            break;
          case "split-down":
            splitGroup(groupId, "vertical");
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
    [openTabs, groupId, closeTabInGroup, closeOtherTabsInGroup, closeTabsToTheRightInGroup, closeSavedTabsInGroup, closeAllTabsInGroup, splitGroup],
  );

  const handleAuxClick = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      if (e.button === 1) {
        e.preventDefault();
        closeTabInGroup(groupId, tabId);
      }
    },
    [groupId, closeTabInGroup],
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
            onDragStart={(e) => handleDragStart(e, index, tab.id)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            onClick={() => selectTabInGroup(groupId, tab.id)}
            onDoubleClick={() => pinTabInGroup(groupId, tab.id)}
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
            {showLeftIndicator && (
              <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary z-20" />
            )}
            {showRightIndicator && (
              <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-primary z-20" />
            )}
            {getTabIcon(tab)}
            <span className={cn(!tab.pinned && "italic")}>{tab.name}</span>
            {dirtyFiles.has(tab.id) ? (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  closeTabInGroup(groupId, tab.id);
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
                  closeTabInGroup(groupId, tab.id);
                }}
                className="ml-1 flex size-4 items-center justify-center rounded opacity-0 hover:bg-foreground/10 group-hover:opacity-100"
              >
                <IconX className="size-3" />
              </span>
            )}
          </button>
        );
      })}
      <div className="absolute bottom-0 left-0 right-0 z-0 h-px bg-border" />
    </div>
  );
}
