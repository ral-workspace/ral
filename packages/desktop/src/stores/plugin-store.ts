import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { homeDir } from "@tauri-apps/api/path";
import { toast } from "@ral/ui";

const OFFICIAL_MARKETPLACE = "claude-plugins-official";
const OFFICIAL_REPO = "anthropics/claude-plugins-official";
const OFFICIAL_URL =
  "https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/.claude-plugin/marketplace.json";

const BUILTIN_MARKETPLACE = "ral-plugins";
const BUILTIN_REPO = "cohaku-ai/ral-plugins";
const BUILTIN_URL =
  "https://raw.githubusercontent.com/cohaku-ai/ral-plugins/main/.claude-plugin/marketplace.json";

export interface MarketplacePlugin {
  name: string;
  description: string;
  author: { name: string; email?: string };
  category?: string;
  version?: string;
  tags?: string[];
  source: string | { source: string; url?: string };
  marketplace: string;
}

interface PluginState {
  plugins: MarketplacePlugin[];
  installedPlugins: Record<string, boolean>;
  loadingId: string | null;
  isLoading: boolean;
  fetchMarketplace: () => Promise<void>;
  loadInstalled: () => Promise<void>;
  installPlugin: (name: string) => Promise<void>;
  uninstallPlugin: (name: string) => Promise<void>;
}

async function readClaudeSettings(): Promise<Record<string, unknown>> {
  try {
    const home = await homeDir();
    const path = `${home}/.claude/settings.json`;
    const content = await invoke<string>("read_file", { path });
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function runClaudeCommand(args: string[]): Promise<void> {
  const home = await homeDir();
  const claudePath = `${home}/.claude/local/claude`;
  await invoke<string>("run_command", {
    command: claudePath,
    args,
  });
}

async function ensureMarketplaceAdded(name: string, repo: string): Promise<void> {
  const settings = await readClaudeSettings();
  const known = (settings.extraKnownMarketplaces ?? {}) as Record<string, unknown>;
  if (known[name]) return;
  await runClaudeCommand(["plugin", "marketplace", "add", repo]);
}

async function fetchPluginsFrom(
  url: string,
  marketplace: string,
): Promise<MarketplacePlugin[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return ((data.plugins ?? []) as Omit<MarketplacePlugin, "marketplace">[]).map(
    (p) => ({ ...p, marketplace }),
  );
}

export const usePluginStore = create<PluginState>((set, get) => ({
  plugins: [],
  installedPlugins: {},
  loadingId: null,
  isLoading: false,

  fetchMarketplace: async () => {
    set({ isLoading: true });
    try {
      const results = await Promise.allSettled([
        fetchPluginsFrom(BUILTIN_URL, BUILTIN_MARKETPLACE),
        fetchPluginsFrom(OFFICIAL_URL, OFFICIAL_MARKETPLACE),
      ]);
      const plugins: MarketplacePlugin[] = [];
      for (const result of results) {
        if (result.status === "fulfilled") {
          plugins.push(...result.value);
        } else {
          console.error("[plugins] fetch failed:", result.reason);
        }
      }
      set({ plugins });
    } finally {
      set({ isLoading: false });
    }
  },

  loadInstalled: async () => {
    const settings = await readClaudeSettings();
    const raw = (settings.enabledPlugins ?? {}) as Record<string, boolean>;
    const installed: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(raw)) {
      const name = key.split("@")[0];
      installed[name] = value;
    }
    set({ installedPlugins: installed });
  },

  installPlugin: async (name: string) => {
    set({ loadingId: name });
    try {
      const plugin = get().plugins.find((p) => p.name === name);
      const mp = plugin?.marketplace ?? OFFICIAL_MARKETPLACE;
      const repo = mp === BUILTIN_MARKETPLACE ? BUILTIN_REPO : OFFICIAL_REPO;
      await ensureMarketplaceAdded(mp, repo);
      await runClaudeCommand(["plugin", "install", `${name}@${mp}`]);
      await get().loadInstalled();
      toast.success(`${name} installed`);
    } catch (e) {
      toast.error(`Failed to install ${name}`);
      console.error("[plugins] install failed:", name, e);
    } finally {
      set({ loadingId: null });
    }
  },

  uninstallPlugin: async (name: string) => {
    set({ loadingId: name });
    try {
      await runClaudeCommand(["plugin", "uninstall", name]);
      await get().loadInstalled();
      toast.success(`${name} uninstalled`);
    } catch (e) {
      toast.error(`Failed to uninstall ${name}`);
      console.error("[plugins] uninstall failed:", e);
    } finally {
      set({ loadingId: null });
    }
  },
}));
