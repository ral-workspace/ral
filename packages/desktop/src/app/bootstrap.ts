import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  useWorkspaceStore,
  useLayoutStore,
  useSettingsStore,
  useIconThemeStore,
  useEditorStore,
  useACPStore,
} from "../stores";

/**
 * Initialize the application: load stores, restore layout, and dismiss splash.
 * Called once on mount.
 */
export async function bootstrap() {
  const isMainWindow = getCurrentWindow().label === "main";
  if (!isMainWindow) {
    useLayoutStore.setState({ showSidebar: false });
  }

  // Phase 1: restore project & settings (ACP needs projectPath to be set first)
  await Promise.all([
    useWorkspaceStore.getState()._loadRecentProjects(isMainWindow),
    useSettingsStore.getState()._initSettings(),
    useIconThemeStore.getState()._initIconTheme(),
    isMainWindow
      ? useEditorStore.getState()._restoreLayout()
      : Promise.resolve(),
  ]);

  // Phase 2: start ACP after projectPath is available (avoids double start)
  useACPStore.getState()._init();

  await getCurrentWindow().show();
  dismissSplash();
}

function dismissSplash() {
  const splash = document.getElementById("splash");
  if (splash) {
    splash.classList.add("hidden");
    splash.addEventListener("transitionend", () => splash.remove());
  }
}
