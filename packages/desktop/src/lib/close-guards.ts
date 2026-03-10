import { ask } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useEditorStore, useSettingsStore } from "../stores";
import { getActiveEditorView, getBufferContent } from "../hooks/use-codemirror";
import { addHistoryEntry } from "../services/history-service";

export type CloseAction = "saved" | "discarded" | "cancelled";

/**
 * Confirm close for a single file.
 * If the file is not dirty, returns "discarded" immediately.
 * Otherwise shows a 2-step native dialog: Save → Discard → Cancel.
 */
export async function confirmAndClose(filePath: string): Promise<CloseAction> {
  const { dirtyFiles } = useEditorStore.getState();
  if (!dirtyFiles.has(filePath)) return "discarded";

  const fileName = filePath.split("/").pop() ?? filePath;
  const shouldSave = await ask(`Save changes to "${fileName}"?`, {
    title: "Unsaved Changes",
    okLabel: "Save",
    cancelLabel: "Cancel",
  });

  if (shouldSave) {
    const ok = await saveFile(filePath);
    return ok ? "saved" : "cancelled";
  }

  const shouldDiscard = await ask("Discard unsaved changes?", {
    title: "Unsaved Changes",
    okLabel: "Discard",
    cancelLabel: "Cancel",
  });

  return shouldDiscard ? "discarded" : "cancelled";
}

/**
 * Confirm close for multiple files.
 * Only prompts if at least one file is dirty.
 */
export async function confirmAndCloseMultiple(
  filePaths: string[],
): Promise<CloseAction> {
  const { dirtyFiles } = useEditorStore.getState();
  const dirtyPaths = filePaths.filter((p) => dirtyFiles.has(p));
  if (dirtyPaths.length === 0) return "discarded";

  const shouldSave = await ask(
    `${dirtyPaths.length} file(s) have unsaved changes. Save all?`,
    { title: "Unsaved Changes", okLabel: "Save All", cancelLabel: "Cancel" },
  );

  if (shouldSave) {
    const results = await Promise.all(dirtyPaths.map(saveFile));
    return results.every(Boolean) ? "saved" : "cancelled";
  }

  const shouldDiscard = await ask("Discard all unsaved changes?", {
    title: "Unsaved Changes",
    okLabel: "Discard All",
    cancelLabel: "Cancel",
  });

  return shouldDiscard ? "discarded" : "cancelled";
}

async function saveFile(filePath: string): Promise<boolean> {
  try {
    const view = getActiveEditorView();
    const { activeTabId } = useEditorStore.getState();
    const content =
      filePath === activeTabId && view
        ? view.state.doc.toString()
        : getBufferContent(filePath);
    if (content === null) return false;

    await invoke("write_file", { path: filePath, content });
    useEditorStore.getState().markClean(filePath);

    const s = useSettingsStore.getState().settings;
    if (s["history.enabled"]) {
      addHistoryEntry(
        filePath,
        content,
        "save",
        s["history.maxEntries"],
        s["history.maxFileSize"],
      ).catch(() => {});
    }
    return true;
  } catch (err) {
    console.error(`Save failed for ${filePath}:`, err);
    return false;
  }
}
