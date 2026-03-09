import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  Toaster,
  TooltipProvider,
} from "@helm/ui";
import {
  useWorkspaceStore,
  useLayoutStore,
  useEditorStore,
  useSettingsStore,
  useIconThemeStore,
  useACPStore,
  usePluginStore,
} from "./stores";
import { invalidateBufferCache, getActiveEditorView, getBufferContent } from "./hooks/use-codemirror";
import { findGroupIds } from "./stores/editor-store";
import { addHistoryEntry } from "./services/history-service";
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
    const init = async () => {
      const isMainWindow = getCurrentWindow().label === "main";
      if (!isMainWindow) {
        useLayoutStore.setState({ showSidebar: false });
      }
      await Promise.all([
        useWorkspaceStore.getState()._loadRecentProjects(isMainWindow),
        useSettingsStore.getState()._initSettings(),
        useIconThemeStore.getState()._initIconTheme(),
        useACPStore.getState()._init(),
        // Only restore editor layout for the main window; new windows start empty
        isMainWindow ? useEditorStore.getState()._restoreLayout() : Promise.resolve(),
        new Promise((r) => setTimeout(r, 2000)),
      ]);

      // Install built-in plugins on first launch
      usePluginStore.getState().bootstrapBuiltins().catch(() => {});

      // Show window and fade out splash screen
      await getCurrentWindow().show();
      const splash = document.getElementById("splash");
      if (splash) {
        splash.classList.add("hidden");
        splash.addEventListener("transitionend", () => splash.remove());
      }
    };
    init();
  }, []);

  // Menu events from native menu bar
  useEffect(() => {
    const unlisteners = [
      listen("menu-open-folder", async () => {
        const selected = await open({ directory: true, multiple: false });
        if (selected) {
          useWorkspaceStore.getState().selectFolder(selected);
        }
      }),
      listen("menu-new-file", () => {
        const projectPath = useWorkspaceStore.getState().projectPath;
        if (projectPath) {
          invoke("create_file", { path: `${projectPath}/Untitled` })
            .then(() => {
              useEditorStore.getState().openFile(`${projectPath}/Untitled`, false);
              useLayoutStore.getState().bumpFileTreeRefresh();
            })
            .catch(() => {});
        }
      }),
      listen("menu-save", () => {
        const view = getActiveEditorView();
        const { activeTabId, groups, activeGroupId } = useEditorStore.getState();
        const group = groups.get(activeGroupId);
        const activeTab = group?.openTabs.find((t) => t.id === activeTabId);
        if (view && activeTab?.type === "file" && activeTabId) {
          const doc = view.state.doc.toString();
          invoke("write_file", { path: activeTabId, content: doc })
            .then(() => {
              useEditorStore.getState().markClean(activeTabId);
              const s = useSettingsStore.getState().settings;
              if (s["history.enabled"]) {
                addHistoryEntry(activeTabId, doc, "save", s["history.maxEntries"], s["history.maxFileSize"]).catch(() => {});
              }
            })
            .catch((err: unknown) => console.error("Save failed:", err));
        }
      }),
      listen("menu-save-as", async () => {
        const view = getActiveEditorView();
        const { activeTabId } = useEditorStore.getState();
        if (view && activeTabId) {
          const doc = view.state.doc.toString();
          const dest = await save({ defaultPath: activeTabId });
          if (dest) {
            invoke("write_file", { path: dest, content: doc })
              .then(() => {
                useEditorStore.getState().openFile(dest, true);
                useEditorStore.getState().markClean(dest);
              })
              .catch((err: unknown) => console.error("Save As failed:", err));
          }
        }
      }),
      listen("menu-save-all", () => {
        const { dirtyFiles, activeTabId, markClean } = useEditorStore.getState();
        const s = useSettingsStore.getState().settings;
        const view = getActiveEditorView();
        for (const filePath of dirtyFiles) {
          // Active tab: get content from the live EditorView; others: from buffer cache
          const content = (filePath === activeTabId && view)
            ? view.state.doc.toString()
            : getBufferContent(filePath);
          if (content === null) continue;
          invoke("write_file", { path: filePath, content })
            .then(() => {
              markClean(filePath);
              if (s["history.enabled"]) {
                addHistoryEntry(filePath, content, "save", s["history.maxEntries"], s["history.maxFileSize"]).catch(() => {});
              }
            })
            .catch((err: unknown) => console.error(`Save All failed for ${filePath}:`, err));
        }
      }),
      listen("menu-auto-save", () => {
        const s = useSettingsStore.getState();
        const current = s.settings["files.autoSave"];
        s.updateSettings({ "files.autoSave": !current });
        // Update native menu checkbox state
        const { recentProjects } = useWorkspaceStore.getState();
        invoke("update_recent_menu", { paths: recentProjects, autoSave: !current }).catch(() => {});
      }),
      listen("menu-revert-file", () => {
        const { activeTabId } = useEditorStore.getState();
        if (activeTabId) {
          invoke<string>("read_file", { path: activeTabId })
            .then((content) => {
              const view = getActiveEditorView();
              if (view) {
                view.dispatch({
                  changes: { from: 0, to: view.state.doc.length, insert: content },
                });
                useEditorStore.getState().markClean(activeTabId);
              }
            })
            .catch((err: unknown) => console.error("Revert failed:", err));
        }
      }),
      listen("menu-close-editor", () => {
        const { activeTabId, closeTab } = useEditorStore.getState();
        if (activeTabId) closeTab(activeTabId);
      }),
      listen("menu-close-folder", () => {
        useWorkspaceStore.setState({ projectPath: null });
        useEditorStore.getState().closeAllTabs();
      }),
      listen("menu-command-palette", () => {
        setCommandPaletteOpen(true);
      }),
      listen<string>("menu-zoom", (event) => {
        // Use document zoom via CSS transform as a simple cross-platform approach
        const root = document.documentElement;
        const current = parseFloat(root.style.getPropertyValue("--zoom") || "1");
        let next = current;
        switch (event.payload) {
          case "in":
            next = Math.min(current + 0.1, 2.0);
            break;
          case "out":
            next = Math.max(current - 0.1, 0.5);
            break;
          case "reset":
            next = 1.0;
            break;
        }
        root.style.setProperty("--zoom", String(next));
        document.body.style.zoom = String(next);
      }),
      listen<number>("menu-open-recent", (event) => {
        const idx = event.payload;
        const { recentProjects, selectFolder } =
          useWorkspaceStore.getState();
        if (idx < recentProjects.length) {
          selectFolder(recentProjects[idx]);
        }
      }),
    ];

    return () => {
      unlisteners.forEach((p) => p.then((fn) => fn()));
    };
  }, []);

  // File watcher: start/stop on projectPath change
  useEffect(() => {
    if (!projectPath) return;

    invoke("start_file_watcher", { path: projectPath }).catch((err) =>
      console.error("Failed to start file watcher:", err),
    );

    const unlisten = listen<string>("file-changed", (event) => {
      const changedPath = event.payload;
      // Ignore changes outside this window's project
      if (!changedPath.startsWith(projectPath)) return;
      // Invalidate buffer cache so re-opening the file fetches fresh content
      invalidateBufferCache(changedPath);
      // Bump version so components can react to external changes
      useEditorStore.getState().bumpFileVersion(changedPath);
      // Refresh file tree so new/deleted files appear
      useLayoutStore.getState().bumpFileTreeRefresh();
    });

    return () => {
      invoke("stop_file_watcher", { path: projectPath }).catch(() => {});
      unlisten.then((fn) => fn());
    };
  }, [projectPath]);

  // Command Palette: Cmd+Shift+P, Search: Cmd+Shift+F
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "p"
      ) {
        e.preventDefault();
        setCommandPaletteOpen((v) => !v);
      }
      // Cmd+P to open Quick Open
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        e.key.toLowerCase() === "p"
      ) {
        e.preventDefault();
        setQuickOpenOpen((v) => !v);
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "f"
      ) {
        e.preventDefault();
        useLayoutStore.getState().setSidebarView("search");
      }
      // Ctrl+Shift+` to create new terminal
      if (e.ctrlKey && e.shiftKey && e.key === "`") {
        e.preventDefault();
        const { run } =
          getCommands().find((c) => c.id === "workbench.action.terminal.new") ??
          {};
        run?.();
      }
      // Ctrl+G to go to line
      if (
        e.ctrlKey &&
        !e.shiftKey &&
        !e.metaKey &&
        e.key.toLowerCase() === "g"
      ) {
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
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        ["1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(e.key)
      ) {
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
