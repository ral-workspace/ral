import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import type {
  IconThemeManifest,
  IconThemeInfo,
  IconThemeFont,
} from "../types/icon-theme";
import { useSettingsStore } from "./settings-store";

interface IconThemeState {
  availableThemes: IconThemeInfo[];
  activeThemeId: string;
  manifest: IconThemeManifest | null;
  _loaded: boolean;

  loadTheme: (themeId: string) => Promise<void>;
  _initIconTheme: () => Promise<void>;
}

function injectFontFace(font: IconThemeFont, themeDir: string) {
  const styleId = `icon-theme-font-${font.id}`;
  document.getElementById(styleId)?.remove();

  const srcs = font.src
    .map((s) => {
      // Resolve relative path (e.g. "./seti.woff") against the theme's manifest dir
      const absPath = `${themeDir}/icons/${s.path.replace(/^\.\//, "")}`;
      const url = convertFileSrc(absPath);
      return `url("${url}") format("${s.format}")`;
    })
    .join(", ");

  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `@font-face { font-family: "${font.id}"; src: ${srcs}; font-weight: normal; font-style: normal; }`;
  document.head.appendChild(style);
}

export const useIconThemeStore = create<IconThemeState>((set, get) => ({
  availableThemes: [],
  activeThemeId: "material-icon-theme",
  manifest: null,
  _loaded: false,

  loadTheme: async (themeId: string) => {
    const manifest = await invoke<IconThemeManifest>("load_icon_theme", {
      themeId,
    });

    // Inject @font-face for font-based themes (e.g. Seti)
    if (manifest.fonts) {
      for (const font of manifest.fonts) {
        injectFontFace(font, manifest._themeDir);
      }
    }

    set({ manifest, activeThemeId: themeId, _loaded: true });
  },

  _initIconTheme: async () => {
    try {
      await invoke("ensure_icon_themes");
      const themes = await invoke<IconThemeInfo[]>("list_icon_themes");
      set({ availableThemes: themes });

      const { settings } = useSettingsStore.getState();
      const themeId = settings["ui.iconTheme"] ?? "material-icon-theme";
      await get().loadTheme(themeId);
    } catch (err) {
      console.error("[IconTheme] init failed:", err);
    }
  },
}));
