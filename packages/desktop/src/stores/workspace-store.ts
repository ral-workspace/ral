import { create } from "zustand";
import { load } from "@tauri-apps/plugin-store";

interface WorkspaceState {
  projectPath: string | null;
  recentProjects: string[];
  selectFolder: (path: string) => void;
  _loadRecentProjects: () => void;
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
  },

  _loadRecentProjects: () => {
    load("settings.json").then(async (store) => {
      const saved = await store.get<string[]>("recentProjects");
      if (saved) set({ recentProjects: saved });

      // Restore last opened project
      const lastPath = await store.get<string>("lastProjectPath");
      if (lastPath && !get().projectPath) {
        set({ projectPath: lastPath });
      }
    });
  },
}));
