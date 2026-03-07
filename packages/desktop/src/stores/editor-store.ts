import { create } from "zustand";
import { load, type Store } from "@tauri-apps/plugin-store";
import type { OpenTab, EditorGroup, SplitNode } from "../types/editor";
import { SETTINGS_TAB_ID, BROWSER_TAB_PREFIX, DIFF_TAB_PREFIX, PREVIEW_TAB_PREFIX, DATABASE_TAB_PREFIX } from "../types/editor";
import { useDiffStore } from "./diff-store";
import { useDatabaseStore } from "./database-store";
import { invalidateBufferCache } from "../hooks/use-codemirror";

// --- Split tree helpers ---

function removeGroupFromTree(node: SplitNode, groupId: string): SplitNode | null {
  if (node.type === "leaf") {
    return node.groupId === groupId ? null : node;
  }
  const children = node.children
    .map((c) => removeGroupFromTree(c, groupId))
    .filter((c): c is SplitNode => c !== null);
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return { ...node, children };
}

export function findGroupIds(node: SplitNode): string[] {
  if (node.type === "leaf") return [node.groupId];
  return node.children.flatMap(findGroupIds);
}

// --- Tab cleanup ---

function cleanupTab(id: string, dirtyFiles: Set<string>): Set<string> {
  const newDirty = new Set(dirtyFiles);
  newDirty.delete(id);
  invalidateBufferCache(id);
  if (id.startsWith(DIFF_TAB_PREFIX)) {
    useDiffStore.getState().removeDiff(id);
  }
  if (id.startsWith(DATABASE_TAB_PREFIX)) {
    useDatabaseStore.getState().removeDatabase(id);
  }
  return newDirty;
}

// --- Store ---

const DEFAULT_GROUP_ID = "group-1";
let nextGroupCounter = 2;

interface EditorState {
  // Group state
  groups: Map<string, EditorGroup>;
  splitRoot: SplitNode;
  activeGroupId: string;

  // Computed-like accessors (for backward compatibility)
  openTabs: OpenTab[];
  activeTabId: string | null;

  // Global state
  dirtyFiles: Set<string>;
  fileVersions: Map<string, number>;

  // Legacy API (operates on active group)
  openFile: (path: string, pinned: boolean) => void;
  closeTab: (id: string) => void;
  pinTab: (id: string) => void;
  selectTab: (id: string) => void;
  openSettings: () => void;
  openBrowser: (url: string) => void;
  openDiff: (path: string, oldText: string | null, newText: string) => void;
  openPreview: (path: string) => void;
  openDatabase: (path: string) => void;
  closeOtherTabs: (id: string) => void;
  closeTabsToTheRight: (id: string) => void;
  closeSavedTabs: () => void;
  closeAllTabs: () => void;
  moveTab: (fromIndex: number, toIndex: number) => void;
  markDirty: (path: string) => void;
  markClean: (path: string) => void;
  bumpFileVersion: (path: string) => void;

  // Group-aware API
  setActiveGroup: (groupId: string) => void;
  splitGroup: (groupId: string, direction: "horizontal" | "vertical") => void;
  closeGroup: (groupId: string) => void;
  openFileInGroup: (groupId: string, path: string, pinned: boolean) => void;
  closeTabInGroup: (groupId: string, tabId: string) => void;
  selectTabInGroup: (groupId: string, tabId: string) => void;
  moveTabInGroup: (groupId: string, fromIndex: number, toIndex: number) => void;
  closeOtherTabsInGroup: (groupId: string, tabId: string) => void;
  closeTabsToTheRightInGroup: (groupId: string, tabId: string) => void;
  closeSavedTabsInGroup: (groupId: string) => void;
  closeAllTabsInGroup: (groupId: string) => void;
  pinTabInGroup: (groupId: string, tabId: string) => void;
  moveTabToGroup: (fromGroupId: string, toGroupId: string, tabId: string, targetIndex?: number) => void;
  getGroup: (groupId: string) => EditorGroup | undefined;
  _saveLayout: () => void;
  _restoreLayout: () => Promise<void>;
}

