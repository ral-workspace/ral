import { open } from "@tauri-apps/plugin-dialog";
import { IconFolderOpen } from "@tabler/icons-react";
import { useWorkspaceStore } from "../stores";

export function WelcomeScreen() {
  const selectFolder = useWorkspaceStore((s) => s.selectFolder);
  const recentProjects = useWorkspaceStore((s) => s.recentProjects);

  async function handleOpenProject() {
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      selectFolder(selected);
    }
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-foreground">Helm</h1>
        <p className="mt-1 text-sm text-muted-foreground">AI Workspace</p>
      </div>

      {/* Action Cards */}
      <div className="flex gap-3">
        <button
          onClick={handleOpenProject}
          className="flex w-44 flex-col gap-2 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent"
        >
          <IconFolderOpen className="size-5 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">
            Open project
          </span>
        </button>
      </div>

      {/* Recent Projects */}
      <div className="w-80">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Recent projects
          </span>
        </div>
        {recentProjects.length > 0 ? (
          <div className="mt-2 flex flex-col">
            {recentProjects.map((path) => (
              <button
                key={path}
                onClick={() => selectFolder(path)}
                className="rounded px-2 py-1.5 text-left text-[13px] text-foreground/80 hover:bg-accent"
              >
                <span className="font-medium">{path.split("/").pop()}</span>
                <span className="ml-2 text-xs text-muted-foreground truncate">
                  {path}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-2 text-center">
            <p className="text-xs text-muted-foreground/50">
              No recent projects
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
