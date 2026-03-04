import { create } from "zustand";
import { load, type Store } from "@tauri-apps/plugin-store";
import { DEFAULT_SETTINGS, type Settings } from "../settings/schema";

const STORE_KEY = "editorSettings";

interface SettingsState {
  settings: Settings;
  _loaded: boolean;
  updateSettings: (patch: Partial<Settings>) => void;
  _initSettings: () => Promise<void>;
}

let storeInstance: Store | null = null;

async function getStore(): Promise<Store> {
  if (!storeInstance) {
    storeInstance = await load("settings.json");
  }
  return storeInstance;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  _loaded: false,

  updateSettings: (patch) => {
    const prev = get().settings;
    const next = { ...prev, ...patch };
    set({ settings: next });

    if (get()._loaded) {
      getStore().then(async (store) => {
        await store.set(STORE_KEY, next);
        await store.save();
      });
    }
  },

  _initSettings: async () => {
    const store = await getStore();
    const saved = await store.get<Partial<Settings>>(STORE_KEY);
    if (saved) {
      set((s) => ({ settings: { ...s.settings, ...saved } }));
    }
    set({ _loaded: true });
  },
}));
