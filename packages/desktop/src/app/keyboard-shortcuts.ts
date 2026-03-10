import { useLayoutStore, useEditorStore } from "../stores";
import { findGroupIds } from "../stores/editor-store";
import { getCommands } from "../lib/commands";

export interface KeyboardCallbacks {
  toggleCommandPalette: () => void;
  toggleQuickOpen: () => void;
  toggleGoToLine: () => void;
}

/**
 * Register global keyboard shortcuts.
 * Returns an unlisten function to tear down the listener.
 */
export function registerKeyboardShortcuts(cb: KeyboardCallbacks): () => void {
  const handler = (e: KeyboardEvent) => {
    // Cmd+Shift+P: Command Palette
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "p") {
      e.preventDefault();
      cb.toggleCommandPalette();
    }
    // Cmd+P: Quick Open
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "p") {
      e.preventDefault();
      cb.toggleQuickOpen();
    }
    // Cmd+Shift+F: Focus search sidebar
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "f") {
      e.preventDefault();
      useLayoutStore.getState().setSidebarView("search");
    }
    // Ctrl+Shift+`: New terminal
    if (e.ctrlKey && e.shiftKey && e.key === "`") {
      e.preventDefault();
      const { run } =
        getCommands().find((c) => c.id === "workbench.action.terminal.new") ?? {};
      run?.();
    }
    // Ctrl+G: Go to line
    if (e.ctrlKey && !e.shiftKey && !e.metaKey && e.key.toLowerCase() === "g") {
      e.preventDefault();
      cb.toggleGoToLine();
    }
    // Cmd+\: Split editor right
    if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
      e.preventDefault();
      const { activeGroupId, splitGroup } = useEditorStore.getState();
      splitGroup(activeGroupId, "horizontal");
    }
    // Cmd+1..9: Focus pane by index
    if (
      (e.metaKey || e.ctrlKey) &&
      !e.shiftKey &&
      ["1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(e.key)
    ) {
      const idx = parseInt(e.key) - 1;
      const { splitRoot, setActiveGroup } = useEditorStore.getState();
      const groupIds = findGroupIds(splitRoot);
      if (groupIds.length > 1 && idx < groupIds.length) {
        e.preventDefault();
        setActiveGroup(groupIds[idx]);
      }
    }
  };

  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}
