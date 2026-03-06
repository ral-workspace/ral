import { cn, FlickeringGrid } from "@helm/ui";
import { useEditorStore } from "../stores";
import { isImageFile } from "../lib/file-type";
import { BROWSER_TAB_PREFIX, PREVIEW_TAB_PREFIX, DATABASE_TAB_PREFIX } from "../types/editor";
import { TabBar } from "./tab-bar";
import { CodeMirrorEditor } from "./codemirror-editor";
import { DiffEditor } from "./diff-editor";
import { DatabaseViewer } from "./database-viewer";
import { DocumentViewer } from "./document-viewer";
import { ImagePreview } from "./image-preview";
import { SettingsEditor } from "./settings-editor";
import { SimpleBrowser } from "./simple-browser";

interface EditorAreaProps {
  className?: string;
}

export function EditorArea({ className }: EditorAreaProps) {
  const openTabs = useEditorStore((s) => s.openTabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const activeTab = openTabs.find((t) => t.id === activeTabId) ?? null;

  if (openTabs.length === 0) {
    return (
      <div className={cn("relative flex h-full flex-col bg-background", className)}>
        <FlickeringGrid
          className="absolute inset-0 z-0"
          style={{ maskImage: "linear-gradient(to bottom, transparent 0%, black 66%)" }}
          squareSize={4}
          gridGap={6}
          color="rgb(96, 165, 250)"
          maxOpacity={0.15}
          flickerChance={0.1}
        />
        <div className="relative z-10 flex flex-1 items-center justify-center">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-semibold text-foreground/80">Helm</h2>
            <p className="text-sm text-muted-foreground">
              Open a file or start a conversation
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex h-full flex-col bg-background", className)}>
      <TabBar />
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
        ) : activeTabId ? (
          <CodeMirrorEditor key={activeTabId} filePath={activeTabId} />
        ) : null}
      </div>
    </div>
  );
}
