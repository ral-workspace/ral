import { create } from "zustand";
import type { OpenTab } from "../types/editor";
import { SETTINGS_TAB_ID, BROWSER_TAB_PREFIX, DIFF_TAB_PREFIX } from "../types/editor";
import { useDiffStore } from "./diff-store";
import { invalidateBufferCache } from "../hooks/use-codemirror";

interface EditorState {
  openTabs: OpenTab[];
  activeTabId: string | null;
  dirtyFiles: Set<string>;
  fileVersions: Map<string, number>;
  openFile: (path: string, pinned: boolean) => void;
  closeTab: (id: string) => void;
  pinTab: (id: string) => void;
  selectTab: (id: string) => void;
  openSettings: () => void;
  openBrowser: (url: string) => void;
  openDiff: (path: string, oldText: string | null, newText: string) => void;
  markDirty: (path: string) => void;
  markClean: (path: string) => void;
  bumpFileVersion: (path: string) => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  openTabs: [],
  activeTabId: null,
  dirtyFiles: new Set(),
  fileVersions: new Map(),

  openFile: (path, pinned) => {
    const { openTabs } = get();
    const existing = openTabs.find((t) => t.id === path);

    if (existing) {
      if (pinned && !existing.pinned) {
        set({
          openTabs: openTabs.map((t) =>
            t.id === path ? { ...t, pinned: true } : t,
          ),
          activeTabId: path,
        });
      } else {
        set({ activeTabId: path });
      }
      return;
    }

    const name = path.split("/").pop() ?? path;
    set({
      openTabs: [...openTabs, { id: path, name, pinned, type: "file" }],
      activeTabId: path,
    });
  },

  closeTab: (id) => {
    const { openTabs, activeTabId } = get();
    const newTabs = openTabs.filter((t) => t.id !== id);
    let newActiveId = activeTabId;

    if (activeTabId === id) {
      const idx = openTabs.findIndex((t) => t.id === id);
      if (newTabs.length === 0) {
        newActiveId = null;
      } else {
        newActiveId = newTabs[Math.min(idx, newTabs.length - 1)].id;
      }
    }

    const newDirty = new Set(get().dirtyFiles);
    newDirty.delete(id);
    invalidateBufferCache(id);
    if (id.startsWith(DIFF_TAB_PREFIX)) {
      useDiffStore.getState().removeDiff(id);
    }
    set({ openTabs: newTabs, activeTabId: newActiveId, dirtyFiles: newDirty });
  },

  pinTab: (id) => {
    set((s) => ({
      openTabs: s.openTabs.map((t) =>
        t.id === id ? { ...t, pinned: true } : t,
      ),
    }));
  },

  selectTab: (id) => set({ activeTabId: id }),

  markDirty: (path) => {
    const dirty = get().dirtyFiles;
    if (!dirty.has(path)) {
      const next = new Set(dirty);
      next.add(path);
      set({ dirtyFiles: next });
    }
  },

  markClean: (path) => {
    const dirty = get().dirtyFiles;
    if (dirty.has(path)) {
      const next = new Set(dirty);
      next.delete(path);
      set({ dirtyFiles: next });
    }
  },

  bumpFileVersion: (path) => {
    const versions = new Map(get().fileVersions);
    versions.set(path, (versions.get(path) ?? 0) + 1);
    set({ fileVersions: versions });
  },

  openDiff: (path, oldText, newText) => {
    const tabId = DIFF_TAB_PREFIX + path;
    const { openTabs } = get();
    const name = (path.split("/").pop() ?? path) + " (diff)";

    useDiffStore.getState().setDiff(tabId, {
      path,
      oldText: oldText ?? "",
      newText,
    });

    const existing = openTabs.find((t) => t.id === tabId);
    if (existing) {
      set({ activeTabId: tabId });
      return;
    }

    set({
      openTabs: [...openTabs, { id: tabId, name, pinned: true, type: "diff" }],
      activeTabId: tabId,
    });
  },

  openSettings: () => {
    const { openTabs } = get();
    const existing = openTabs.find((t) => t.id === SETTINGS_TAB_ID);
    if (!existing) {
      set({
        openTabs: [
          ...openTabs,
          {
            id: SETTINGS_TAB_ID,
            name: "Settings",
            pinned: true,
            type: "settings",
          },
        ],
        activeTabId: SETTINGS_TAB_ID,
      });
    } else {
      set({ activeTabId: SETTINGS_TAB_ID });
    }
  },

  openBrowser: (url) => {
    const tabId = BROWSER_TAB_PREFIX + url;
    const { openTabs } = get();
    const existing = openTabs.find((t) => t.id === tabId);
    if (existing) {
      set({ activeTabId: tabId });
      return;
    }

    let name: string;
    try {
      const parsed = new URL(url);
      name = parsed.host || url;
    } catch {
      name = url;
    }

    set({
      openTabs: [
        ...openTabs,
        { id: tabId, name, pinned: true, type: "browser" },
      ],
      activeTabId: tabId,
    });
  },
}));
