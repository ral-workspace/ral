import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  useWorkspaceStore,
  useLayoutStore,
  useEditorStore,
  useSettingsStore,
} from "../stores";
import {
  getActiveEditorView,
  getBufferContent,
} from "../hooks/use-codemirror";
import { addHistoryEntry } from "../services/history-service";

/**
 * Register all native menu event listeners.
 * Returns an unlisten function to tear down all listeners.
 *
 * @param onCommandPalette - callback to open the command palette
 */
export function registerMenuHandlers(onCommandPalette: () => void): () => void {
  const unlisteners: Promise<UnlistenFn>[] = [
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
              addHistoryEntry(
                activeTabId,
                doc,
                "save",
                s["history.maxEntries"],
                s["history.maxFileSize"],
              ).catch(() => {});
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
        const content =
          filePath === activeTabId && view
            ? view.state.doc.toString()
            : getBufferContent(filePath);
        if (content === null) continue;
        invoke("write_file", { path: filePath, content })
          .then(() => {
            markClean(filePath);
            if (s["history.enabled"]) {
              addHistoryEntry(
                filePath,
                content,
                "save",
                s["history.maxEntries"],
                s["history.maxFileSize"],
              ).catch(() => {});
            }
          })
          .catch((err: unknown) =>
            console.error(`Save All failed for ${filePath}:`, err),
          );
      }
    }),

    listen("menu-auto-save", () => {
      const s = useSettingsStore.getState();
      const current = s.settings["files.autoSave"];
      s.updateSettings({ "files.autoSave": !current });
      const { recentProjects } = useWorkspaceStore.getState();
      invoke("update_recent_menu", {
        paths: recentProjects,
        autoSave: !current,
      }).catch(() => {});
    }),

    listen("menu-revert-file", () => {
      const { activeTabId } = useEditorStore.getState();
      if (activeTabId) {
        invoke<string>("read_file", { path: activeTabId })
          .then((content) => {
            const view = getActiveEditorView();
            if (view) {
              view.dispatch({
                changes: {
                  from: 0,
                  to: view.state.doc.length,
                  insert: content,
                },
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

    listen("menu-close-folder", async () => {
      const closingPath = useWorkspaceStore.getState().projectPath;
      useWorkspaceStore.setState({ projectPath: null });
      useEditorStore.getState().closeAllTabs();
      if (closingPath) {
        const { useWorkflowStore } = await import("../stores/workflow-store");
        await useWorkflowStore.getState().stopScheduler(closingPath);
      }
    }),

    listen("menu-command-palette", () => {
      onCommandPalette();
    }),

    listen<string>("menu-zoom", (event) => {
      const root = document.documentElement;
      const current = parseFloat(
        root.style.getPropertyValue("--zoom") || "1",
      );
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
      const { recentProjects, selectFolder } = useWorkspaceStore.getState();
      if (idx < recentProjects.length) {
        selectFolder(recentProjects[idx]);
      }
    }),
  ];

  return () => {
    unlisteners.forEach((p) => p.then((fn) => fn()));
  };
}
