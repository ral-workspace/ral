import { load, type Store } from "@tauri-apps/plugin-store";
import type { EditorGroup, SplitNode } from "../types/editor";

const LAYOUT_STORE_KEY = "editorLayout";
let layoutStoreInstance: Store | null = null;

async function getLayoutStore(): Promise<Store> {
  if (!layoutStoreInstance) {
    layoutStoreInstance = await load("editor-layout.json");
  }
  return layoutStoreInstance;
}

export interface SerializedLayout {
  groups: [string, EditorGroup][];
  splitRoot: SplitNode;
  activeGroupId: string;
}

export async function saveLayout(
  groups: Map<string, EditorGroup>,
  splitRoot: SplitNode,
  activeGroupId: string,
): Promise<void> {
  const serialized: SerializedLayout = {
    groups: [...groups.entries()].map(([id, g]) => [id, { ...g }]),
    splitRoot,
    activeGroupId,
  };
  const store = await getLayoutStore();
  await store.set(LAYOUT_STORE_KEY, serialized);
  await store.save();
}

export async function restoreLayout(): Promise<SerializedLayout | null> {
  try {
    const store = await getLayoutStore();
    const data = await store.get<SerializedLayout>(LAYOUT_STORE_KEY);
    if (!data || !data.groups || data.groups.length === 0) return null;
    return data;
  } catch {
    return null;
  }
}

/** Debounced auto-save subscription. Returns unsubscribe function. */
export function setupAutoSave(
  subscribe: (listener: (state: { groups: Map<string, EditorGroup>; splitRoot: SplitNode; activeGroupId: string }, prev: { groups: Map<string, EditorGroup>; splitRoot: SplitNode }) => void) => () => void,
  getSaveData: () => { groups: Map<string, EditorGroup>; splitRoot: SplitNode; activeGroupId: string },
): () => void {
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;

  const unsub = subscribe((state, prev) => {
    if (state.groups !== prev.groups || state.splitRoot !== prev.splitRoot) {
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        const { groups, splitRoot, activeGroupId } = getSaveData();
        saveLayout(groups, splitRoot, activeGroupId);
      }, 1000);
    }
  });

  return () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    unsub();
  };
}
