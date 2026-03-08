import { invoke } from "@tauri-apps/api/core";

export interface HistoryEntry {
  id: string;
  timestamp: number;
  source: string;
}

export async function addHistoryEntry(
  filePath: string,
  content: string,
  source: string,
  maxEntries: number,
  maxFileSizeMb: number,
): Promise<void> {
  await invoke("add_history_entry", {
    filePath,
    content,
    source,
    maxEntries,
    maxFileSizeMb,
  });
}

export async function getHistoryEntries(
  filePath: string,
): Promise<HistoryEntry[]> {
  return invoke<HistoryEntry[]>("get_history_entries", { filePath });
}

export async function getHistoryContent(
  filePath: string,
  entryId: string,
): Promise<string> {
  return invoke<string>("get_history_content", { filePath, entryId });
}

export async function deleteHistoryEntry(
  filePath: string,
  entryId: string,
): Promise<void> {
  await invoke("delete_history_entry", { filePath, entryId });
}

export async function restoreHistoryEntry(
  filePath: string,
  entryId: string,
  maxEntries: number,
  maxFileSizeMb: number,
): Promise<string> {
  return invoke<string>("restore_history_entry", {
    filePath,
    entryId,
    maxEntries,
    maxFileSizeMb,
  });
}
