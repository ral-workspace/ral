import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@helm/ui";
import { useWorkspaceStore, useLayoutStore, useEditorStore, useSettingsStore, useIconThemeStore, useACPStore } from "./stores";
import { invalidateBufferCache } from "./hooks/use-codemirror";
import { Sidebar } from "./components/sidebar";
import { EditorArea } from "./components/editor-area";
import { TerminalPanel, AiPanel } from "./components/panel";
import { WelcomeScreen } from "./components/welcome-screen";
import { Titlebar } from "./components/titlebar";
import { CommandPalette } from "./components/command-palette";

function App() {
  const projectPath = useWorkspaceStore((s) => s.projectPath);
  const showSidebar = useLayoutStore((s) => s.showSidebar);
  const showBottomPanel = useLayoutStore((s) => s.showBottomPanel);
  const showSidePanel = useLayoutStore((s) => s.showSidePanel);
  const hasOpenTabs = useEditorStore((s) => s.openTabs.length > 0);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  useEffect(() => {
    useWorkspaceStore.getState()._loadRecentProjects();
    useSettingsStore.getState()._initSettings();
    useIconThemeStore.getState()._initIconTheme();
    useACPStore.getState()._init();
  }, []);

  // File watcher: start/stop on projectPath change
  useEffect(() => {
    if (!projectPath) return;

    invoke("start_file_watcher", { path: projectPath }).catch((err) =>
      console.error("Failed to start file watcher:", err),
    );

    const unlisten = listen<string>("file-changed", (event) => {
      const changedPath = event.payload;
      // Invalidate buffer cache so re-opening the file fetches fresh content
      invalidateBufferCache(changedPath);
      // Bump version so components can react to external changes
      useEditorStore.getState().bumpFileVersion(changedPath);
      // Refresh file tree so new/deleted files appear
      useLayoutStore.getState().bumpFileTreeRefresh();
    });

    return () => {
      invoke("stop_file_watcher").catch(() => {});
      unlisten.then((fn) => fn());
    };
  }, [projectPath]);

  // Command Palette: Cmd+Shift+P
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setCommandPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const showEditor = hasOpenTabs || projectPath;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <Titlebar />
      <div className="flex flex-1 overflow-hidden">
        {/* Main Content */}
        <ResizablePanelGroup orientation="horizontal" className="flex-1">
          {/* Sidebar (File Tree) */}
          {showSidebar && (
            <>
              <ResizablePanel defaultSize="20%" minSize="15%" maxSize="35%">
                <Sidebar />
              </ResizablePanel>
              <ResizableHandle />
            </>
          )}

          {/* Center: Editor + Terminal */}
          <ResizablePanel defaultSize="100%" minSize="30%">
            <div className="flex h-full flex-col">
              <div className="flex-1 overflow-hidden">
                {showBottomPanel ? (
                  <ResizablePanelGroup orientation="vertical">
                    <ResizablePanel defaultSize="70%" minSize="30%">
                      {showEditor ? <EditorArea /> : <WelcomeScreen />}
                    </ResizablePanel>

                    <ResizableHandle />

                    <ResizablePanel defaultSize="30%" minSize="15%">
                      <TerminalPanel />
                    </ResizablePanel>
                  </ResizablePanelGroup>
                ) : showEditor ? (
                  <EditorArea />
                ) : (
                  <WelcomeScreen />
                )}
              </div>
            </div>
          </ResizablePanel>

          {/* Right: AI Chat Panel */}
          {showSidePanel && (
            <>
              <ResizableHandle />
              <ResizablePanel defaultSize="40%" minSize="20%" maxSize="50%">
                <AiPanel />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />
    </div>
  );
}

export default App;
