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
  opened: boolean; // whether xterm.open() has been called
}

class TerminalService {
  private instances = new Map<number, TerminalInstance>();
  private nextId = 1;
  private activeId: number | null = null;

  async createTerminal(cwd?: string, termSettings?: TerminalSettings): Promise<number> {
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

    this.activeId = id;
    return id;
  }

  attachToDOM(id: number, container: HTMLElement): void {
    const instance = this.instances.get(id);
    if (!instance) return;

    if (!instance.opened) {
      // First time: xterm.open() creates the DOM structure
      instance.xterm.open(container);
      instance.opened = true;
    } else {
      // Re-attach: move the existing DOM element into the new container
      const xtermElement = instance.xterm.element;
      if (xtermElement) {
        container.appendChild(xtermElement);
      }
    }

    // Update background from CSS variable
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

    // Start observing resize
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

    // Stop resize observer but keep everything else alive
    if (instance.resizeObserver) {
      instance.resizeObserver.disconnect();
      instance.resizeObserver = null;
    }
  }

  killTerminal(id: number): void {
    const instance = this.instances.get(id);
    if (!instance) return;

    instance.unlisten();
    if (instance.resizeObserver) {
      instance.resizeObserver.disconnect();
    }
    invoke("kill_terminal", { id: instance.ptyId }).catch(console.error);
    instance.xterm.dispose();
    this.instances.delete(id);

    if (this.activeId === id) {
      this.activeId = null;
    }
  }

  getActiveTerminalId(): number | null {
    return this.activeId;
  }

  setActiveTerminalId(id: number): void {
    this.activeId = id;
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

  private syncResize(instance: TerminalInstance): void {
    invoke("resize_terminal", {
      id: instance.ptyId,
      cols: instance.xterm.cols,
      rows: instance.xterm.rows,
    }).catch(console.error);
  }
}

export const terminalService = new TerminalService();
