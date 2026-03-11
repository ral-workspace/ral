import { invoke } from "@tauri-apps/api/core";

export async function createFile(path: string): Promise<void> {
  await invoke("create_file", { path });
}

export async function createDir(path: string): Promise<void> {
  await invoke("create_dir", { path });
}

export async function renamePath(from: string, to: string): Promise<void> {
  await invoke("rename_path", { from, to });
}

export async function deletePath(path: string): Promise<void> {
  await invoke("delete_path", { path });
}
