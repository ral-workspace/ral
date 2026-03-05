import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { homeDir } from "@tauri-apps/api/path";

export interface PluginInfo {
  id: string;
  name: string;
  description: string;
  npmPackage: string;
}

/** Hard-coded list of available @nvq plugins */
export const AVAILABLE_PLUGINS: PluginInfo[] = [
  {
    id: "database",
    name: "Database",
    description: "Create and edit .db.yaml database files — Notion-like tables and boards as YAML",
    npmPackage: "@nvq/claude-plugin-database",
  },
  {
    id: "presentation",
    name: "Presentation",
    description: "Create PowerPoint (.pptx) presentations using python-pptx",
    npmPackage: "@nvq/claude-plugin-presentation",
  },
  {
    id: "spreadsheet",
    name: "Spreadsheet",
    description: "Create Excel (.xlsx) spreadsheets using openpyxl",
    npmPackage: "@nvq/claude-plugin-spreadsheet",
  },
];

interface PluginState {
  /** Map of plugin npm package name → enabled */
  installedPlugins: Record<string, boolean>;
  /** Currently installing/uninstalling plugin id */
  loadingId: string | null;
  /** Load installed plugins from ~/.claude/settings.json */
  loadInstalled: () => Promise<void>;
  /** Install a plugin via claude CLI */
  installPlugin: (pluginId: string) => Promise<void>;
  /** Uninstall a plugin via claude CLI */
  uninstallPlugin: (pluginId: string) => Promise<void>;
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

export const usePluginStore = create<PluginState>((set, get) => ({
  installedPlugins: {},
  loadingId: null,

  loadInstalled: async () => {
    const settings = await readClaudeSettings();
    const enabled = (settings.enabledPlugins ?? {}) as Record<string, boolean>;
    set({ installedPlugins: enabled });
  },

  installPlugin: async (pluginId: string) => {
    const plugin = AVAILABLE_PLUGINS.find((p) => p.id === pluginId);
    if (!plugin) return;

    set({ loadingId: pluginId });
    try {
      await runClaudeCommand(["plugin", "install", plugin.npmPackage]);
      await get().loadInstalled();
    } finally {
      set({ loadingId: null });
    }
  },

  uninstallPlugin: async (pluginId: string) => {
    const plugin = AVAILABLE_PLUGINS.find((p) => p.id === pluginId);
    if (!plugin) return;

    set({ loadingId: pluginId });
    try {
      await runClaudeCommand(["plugin", "uninstall", plugin.npmPackage]);
      await get().loadInstalled();
    } finally {
      set({ loadingId: null });
    }
  },
}));