function updateGroup(groups: Map<string, EditorGroup>, groupId: string, updater: (g: EditorGroup) => EditorGroup): Map<string, EditorGroup> {
  const group = groups.get(groupId);
  if (!group) return groups;
  const next = new Map(groups);
  next.set(groupId, updater(group));
  return next;
}

function syncFromActiveGroup(groups: Map<string, EditorGroup>, activeGroupId: string) {
  const g = groups.get(activeGroupId)!;
  return { groups, openTabs: g.openTabs, activeTabId: g.activeTabId };
}

export const useEditorStore = create<EditorState>((set, get) => ({
  groups: new Map([[DEFAULT_GROUP_ID, { id: DEFAULT_GROUP_ID, openTabs: [], activeTabId: null }]]),
  splitRoot: { type: "leaf", groupId: DEFAULT_GROUP_ID },
  activeGroupId: DEFAULT_GROUP_ID,
  openTabs: [],
  activeTabId: null,
  dirtyFiles: new Set(),
  fileVersions: new Map(),

  // --- Legacy API (operates on active group) ---

  openFile: (path, pinned) => {
    const { groups, activeGroupId } = get();
    const group = groups.get(activeGroupId)!;
    const existing = group.openTabs.find((t) => t.id === path);

    if (existing) {
      if (pinned && !existing.pinned) {
        const newGroups = updateGroup(groups, activeGroupId, (g) => ({
          ...g,
          openTabs: g.openTabs.map((t) => t.id === path ? { ...t, pinned: true } : t),
          activeTabId: path,
        }));
        set(syncFromActiveGroup(newGroups, activeGroupId));
      } else {
        const newGroups = updateGroup(groups, activeGroupId, (g) => ({ ...g, activeTabId: path }));
        set(syncFromActiveGroup(newGroups, activeGroupId));
      }
      return;
    }

    const name = path.split("/").pop() ?? path;
    const newGroups = updateGroup(groups, activeGroupId, (g) => ({
      ...g,
      openTabs: [...g.openTabs, { id: path, name, pinned, type: "file" }],
      activeTabId: path,
    }));
    set(syncFromActiveGroup(newGroups, activeGroupId));
  },

  closeTab: (id) => {
    const { groups, activeGroupId } = get();
    const group = groups.get(activeGroupId)!;
    const newTabs = group.openTabs.filter((t) => t.id !== id);
    let newActiveId = group.activeTabId;

    if (group.activeTabId === id) {
      const idx = group.openTabs.findIndex((t) => t.id === id);
      if (newTabs.length === 0) {
        newActiveId = null;
      } else {
        newActiveId = newTabs[Math.min(idx, newTabs.length - 1)].id;
      }
    }

    const newDirty = cleanupTab(id, get().dirtyFiles);
    const newGroups = updateGroup(groups, activeGroupId, () => ({
      id: activeGroupId,
      openTabs: newTabs,
      activeTabId: newActiveId,
    }));

    // Auto-close group if empty and there are other groups
    if (newTabs.length === 0 && get().groups.size > 1) {
      get().closeGroup(activeGroupId);
      return;
    }

    set({ ...syncFromActiveGroup(newGroups, activeGroupId), dirtyFiles: newDirty });
  },

  closeOtherTabs: (id) => {
    const { groups, activeGroupId } = get();
    const group = groups.get(activeGroupId)!;
    let dirty = get().dirtyFiles;
    for (const tab of group.openTabs) {
      if (tab.id !== id) dirty = cleanupTab(tab.id, dirty);
    }
    const newGroups = updateGroup(groups, activeGroupId, (g) => ({
      ...g,
      openTabs: g.openTabs.filter((t) => t.id === id),
      activeTabId: id,
    }));
    set({ ...syncFromActiveGroup(newGroups, activeGroupId), dirtyFiles: dirty });
  },

  closeTabsToTheRight: (id) => {
    const { groups, activeGroupId } = get();
    const group = groups.get(activeGroupId)!;
    const idx = group.openTabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const kept = group.openTabs.slice(0, idx + 1);
    const removed = group.openTabs.slice(idx + 1);
    let dirty = get().dirtyFiles;
    for (const tab of removed) dirty = cleanupTab(tab.id, dirty);
    const newActiveId = kept.find((t) => t.id === group.activeTabId) ? group.activeTabId : id;
    const newGroups = updateGroup(groups, activeGroupId, () => ({
      id: activeGroupId,
      openTabs: kept,
      activeTabId: newActiveId,
    }));
    set({ ...syncFromActiveGroup(newGroups, activeGroupId), dirtyFiles: dirty });
  },

  closeSavedTabs: () => {
    const { groups, activeGroupId, dirtyFiles } = get();
    const group = groups.get(activeGroupId)!;
    const kept = group.openTabs.filter((t) => dirtyFiles.has(t.id));
    const removed = group.openTabs.filter((t) => !dirtyFiles.has(t.id));
    let dirty = dirtyFiles;
    for (const tab of removed) dirty = cleanupTab(tab.id, dirty);
    const newActiveId = kept.find((t) => t.id === group.activeTabId)
      ? group.activeTabId
      : kept[0]?.id ?? null;

    const newGroups = updateGroup(groups, activeGroupId, () => ({
      id: activeGroupId,
      openTabs: kept,
      activeTabId: newActiveId,
    }));

    if (kept.length === 0 && get().groups.size > 1) {
      set({ dirtyFiles: dirty });
      get().closeGroup(activeGroupId);
      return;
    }

    set({ ...syncFromActiveGroup(newGroups, activeGroupId), dirtyFiles: dirty });
  },

  closeAllTabs: () => {
    const { groups, activeGroupId } = get();
    const group = groups.get(activeGroupId)!;
    let dirty = get().dirtyFiles;
    for (const tab of group.openTabs) dirty = cleanupTab(tab.id, dirty);

    if (get().groups.size > 1) {
      set({ dirtyFiles: dirty });
      get().closeGroup(activeGroupId);
      return;
    }

    const newGroups = updateGroup(groups, activeGroupId, () => ({
      id: activeGroupId,
      openTabs: [],
      activeTabId: null,
    }));
    set({ ...syncFromActiveGroup(newGroups, activeGroupId), dirtyFiles: dirty });
  },

  pinTab: (id) => {
    const { groups, activeGroupId } = get();
    const newGroups = updateGroup(groups, activeGroupId, (g) => ({
      ...g,
      openTabs: g.openTabs.map((t) => t.id === id ? { ...t, pinned: true } : t),
    }));
    set(syncFromActiveGroup(newGroups, activeGroupId));
  },

  selectTab: (id) => {
    const { groups, activeGroupId } = get();
    const newGroups = updateGroup(groups, activeGroupId, (g) => ({ ...g, activeTabId: id }));
    set(syncFromActiveGroup(newGroups, activeGroupId));
  },

  moveTab: (fromIndex, toIndex) => {
    const { groups, activeGroupId } = get();
    const newGroups = updateGroup(groups, activeGroupId, (g) => {
      const tabs = [...g.openTabs];
      const [moved] = tabs.splice(fromIndex, 1);
      tabs.splice(toIndex, 0, moved);
      return { ...g, openTabs: tabs };
    });
    set(syncFromActiveGroup(newGroups, activeGroupId));
  },

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
    const { groups, activeGroupId } = get();
    const group = groups.get(activeGroupId)!;
    const name = (path.split("/").pop() ?? path) + " (diff)";

    useDiffStore.getState().setDiff(tabId, {
      path,
      oldText: oldText ?? "",
      newText,
    });

    const existing = group.openTabs.find((t) => t.id === tabId);
    if (existing) {
      const newGroups = updateGroup(groups, activeGroupId, (g) => ({ ...g, activeTabId: tabId }));
      set(syncFromActiveGroup(newGroups, activeGroupId));
      return;
    }

    const newGroups = updateGroup(groups, activeGroupId, (g) => ({
      ...g,
      openTabs: [...g.openTabs, { id: tabId, name, pinned: true, type: "diff" }],
      activeTabId: tabId,
    }));
    set(syncFromActiveGroup(newGroups, activeGroupId));
  },

  openPreview: (path) => {
    const tabId = PREVIEW_TAB_PREFIX + path;
    const { groups, activeGroupId } = get();
    const group = groups.get(activeGroupId)!;
    const existing = group.openTabs.find((t) => t.id === tabId);
    if (existing) {
      const newGroups = updateGroup(groups, activeGroupId, (g) => ({ ...g, activeTabId: tabId }));
      set(syncFromActiveGroup(newGroups, activeGroupId));
      return;
    }

    const name = path.split("/").pop() ?? path;
    const newGroups = updateGroup(groups, activeGroupId, (g) => ({
      ...g,
      openTabs: [...g.openTabs, { id: tabId, name, pinned: true, type: "preview" }],
      activeTabId: tabId,
    }));
    set(syncFromActiveGroup(newGroups, activeGroupId));
  },

  openDatabase: (path) => {
    const tabId = DATABASE_TAB_PREFIX + path;
    const { groups, activeGroupId } = get();
    const group = groups.get(activeGroupId)!;
    const existing = group.openTabs.find((t) => t.id === tabId);
    if (existing) {
      const newGroups = updateGroup(groups, activeGroupId, (g) => ({ ...g, activeTabId: tabId }));
      set(syncFromActiveGroup(newGroups, activeGroupId));
      return;
    }

    const name = path.split("/").pop() ?? path;
    const newGroups = updateGroup(groups, activeGroupId, (g) => ({
      ...g,
      openTabs: [...g.openTabs, { id: tabId, name, pinned: true, type: "database" }],
      activeTabId: tabId,
    }));
    set(syncFromActiveGroup(newGroups, activeGroupId));
  },

  openSettings: () => {
    const { groups, activeGroupId } = get();
    const group = groups.get(activeGroupId)!;
    const existing = group.openTabs.find((t) => t.id === SETTINGS_TAB_ID);
    if (!existing) {
      const newGroups = updateGroup(groups, activeGroupId, (g) => ({
        ...g,
        openTabs: [...g.openTabs, { id: SETTINGS_TAB_ID, name: "Settings", pinned: true, type: "settings" }],
        activeTabId: SETTINGS_TAB_ID,
      }));
      set(syncFromActiveGroup(newGroups, activeGroupId));
    } else {
      const newGroups = updateGroup(groups, activeGroupId, (g) => ({ ...g, activeTabId: SETTINGS_TAB_ID }));
      set(syncFromActiveGroup(newGroups, activeGroupId));
    }
  },

  openBrowser: (url) => {
    const tabId = BROWSER_TAB_PREFIX + url;
    const { groups, activeGroupId } = get();
    const group = groups.get(activeGroupId)!;
    const existing = group.openTabs.find((t) => t.id === tabId);
    if (existing) {
      const newGroups = updateGroup(groups, activeGroupId, (g) => ({ ...g, activeTabId: tabId }));
      set(syncFromActiveGroup(newGroups, activeGroupId));
      return;
    }

    let name: string;
    try {
      const parsed = new URL(url);
      name = parsed.host || url;
    } catch {
      name = url;
    }

    const newGroups = updateGroup(groups, activeGroupId, (g) => ({
      ...g,
      openTabs: [...g.openTabs, { id: tabId, name, pinned: true, type: "browser" }],
      activeTabId: tabId,
    }));
    set(syncFromActiveGroup(newGroups, activeGroupId));
  },

  // --- Group-aware API ---

  setActiveGroup: (groupId) => {
    const group = get().groups.get(groupId);
    if (!group) return;
    set({
      activeGroupId: groupId,
      openTabs: group.openTabs,
      activeTabId: group.activeTabId,
    });
  },

  getGroup: (groupId) => get().groups.get(groupId),

  splitGroup: (groupId, direction) => {
    const { groups, splitRoot } = get();
    const sourceGroup = groups.get(groupId);
    if (!sourceGroup) return;

    const newGroupId = `group-${nextGroupCounter++}`;
    const activeTab = sourceGroup.openTabs.find((t) => t.id === sourceGroup.activeTabId);

    // Create new group with a copy of the active tab (if any)
    const newGroup: EditorGroup = {
      id: newGroupId,
      openTabs: activeTab ? [{ ...activeTab }] : [],
      activeTabId: activeTab?.id ?? null,
    };

    const newGroups = new Map(groups);
    newGroups.set(newGroupId, newGroup);

    // Insert new group into split tree
    const newRoot = insertSplit(splitRoot, groupId, newGroupId, direction);

    set({
      groups: newGroups,
      splitRoot: newRoot,
      activeGroupId: newGroupId,
      openTabs: newGroup.openTabs,
      activeTabId: newGroup.activeTabId,
    });
  },

  closeGroup: (groupId) => {
    const { groups, splitRoot, activeGroupId } = get();
    if (groups.size <= 1) return;

    const group = groups.get(groupId);
    if (!group) return;

    // Cleanup tabs
    let dirty = get().dirtyFiles;
    for (const tab of group.openTabs) dirty = cleanupTab(tab.id, dirty);

    const newGroups = new Map(groups);
    newGroups.delete(groupId);

    const newRoot = removeGroupFromTree(splitRoot, groupId);
    const fallbackRoot: SplitNode = newRoot ?? { type: "leaf", groupId: [...newGroups.keys()][0] };

    // Pick new active group
    let newActiveGroupId = activeGroupId;
    if (activeGroupId === groupId) {
      const allIds = findGroupIds(fallbackRoot);
      newActiveGroupId = allIds[0];
    }

    const newActiveGroup = newGroups.get(newActiveGroupId)!;
    set({
      groups: newGroups,
      splitRoot: fallbackRoot,
      activeGroupId: newActiveGroupId,
      openTabs: newActiveGroup.openTabs,
      activeTabId: newActiveGroup.activeTabId,
      dirtyFiles: dirty,
    });
  },

  openFileInGroup: (groupId, path, pinned) => {
    const { groups, activeGroupId } = get();
    const group = groups.get(groupId);
    if (!group) return;

    const existing = group.openTabs.find((t) => t.id === path);
    if (existing) {
      if (pinned && !existing.pinned) {
        const newGroups = updateGroup(groups, groupId, (g) => ({
          ...g,
          openTabs: g.openTabs.map((t) => t.id === path ? { ...t, pinned: true } : t),
          activeTabId: path,
        }));
        set({
          groups: newGroups,
          activeGroupId: groupId,
          ...(groupId === activeGroupId || groupId === get().activeGroupId
            ? syncFromActiveGroup(newGroups, groupId) : {}),
        });
      } else {
        const newGroups = updateGroup(groups, groupId, (g) => ({ ...g, activeTabId: path }));
        set({
          groups: newGroups,
          activeGroupId: groupId,
          openTabs: newGroups.get(groupId)!.openTabs,
          activeTabId: path,
        });
      }
      return;
    }

    const name = path.split("/").pop() ?? path;
    const newGroups = updateGroup(groups, groupId, (g) => ({
      ...g,
      openTabs: [...g.openTabs, { id: path, name, pinned, type: "file" }],
      activeTabId: path,
    }));
    set({
      groups: newGroups,
      activeGroupId: groupId,
      openTabs: newGroups.get(groupId)!.openTabs,
      activeTabId: path,
    });
  },

  closeTabInGroup: (groupId, tabId) => {
    const { groups } = get();
    const group = groups.get(groupId);
    if (!group) return;

    const newTabs = group.openTabs.filter((t) => t.id !== tabId);
    let newActiveId = group.activeTabId;

    if (group.activeTabId === tabId) {
      const idx = group.openTabs.findIndex((t) => t.id === tabId);
      if (newTabs.length === 0) {
        newActiveId = null;
      } else {
        newActiveId = newTabs[Math.min(idx, newTabs.length - 1)].id;
      }
    }

    const newDirty = cleanupTab(tabId, get().dirtyFiles);

    // Auto-close group if empty and there are other groups
    if (newTabs.length === 0 && groups.size > 1) {
      set({ dirtyFiles: newDirty });
      get().closeGroup(groupId);
      return;
    }

    const newGroups = updateGroup(groups, groupId, () => ({
      id: groupId,
      openTabs: newTabs,
      activeTabId: newActiveId,
    }));

    const isActive = groupId === get().activeGroupId;
    set({
      groups: newGroups,
      dirtyFiles: newDirty,
      ...(isActive ? { openTabs: newTabs, activeTabId: newActiveId } : {}),
    });
  },

  selectTabInGroup: (groupId, tabId) => {
    const { groups } = get();
    const newGroups = updateGroup(groups, groupId, (g) => ({ ...g, activeTabId: tabId }));
    const isActive = groupId === get().activeGroupId;
    set({
      groups: newGroups,
      activeGroupId: groupId,
      ...(isActive || true ? { openTabs: newGroups.get(groupId)!.openTabs, activeTabId: tabId } : {}),
    });
  },

  moveTabInGroup: (groupId, fromIndex, toIndex) => {
    const { groups } = get();
    const newGroups = updateGroup(groups, groupId, (g) => {
      const tabs = [...g.openTabs];
      const [moved] = tabs.splice(fromIndex, 1);
      tabs.splice(toIndex, 0, moved);
      return { ...g, openTabs: tabs };
    });
    const isActive = groupId === get().activeGroupId;
    set({
      groups: newGroups,
      ...(isActive ? { openTabs: newGroups.get(groupId)!.openTabs } : {}),
    });
  },

  closeOtherTabsInGroup: (groupId, tabId) => {
    const { groups } = get();
    const group = groups.get(groupId);
    if (!group) return;
    let dirty = get().dirtyFiles;
    for (const tab of group.openTabs) {
      if (tab.id !== tabId) dirty = cleanupTab(tab.id, dirty);
    }
    const newGroups = updateGroup(groups, groupId, (g) => ({
      ...g,
      openTabs: g.openTabs.filter((t) => t.id === tabId),
      activeTabId: tabId,
    }));
    const isActive = groupId === get().activeGroupId;
    set({
      groups: newGroups,
      dirtyFiles: dirty,
      ...(isActive ? { openTabs: newGroups.get(groupId)!.openTabs, activeTabId: tabId } : {}),
    });
  },

  closeTabsToTheRightInGroup: (groupId, tabId) => {
    const { groups } = get();
    const group = groups.get(groupId);
    if (!group) return;
    const idx = group.openTabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;
    const kept = group.openTabs.slice(0, idx + 1);
    const removed = group.openTabs.slice(idx + 1);
    let dirty = get().dirtyFiles;
    for (const tab of removed) dirty = cleanupTab(tab.id, dirty);
    const newActiveId = kept.find((t) => t.id === group.activeTabId) ? group.activeTabId : tabId;
    const newGroups = updateGroup(groups, groupId, () => ({
      id: groupId,
      openTabs: kept,
      activeTabId: newActiveId,
    }));
    const isActive = groupId === get().activeGroupId;
    set({
      groups: newGroups,
      dirtyFiles: dirty,
      ...(isActive ? { openTabs: kept, activeTabId: newActiveId } : {}),
    });
  },

  closeSavedTabsInGroup: (groupId) => {
    const { groups, dirtyFiles } = get();
    const group = groups.get(groupId);
    if (!group) return;
    const kept = group.openTabs.filter((t) => dirtyFiles.has(t.id));
    const removed = group.openTabs.filter((t) => !dirtyFiles.has(t.id));
    let dirty = dirtyFiles;
    for (const tab of removed) dirty = cleanupTab(tab.id, dirty);
    const newActiveId = kept.find((t) => t.id === group.activeTabId)
      ? group.activeTabId
      : kept[0]?.id ?? null;

    if (kept.length === 0 && groups.size > 1) {
      set({ dirtyFiles: dirty });
      get().closeGroup(groupId);
      return;
    }

    const newGroups = updateGroup(groups, groupId, () => ({
      id: groupId,
      openTabs: kept,
      activeTabId: newActiveId,
    }));
    const isActive = groupId === get().activeGroupId;
    set({
      groups: newGroups,
      dirtyFiles: dirty,
      ...(isActive ? { openTabs: kept, activeTabId: newActiveId } : {}),
    });
  },

  closeAllTabsInGroup: (groupId) => {
    const { groups } = get();
    const group = groups.get(groupId);
    if (!group) return;
    let dirty = get().dirtyFiles;
    for (const tab of group.openTabs) dirty = cleanupTab(tab.id, dirty);

    if (groups.size > 1) {
      set({ dirtyFiles: dirty });
      get().closeGroup(groupId);
      return;
    }

    const newGroups = updateGroup(groups, groupId, () => ({
      id: groupId,
      openTabs: [],
      activeTabId: null,
    }));
    const isActive = groupId === get().activeGroupId;
    set({
      groups: newGroups,
      dirtyFiles: dirty,
      ...(isActive ? { openTabs: [], activeTabId: null } : {}),
    });
  },

  pinTabInGroup: (groupId, tabId) => {
    const { groups } = get();
    const newGroups = updateGroup(groups, groupId, (g) => ({
      ...g,
      openTabs: g.openTabs.map((t) => t.id === tabId ? { ...t, pinned: true } : t),
    }));
    const isActive = groupId === get().activeGroupId;
    set({
      groups: newGroups,
      ...(isActive ? { openTabs: newGroups.get(groupId)!.openTabs } : {}),
    });
  },

  _saveLayout: () => {
    const { groups, splitRoot, activeGroupId } = get();
    const serialized: SerializedLayout = {
      groups: [...groups.entries()].map(([id, g]) => [id, { ...g }]),
      splitRoot,
      activeGroupId,
    };
    getLayoutStore().then(async (store) => {
      await store.set(LAYOUT_STORE_KEY, serialized);
      await store.save();
    });
  },

  _restoreLayout: async () => {
    try {
      const store = await getLayoutStore();
      const data = await store.get<SerializedLayout>(LAYOUT_STORE_KEY);
      if (!data || !data.groups || data.groups.length === 0) return;

      const groups = new Map<string, EditorGroup>(data.groups);
      // Update nextGroupCounter to avoid ID collisions
      for (const [id] of groups) {
        const match = id.match(/^group-(\d+)$/);
        if (match) {
          const num = parseInt(match[1]);
          if (num >= nextGroupCounter) nextGroupCounter = num + 1;
        }
      }

      const activeGroupId = groups.has(data.activeGroupId) ? data.activeGroupId : [...groups.keys()][0];
      const activeGroup = groups.get(activeGroupId)!;
      set({
        groups,
        splitRoot: data.splitRoot,
        activeGroupId,
        openTabs: activeGroup.openTabs,
        activeTabId: activeGroup.activeTabId,
      });
    } catch {
      // Ignore restore errors — start fresh
    }
  },

  moveTabToGroup: (fromGroupId, toGroupId, tabId, targetIndex) => {
    if (fromGroupId === toGroupId) return;
    const { groups } = get();
    const fromGroup = groups.get(fromGroupId);
    const toGroup = groups.get(toGroupId);
    if (!fromGroup || !toGroup) return;

    const tab = fromGroup.openTabs.find((t) => t.id === tabId);
    if (!tab) return;

    // Remove from source group
    const newFromTabs = fromGroup.openTabs.filter((t) => t.id !== tabId);
    let newFromActiveId = fromGroup.activeTabId;
    if (fromGroup.activeTabId === tabId) {
      const idx = fromGroup.openTabs.findIndex((t) => t.id === tabId);
      if (newFromTabs.length === 0) {
        newFromActiveId = null;
      } else {
        newFromActiveId = newFromTabs[Math.min(idx, newFromTabs.length - 1)].id;
      }
    }

    // Add to target group
    const newToTabs = [...toGroup.openTabs];
    const insertIdx = targetIndex !== undefined ? targetIndex : newToTabs.length;
    newToTabs.splice(insertIdx, 0, tab);

    let newGroups = new Map(groups);
    newGroups.set(fromGroupId, { ...fromGroup, openTabs: newFromTabs, activeTabId: newFromActiveId });
    newGroups.set(toGroupId, { ...toGroup, openTabs: newToTabs, activeTabId: tabId });

    // Auto-close empty source group
    if (newFromTabs.length === 0 && newGroups.size > 1) {
      newGroups.delete(fromGroupId);
      const newRoot = removeGroupFromTree(get().splitRoot, fromGroupId);
      const fallbackRoot: SplitNode = newRoot ?? { type: "leaf", groupId: toGroupId };
      const newToGroup = newGroups.get(toGroupId)!;
      set({
        groups: newGroups,
        splitRoot: fallbackRoot,
        activeGroupId: toGroupId,
        openTabs: newToGroup.openTabs,
        activeTabId: newToGroup.activeTabId,
      });
      return;
    }

    const activeGroupId = toGroupId;
    const activeGroup = newGroups.get(activeGroupId)!;
    set({
      groups: newGroups,
      activeGroupId,
      openTabs: activeGroup.openTabs,
      activeTabId: activeGroup.activeTabId,
    });
  },
}));

