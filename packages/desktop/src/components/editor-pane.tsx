import { useCallback } from "react";
import { cn } from "@helm/ui";
import { useEditorStore } from "../stores";
import { isImageFile } from "../lib/file-type";
import { BROWSER_TAB_PREFIX, PREVIEW_TAB_PREFIX, DATABASE_TAB_PREFIX } from "../types/editor";
import type { EditorGroup } from "../types/editor";
import { TabBar } from "./tab-bar";
import { CodeMirrorEditor } from "./codemirror-editor";
import { DiffEditor } from "./diff-editor";
import { DatabaseViewer } from "./database-viewer";
import { DocumentViewer } from "./document-viewer";
import { ImagePreview } from "./image-preview";
import { SettingsEditor } from "./settings-editor";
import { SimpleBrowser } from "./simple-browser";

interface EditorPaneProps {
  groupId: string;
  className?: string;
}

export function EditorPane({ groupId, className }: EditorPaneProps) {
  const group = useEditorStore(
    useCallback((s) => s.groups.get(groupId), [groupId]),
  ) as EditorGroup | undefined;
  const activeGroupId = useEditorStore((s) => s.activeGroupId);
  const setActiveGroup = useEditorStore((s) => s.setActiveGroup);

  const handleFocus = useCallback(() => {
    if (activeGroupId !== groupId) {
      setActiveGroup(groupId);
    }
  }, [activeGroupId, groupId, setActiveGroup]);

  if (!group) return null;

  const activeTab = group.openTabs.find((t) => t.id === group.activeTabId) ?? null;
  const isActive = activeGroupId === groupId;

  if (group.openTabs.length === 0) {
    return (
      <div
        className={cn("flex h-full flex-col bg-background", className)}
        onMouseDown={handleFocus}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex h-full flex-col bg-background",
        !isActive && "opacity-90",
        className,
      )}
      onMouseDown={handleFocus}
    >
      <TabBar groupId={groupId} />
      <div className="flex-1 overflow-hidden">
        {activeTab?.type === "settings" ? (
          <SettingsEditor />
        ) : activeTab?.type === "diff" ? (
          <DiffEditor key={activeTab.id} tabId={activeTab.id} />
        ) : activeTab?.type === "browser" ? (
          <SimpleBrowser
            key={activeTab.id}
            initialUrl={activeTab.id.slice(BROWSER_TAB_PREFIX.length)}
          />
        ) : activeTab?.type === "database" ? (
          <DatabaseViewer
            key={activeTab.id}
            tabId={activeTab.id}
            filePath={activeTab.id.slice(DATABASE_TAB_PREFIX.length)}
          />
        ) : activeTab?.type === "preview" ? (
          <DocumentViewer
            key={activeTab.id}
            filePath={activeTab.id.slice(PREVIEW_TAB_PREFIX.length)}
          />
        ) : activeTab && isImageFile(activeTab.id) ? (
          <ImagePreview filePath={activeTab.id} />
        ) : activeTab ? (
          <CodeMirrorEditor key={activeTab.id} filePath={activeTab.id} />
        ) : null}
      </div>
    </div>
  );
}
