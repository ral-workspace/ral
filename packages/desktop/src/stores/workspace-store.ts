import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import { useSettingsStore } from "./settings-store";

interface WorkspaceState {
  projectPath: string | null;
  recentProjects: string[];
  selectFolder: (path: string) => void;
  _loadRecentProjects: (restoreLastProject?: boolean) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  projectPath: null,
  recentProjects: [],

  selectFolder: (path) => {
    const prev = get().recentProjects;
    const updated = [path, ...prev.filter((p) => p !== path)].slice(0, 5);
    set({ projectPath: path, recentProjects: updated });

    load("settings.json").then(async (store) => {
      await store.set("recentProjects", updated);
      await store.set("lastProjectPath", path);
      await store.save();
    });

    // Update native Open Recent menu
    invoke("update_recent_menu", { paths: updated, autoSave: useSettingsStore.getState().settings["files.autoSave"] }).catch(() => {});
  },

  _loadRecentProjects: (restoreLastProject = false) => {
    load("settings.json").then(async (store) => {
      const saved = await store.get<string[]>("recentProjects");
      if (saved) {
        set({ recentProjects: saved });
        // Update native Open Recent menu
        invoke("update_recent_menu", { paths: saved, autoSave: useSettingsStore.getState().settings["files.autoSave"] }).catch(() => {});
      }

      // Restore last opened project (main window only)
      if (restoreLastProject) {
        const lastPath = await store.get<string>("lastProjectPath");
        if (lastPath && !get().projectPath) {
          set({ projectPath: lastPath });
        }
      }
    });
  },
}));
