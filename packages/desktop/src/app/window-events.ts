import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  useWorkspaceStore,
  useLayoutStore,
  useEditorStore,
} from "../stores";
import { invalidateBufferCache } from "../hooks/use-codemirror";

/**
 * Register the single-instance / CLI "open-project" listener.
 * Returns an unlisten function.
 */
export function registerOpenProjectListener(): () => void {
  const unlisten = listen<string>("open-project", (event) => {
    const path = event.payload;
    if (path) {
      useWorkspaceStore.getState().selectFolder(path);
    }
  });
  return () => { unlisten.then((fn) => fn()); };
}

/**
 * Start the file watcher for a project and listen for changes.
 * Returns a cleanup function that stops the watcher and removes the listener.
 */
export function startFileWatcher(projectPath: string): () => void {
  invoke("start_file_watcher", { path: projectPath }).catch((err) =>
    console.error("Failed to start file watcher:", err),
  );

  const unlisten = listen<string>("file-changed", (event) => {
    const changedPath = event.payload;
    if (!changedPath.startsWith(projectPath)) return;
    invalidateBufferCache(changedPath);
    useEditorStore.getState().bumpFileVersion(changedPath);
    useLayoutStore.getState().bumpFileTreeRefresh();
  });

  return () => {
    invoke("stop_file_watcher", { path: projectPath }).catch(() => {});
    unlisten.then((fn) => fn());
  };
}
