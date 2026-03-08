import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  Toaster,
  TooltipProvider,
} from "@helm/ui";
import { useWorkspaceStore, useLayoutStore, useEditorStore, useSettingsStore, useIconThemeStore, useACPStore } from "./stores";
import { invalidateBufferCache } from "./hooks/use-codemirror";
import { findGroupIds } from "./stores/editor-store";
import { Sidebar } from "./components/sidebar";
import { EditorArea } from "./components/editor-area";
import { TerminalPanel, AiPanel } from "./components/panel";
import { WelcomeScreen } from "./components/welcome-screen";
import { Titlebar } from "./components/titlebar";
import { CommandPalette } from "./components/command-palette";
import { QuickOpen } from "./components/quick-open";
import { GoToLine } from "./components/go-to-line";
import { getCommands } from "./lib/commands";

function App() {
  const projectPath = useWorkspaceStore((s) => s.projectPath);
  const showSidebar = useLayoutStore((s) => s.showSidebar);
  const showBottomPanel = useLayoutStore((s) => s.showBottomPanel);
  const showSidePanel = useLayoutStore((s) => s.showSidePanel);
  const hasOpenTabs = useEditorStore((s) => {
    for (const group of s.groups.values()) {
      if (group.openTabs.length > 0) return true;
    }
    return false;
  });
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [quickOpenOpen, setQuickOpenOpen] = useState(false);
  const [goToLineOpen, setGoToLineOpen] = useState(false);

  useEffect(() => {
    useWorkspaceStore.getState()._loadRecentProjects();
    useSettingsStore.getState()._initSettings();
    useIconThemeStore.getState()._initIconTheme();
    useACPStore.getState()._init();
    useEditorStore.getState()._restoreLayout();
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

  // Command Palette: Cmd+Shift+P, Search: Cmd+Shift+F
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setCommandPaletteOpen((v) => !v);
      }
      // Cmd+P to open Quick Open
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setQuickOpenOpen((v) => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        useLayoutStore.getState().setSidebarView("search");
      }
      // Ctrl+Shift+` to create new terminal
      if (e.ctrlKey && e.shiftKey && e.key === "`") {
        e.preventDefault();
        const { run } = getCommands().find((c) => c.id === "workbench.action.terminal.new") ?? {};
        run?.();
      }
      // Ctrl+G to go to line
      if (e.ctrlKey && !e.shiftKey && !e.metaKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        setGoToLineOpen((v) => !v);
      }
      // Cmd+\ to split editor right
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        const { activeGroupId, splitGroup } = useEditorStore.getState();
        splitGroup(activeGroupId, "horizontal");
      }
      // Cmd+1/2/3 to focus pane by index
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && ["1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(e.key)) {
        const idx = parseInt(e.key) - 1;
        const { splitRoot, setActiveGroup } = useEditorStore.getState();
        const groupIds = findGroupIds(splitRoot);
        if (groupIds.length > 1 && idx < groupIds.length) {
          e.preventDefault();
          setActiveGroup(groupIds[idx]);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const showEditor = hasOpenTabs || projectPath;

  return (
    <TooltipProvider delayDuration={400}>
    <div className="flex h-full w-full flex-col overflow-hidden">
      <Titlebar />
      <div className="flex flex-1 overflow-hidden">
        {/* Main Content */}
        <ResizablePanelGroup orientation="horizontal" className="flex-1">
          {/* Sidebar (File Tree) */}
          {showSidebar && (
            <>
              <ResizablePanel defaultSize="22%" minSize="18%" maxSize="35%">
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
              <ResizablePanel defaultSize="40%" minSize="30%" maxSize="50%">
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
      <QuickOpen
        open={quickOpenOpen}
        onClose={() => setQuickOpenOpen(false)}
      />
      <GoToLine
        open={goToLineOpen}
        onClose={() => setGoToLineOpen(false)}
      />
    </div>
    <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}

export default App;