// --- Layout persistence ---

const LAYOUT_STORE_KEY = "editorLayout";
let layoutStoreInstance: Store | null = null;

async function getLayoutStore(): Promise<Store> {
  if (!layoutStoreInstance) {
    layoutStoreInstance = await load("editor-layout.json");
  }
  return layoutStoreInstance;
}

interface SerializedLayout {
  groups: [string, EditorGroup][];
  splitRoot: SplitNode;
  activeGroupId: string;
}

// Auto-save layout on state changes (debounced)
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
useEditorStore.subscribe((state, prev) => {
  if (state.groups !== prev.groups || state.splitRoot !== prev.splitRoot) {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      useEditorStore.getState()._saveLayout();
    }, 1000);
  }
});

// --- Split tree insertion ---

function insertSplit(node: SplitNode, targetGroupId: string, newGroupId: string, direction: "horizontal" | "vertical"): SplitNode {
  if (node.type === "leaf") {
    if (node.groupId === targetGroupId) {
      return {
        type: "branch",
        direction,
        children: [
          { type: "leaf", groupId: targetGroupId },
          { type: "leaf", groupId: newGroupId },
        ],
      };
    }
    return node;
  }

  return {
    ...node,
    children: node.children.map((c) => insertSplit(c, targetGroupId, newGroupId, direction)),
  };
}
