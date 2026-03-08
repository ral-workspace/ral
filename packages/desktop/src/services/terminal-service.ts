import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { TerminalSettings } from "../settings/schema";
import "@xterm/xterm/css/xterm.css";

const XTERM_THEME = {
  foreground: "#cccccc",
  cursor: "#cccccc",
  selectionBackground: "#264f78",
  black: "#000000",
  red: "#cd3131",
  green: "#0dbc79",
  yellow: "#e5e510",
  blue: "#2472c8",
  magenta: "#bc3fbc",
  cyan: "#11a8cd",
  white: "#e5e5e5",
  brightBlack: "#666666",
  brightRed: "#f14c4c",
  brightGreen: "#23d18b",
  brightYellow: "#f5f543",
  brightBlue: "#3b8eea",
  brightMagenta: "#d670d6",
  brightCyan: "#29b8db",
  brightWhite: "#e5e5e5",
};

interface TerminalInstance {
  xterm: XTerm;
  fitAddon: FitAddon;
  unlisten: UnlistenFn;
  ptyId: number;
  resizeObserver: ResizeObserver | null;
  opened: boolean;
}

/** A group represents a tab that may contain multiple split panes */
interface TerminalGroup {
  instanceIds: number[];
  activeInstanceId: number;
}

type TerminalChangeListener = () => void;

class TerminalService {
  private instances = new Map<number, TerminalInstance>();
  private groups = new Map<number, TerminalGroup>();
  private nextId = 1;
  private nextGroupId = 1;
  private activeGroupId: number | null = null;
  private listeners = new Set<TerminalChangeListener>();
  private cachedGroupIds: number[] = [];

  subscribe(listener: TerminalChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.cachedGroupIds = [...this.groups.keys()];
    for (const l of this.listeners) l();
  }

  /** Returns ordered list of group ids (each group = one tab) */
  getGroupIds(): number[] {
    return this.cachedGroupIds;
  }

  getGroup(groupId: number): TerminalGroup | undefined {
    return this.groups.get(groupId);
  }

  getActiveGroupId(): number | null {
    return this.activeGroupId;
  }

  setActiveGroupId(groupId: number): void {
    if (this.activeGroupId === groupId) return;
    this.activeGroupId = groupId;
    this.notify();
  }

  /** Get active instance id within a group */
  getActiveInstanceInGroup(groupId: number): number | null {
    const group = this.groups.get(groupId);
    return group?.activeInstanceId ?? null;
  }

  setActiveInstanceInGroup(groupId: number, instanceId: number): void {
    const group = this.groups.get(groupId);
    if (!group || !group.instanceIds.includes(instanceId)) return;
    group.activeInstanceId = instanceId;
    this.notify();
  }

  // --- backwards compat helpers used by Terminal component ---

  /** Returns ordered list of all terminal ids (flat, for legacy callers) */
  getTerminalIds(): number[] {
    return this.getGroupIds();
  }

  getActiveTerminalId(): number | null {
    return this.activeGroupId;
  }

  setActiveTerminalId(id: number): void {
    this.setActiveGroupId(id);
  }

  /** Create a new terminal in a new group (new tab) */
  async createTerminal(cwd?: string, termSettings?: TerminalSettings): Promise<number> {
    const instanceId = await this._createInstance(cwd, termSettings);
    const groupId = this.nextGroupId++;
    this.groups.set(groupId, {
      instanceIds: [instanceId],
      activeInstanceId: instanceId,
    });
    this.activeGroupId = groupId;
    this.notify();
    return groupId;
  }

  /** Split the active instance in a group — creates a new instance in the same group */
  async splitTerminal(groupId: number, cwd?: string, termSettings?: TerminalSettings): Promise<number | null> {
    const group = this.groups.get(groupId);
    if (!group) return null;

    const instanceId = await this._createInstance(cwd, termSettings);
    // Insert after the active instance (like VS Code's addInstance)
    const activeIdx = group.instanceIds.indexOf(group.activeInstanceId);
    group.instanceIds.splice(activeIdx + 1, 0, instanceId);
    group.activeInstanceId = instanceId;
    this.notify();
    return instanceId;
  }

