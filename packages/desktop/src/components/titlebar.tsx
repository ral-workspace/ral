import { cn, Button } from "@helm/ui";
import {
  IconLayoutSidebar,
  IconLayoutSidebarFilled,
  IconLayoutBottombar,
  IconLayoutBottombarFilled,
  IconLayoutSidebarRight,
  IconLayoutSidebarRightFilled,
  IconSettings,
} from "@tabler/icons-react";
import { useLayoutStore, useEditorStore, useWorkspaceStore } from "../stores";

export function Titlebar() {
  const showSidebar = useLayoutStore((s) => s.showSidebar);
  const showBottomPanel = useLayoutStore((s) => s.showBottomPanel);
  const showSidePanel = useLayoutStore((s) => s.showSidePanel);
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar);
  const toggleBottomPanel = useLayoutStore((s) => s.toggleBottomPanel);
  const toggleSidePanel = useLayoutStore((s) => s.toggleSidePanel);
  const openSettings = useEditorStore((s) => s.openSettings);
  const activeTab = useEditorStore((s) =>
    s.openTabs.find((t) => t.id === s.activeTabId),
  );
  const projectPath = useWorkspaceStore((s) => s.projectPath);

  const folderName = projectPath?.split("/").pop() ?? null;
  const titleParts = [activeTab?.name, folderName].filter(Boolean);
  const title = titleParts.length > 0 ? titleParts.join(" - ") : "Helm";

  return (
    <header className="h-10 select-none border-b bg-sidebar">
      <nav className="relative flex h-full items-center" data-tauri-drag-region>
        {/* Title - absolute center */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="max-w-[50%] truncate text-xs text-muted-foreground">
            {title}
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" data-tauri-drag-region />

        {/* Right: action buttons */}
        <div className="flex items-center gap-1 pr-3">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={toggleSidebar}
            title="Toggle Sidebar"
            className={cn(
              showSidebar ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {showSidebar ? (
              <IconLayoutSidebarFilled className="size-4" />
            ) : (
              <IconLayoutSidebar className="size-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={toggleBottomPanel}
            title="Toggle Bottom Panel"
            className={cn(
              showBottomPanel ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {showBottomPanel ? (
              <IconLayoutBottombarFilled className="size-4" />
            ) : (
              <IconLayoutBottombar className="size-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={toggleSidePanel}
            title="Toggle Side Panel"
            className={cn(
              showSidePanel ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {showSidePanel ? (
              <IconLayoutSidebarRightFilled className="size-4" />
            ) : (
              <IconLayoutSidebarRight className="size-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={openSettings}
            title="Settings"
            className="text-muted-foreground"
          >
            <IconSettings className="size-4" />
          </Button>
        </div>
      </nav>
    </header>
  );
}
