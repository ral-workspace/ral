import { useEffect, useState } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  Toaster,
  TooltipProvider,
} from "@ral/ui";
import {
  useWorkspaceStore,
  useLayoutStore,
  useEditorStore,
} from "./stores";
import { bootstrap } from "./app/bootstrap";
import { registerMenuHandlers } from "./app/menu-handlers";
import { registerKeyboardShortcuts } from "./app/keyboard-shortcuts";
import { registerOpenProjectListener, startFileWatcher } from "./app/window-events";
import { Sidebar } from "./components/sidebar";
import { EditorArea } from "./components/editor-area";
import { TerminalPanel, AiPanel } from "./components/panel";
import { WelcomeScreen } from "./components/welcome-screen";
import { Titlebar } from "./components/titlebar";
import { CommandPalette } from "./components/command-palette";
import { QuickOpen } from "./components/quick-open";
import { GoToLine } from "./components/go-to-line";

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

  // Bootstrap: load stores, restore layout, dismiss splash
  useEffect(() => {
    bootstrap();
  }, []);

  // CLI / single-instance: open project from 'ral /path'
  useEffect(() => {
    return registerOpenProjectListener();
  }, []);

  // Menu events from native menu bar
  useEffect(() => {
    return registerMenuHandlers(() => setCommandPaletteOpen(true));
  }, []);

  // File watcher: start/stop on projectPath change
  useEffect(() => {
    if (!projectPath) return;
    return startFileWatcher(projectPath);
  }, [projectPath]);

  // Global keyboard shortcuts
  useEffect(() => {
    return registerKeyboardShortcuts({
      toggleCommandPalette: () => setCommandPaletteOpen((v) => !v),
      toggleQuickOpen: () => setQuickOpenOpen((v) => !v),
      toggleGoToLine: () => setGoToLineOpen((v) => !v),
    });
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
                <ResizablePanel
                  defaultSize="22%"
                  minSize="180px"
                  maxSize="350px"
                >
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
                <ResizablePanel
                  defaultSize="40%"
                  minSize="350px"
                  maxSize="500px"
                >
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
        <GoToLine open={goToLineOpen} onClose={() => setGoToLineOpen(false)} />
      </div>
      <Toaster position="bottom-right" richColors />
    </TooltipProvider>
  );
}

export default App;
