import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export type NativeMenuItem =
  | { type: "item"; id: string; label: string; disabled?: boolean }
  | { type: "separator" }
  | { type: "submenu"; label: string; items: NativeMenuItem[] }
  | {
      type: "check";
      id: string;
      label: string;
      checked: boolean;
      disabled?: boolean;
    };

/**
 * Show a native OS context menu and return the selected item's id,
 * or null if the menu was dismissed.
 */
export function showNativeContextMenu(
  items: NativeMenuItem[],
): Promise<string | null> {
  return invoke<string | null>("show_context_menu", {
    items,
    windowLabel: getCurrentWindow().label,
  });
}
