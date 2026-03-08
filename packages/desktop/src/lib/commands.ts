import { useEditorStore, useACPStore } from "../stores";
import { useLayoutStore, useWorkspaceStore, useSettingsStore } from "../stores";
import { terminalService } from "../services/terminal-service";

export interface Command {
  id: string;
  label: string;
  category?: string;
  run: () => void;
}

const commands: Command[] = [];

export function registerCommand(command: Command): void {
  if (!commands.find((c) => c.id === command.id)) {
    commands.push(command);
  }
}

export function getCommands(): Command[] {
  return commands;
}

export function filterCommands(query: string): Command[] {
  if (!query) return commands;
  const lower = query.toLowerCase();
  return commands.filter((cmd) => {
    const display = cmd.category ? `${cmd.category}: ${cmd.label}` : cmd.label;
    return display.toLowerCase().includes(lower);
  });
}

// Built-in commands
registerCommand({
  id: "simpleBrowser.show",
  label: "Show",
  category: "Simple Browser",
  run: () => {
    useEditorStore.getState().openBrowser("http://localhost:3000");
  },
});

registerCommand({
  id: "workbench.action.toggleSidebar",
  label: "Toggle Primary Sidebar Visibility",
  category: "View",
  run: () => useLayoutStore.getState().toggleSidebar(),
});

registerCommand({
  id: "workbench.action.togglePanel",
  label: "Toggle Panel",
  category: "View",
  run: () => useLayoutStore.getState().toggleBottomPanel(),
});

registerCommand({
  id: "workbench.action.openSettings",
  label: "Open Settings",
  category: "Preferences",
  run: () => useEditorStore.getState().openSettings(),
});

registerCommand({
  id: "acp.startAgent",
  label: "Start AI Agent",
  category: "AI",
  run: () => {
    if (!useLayoutStore.getState().showSidePanel) {
      useLayoutStore.getState().toggleSidePanel();
    }
    useACPStore
      .getState()
      .startAgent(useWorkspaceStore.getState().projectPath ?? ".");
  },
});

registerCommand({
  id: "acp.stopAgent",
  label: "Stop AI Agent",
  category: "AI",
  run: () => useACPStore.getState().stopAgent(),
});

registerCommand({
  id: "workbench.action.toggleAiPanel",
  label: "Toggle AI Panel",
  category: "View",
  run: () => useLayoutStore.getState().toggleSidePanel(),
});

registerCommand({
  id: "workbench.action.findInFiles",
  label: "Find in Files",
  category: "Search",
  run: () => useLayoutStore.getState().setSidebarView("search"),
});

registerCommand({
  id: "workbench.action.terminal.new",
  label: "Create New Terminal",
  category: "Terminal",
  run: () => {
    const layout = useLayoutStore.getState();
    if (!layout.showBottomPanel) layout.setShowBottomPanel(true);
    const cwd = useWorkspaceStore.getState().projectPath ?? undefined;
    const settings = useSettingsStore.getState().settings;
    terminalService.createTerminal(cwd, settings);
  },
});

registerCommand({
  id: "workbench.action.terminal.split",
  label: "Split Terminal",
  category: "Terminal",
  run: () => {
    const layout = useLayoutStore.getState();
    if (!layout.showBottomPanel) layout.setShowBottomPanel(true);
    const groupId = terminalService.getActiveGroupId();
    if (groupId !== null) {
      const cwd = useWorkspaceStore.getState().projectPath ?? undefined;
      const settings = useSettingsStore.getState().settings;
      terminalService.splitTerminal(groupId, cwd, settings);
    }
  },
});

registerCommand({
  id: "workbench.action.terminal.kill",
  label: "Kill Active Terminal",
  category: "Terminal",
  run: () => {
    const id = terminalService.getActiveTerminalId();
    if (id !== null) terminalService.killTerminal(id);
  },
});