  /** Kill a specific instance. If it's the last in a group, remove the group. */
  killInstance(instanceId: number): void {
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    instance.unlisten();
    if (instance.resizeObserver) {
      instance.resizeObserver.disconnect();
    }
    invoke("kill_terminal", { id: instance.ptyId }).catch(console.error);
    instance.xterm.dispose();
    this.instances.delete(instanceId);

    // Remove from group
    for (const [groupId, group] of this.groups) {
      const idx = group.instanceIds.indexOf(instanceId);
      if (idx === -1) continue;

      group.instanceIds.splice(idx, 1);
      if (group.instanceIds.length === 0) {
        // Group is empty, remove it
        this.groups.delete(groupId);
        if (this.activeGroupId === groupId) {
          const gids = this.getGroupIds();
          this.activeGroupId = gids.length > 0 ? gids[gids.length - 1] : null;
        }
      } else if (group.activeInstanceId === instanceId) {
        // Switch to nearest instance
        group.activeInstanceId = group.instanceIds[Math.min(idx, group.instanceIds.length - 1)];
      }
      break;
    }
    this.notify();
  }

  /** Kill an entire group (tab) */
  killTerminal(groupId: number): void {
    const group = this.groups.get(groupId);
    if (!group) return;

    // Kill all instances in the group
    for (const instId of [...group.instanceIds]) {
      const instance = this.instances.get(instId);
      if (instance) {
        instance.unlisten();
        if (instance.resizeObserver) {
          instance.resizeObserver.disconnect();
        }
        invoke("kill_terminal", { id: instance.ptyId }).catch(console.error);
        instance.xterm.dispose();
        this.instances.delete(instId);
      }
    }

    this.groups.delete(groupId);
    if (this.activeGroupId === groupId) {
      const gids = this.getGroupIds();
      this.activeGroupId = gids.length > 0 ? gids[gids.length - 1] : null;
    }
    this.notify();
  }

  attachToDOM(id: number, container: HTMLElement): void {
    const instance = this.instances.get(id);
    if (!instance) return;

    if (!instance.opened) {
      instance.xterm.open(container);
      instance.opened = true;
    } else {
      const xtermElement = instance.xterm.element;
      if (xtermElement) {
        container.appendChild(xtermElement);
      }
    }

    const styles = getComputedStyle(container);
    const bg = styles.getPropertyValue("--background").trim();
    if (bg) {
      instance.xterm.options.theme = {
        ...XTERM_THEME,
        background: bg,
      };
    }

    requestAnimationFrame(() => {
      instance.fitAddon.fit();
      this.syncResize(instance);
    });

    instance.resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        instance.fitAddon.fit();
        this.syncResize(instance);
      });
    });
    instance.resizeObserver.observe(container);
  }

  detachFromDOM(id: number): void {
    const instance = this.instances.get(id);
    if (!instance) return;

    if (instance.resizeObserver) {
      instance.resizeObserver.disconnect();
      instance.resizeObserver = null;
    }
  }

  updateTerminalSettings(termSettings: TerminalSettings): void {
    for (const [, instance] of this.instances) {
      instance.xterm.options.fontSize = termSettings["terminal.fontSize"];
      instance.xterm.options.fontFamily = termSettings["terminal.fontFamily"];
      instance.xterm.options.lineHeight = termSettings["terminal.lineHeight"];
      instance.xterm.options.cursorBlink = termSettings["terminal.cursorBlink"];
      if (instance.opened) {
        instance.fitAddon.fit();
        this.syncResize(instance);
      }
    }
  }

  private async _createInstance(cwd?: string, termSettings?: TerminalSettings): Promise<number> {
    const xterm = new XTerm({
      cursorBlink: termSettings?.["terminal.cursorBlink"] ?? true,
      fontSize: termSettings?.["terminal.fontSize"] ?? 12,
      lineHeight: termSettings?.["terminal.lineHeight"] ?? 1,
      fontFamily: termSettings?.["terminal.fontFamily"] ?? "Menlo, Monaco, 'Courier New', monospace",
      theme: {
        ...XTERM_THEME,
        background: "#1e1e1e",
      },
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);

    const ptyId = await invoke<number>("spawn_terminal", {
      cwd: cwd ?? null,
    });

    const unlisten = await listen<string>(
      `terminal-output-${ptyId}`,
      (event) => {
        xterm.write(event.payload);
      },
    );

    xterm.onData((data: string) => {
      invoke("write_terminal", { id: ptyId, data }).catch(console.error);
    });

    const id = this.nextId++;
    this.instances.set(id, {
      xterm,
      fitAddon,
      unlisten,
      ptyId,
      resizeObserver: null,
      opened: false,
    });

    return id;
  }

  private syncResize(instance: TerminalInstance): void {
    invoke("resize_terminal", {
      id: instance.ptyId,
      cols: instance.xterm.cols,
      rows: instance.xterm.rows,
    }).catch(console.error);
  }
}

export const terminalService = new TerminalService();
