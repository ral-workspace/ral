import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  LSPClient,
  languageServerExtensions,
  type Transport,
} from "@codemirror/lsp-client";

// --- Language server config ---

interface LspServerConfig {
  command: string;
  args: string[];
  languageId: string;
}

const LSP_SERVERS: Record<string, LspServerConfig> = {
  ts: {
    command: "typescript-language-server",
    args: ["--stdio"],
    languageId: "typescript",
  },
  tsx: {
    command: "typescript-language-server",
    args: ["--stdio"],
    languageId: "typescriptreact",
  },
  js: {
    command: "typescript-language-server",
    args: ["--stdio"],
    languageId: "javascript",
  },
  jsx: {
    command: "typescript-language-server",
    args: ["--stdio"],
    languageId: "javascriptreact",
  },
  mjs: {
    command: "typescript-language-server",
    args: ["--stdio"],
    languageId: "javascript",
  },
  cjs: {
    command: "typescript-language-server",
    args: ["--stdio"],
    languageId: "javascript",
  },
  json: {
    command: "vscode-json-language-server",
    args: ["--stdio"],
    languageId: "json",
  },
  rs: {
    command: "rust-analyzer",
    args: [],
    languageId: "rust",
  },
  py: {
    command: "pylsp",
    args: [],
    languageId: "python",
  },
  go: {
    command: "gopls",
    args: ["serve"],
    languageId: "go",
  },
  css: {
    command: "vscode-css-language-server",
    args: ["--stdio"],
    languageId: "css",
  },
  html: {
    command: "vscode-html-language-server",
    args: ["--stdio"],
    languageId: "html",
  },
};

// Map multiple extensions to the same server key (for shared servers)
const EXT_TO_SERVER_KEY: Record<string, string> = {
  ts: "ts",
  tsx: "ts", // share typescript-language-server
  js: "ts",
  jsx: "ts",
  mjs: "ts",
  cjs: "ts",
  json: "json",
  rs: "rs",
  py: "py",
  go: "go",
  css: "css",
  scss: "css",
  less: "css",
  html: "html",
  htm: "html",
};

// --- Tauri IPC Transport ---

async function createTauriTransport(
  serverId: number,
): Promise<{ transport: Transport; unlisten: UnlistenFn }> {
  const handlers: Set<(value: string) => void> = new Set();

  const unlisten = await listen<string>(
    `lsp-message-${serverId}`,
    (event) => {
      for (const h of handlers) h(event.payload);
    },
  );

  const transport: Transport = {
    send(message: string) {
      invoke("lsp_send", { id: serverId, message }).catch((err) =>
        console.error("[lsp] send failed:", err),
      );
    },
    subscribe(handler: (value: string) => void) {
      handlers.add(handler);
    },
    unsubscribe(handler: (value: string) => void) {
      handlers.delete(handler);
    },
  };

  return { transport, unlisten };
}

// --- LSP Service ---

interface ActiveServer {
  serverId: number;
  client: LSPClient;
  unlisten: UnlistenFn;
  serverKey: string;
}

const activeServers = new Map<string, ActiveServer>();

function getFileExtension(filePath: string): string {
  const filename = filePath.split("/").pop() ?? "";
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function fileToUri(filePath: string): string {
  return `file://${filePath}`;
}

export function getLspConfig(
  filePath: string,
): { serverKey: string; config: LspServerConfig } | null {
  const ext = getFileExtension(filePath);
  const serverKey = EXT_TO_SERVER_KEY[ext];
  if (!serverKey) return null;
  const config = LSP_SERVERS[serverKey];
  if (!config) return null;
  return { serverKey, config };
}

export async function getOrStartLspClient(
  filePath: string,
  rootPath: string,
): Promise<{ client: LSPClient; languageId: string } | null> {
  const lspConfig = getLspConfig(filePath);
  if (!lspConfig) return null;

  const { serverKey, config } = lspConfig;
  const cacheKey = `${serverKey}:${rootPath}`;

  // Return existing server if already running for this workspace
  const existing = activeServers.get(cacheKey);
  if (existing) {
    return { client: existing.client, languageId: config.languageId };
  }

  // Start new server
  try {
    const serverId = await invoke<number>("lsp_start", {
      command: config.command,
      args: config.args,
      rootPath,
    });

    const { transport, unlisten } = await createTauriTransport(serverId);

    const client = new LSPClient({
      rootUri: fileToUri(rootPath),
      extensions: languageServerExtensions(),
      timeout: 10000,
    });

    client.connect(transport);

    activeServers.set(cacheKey, {
      serverId,
      client,
      unlisten,
      serverKey,
    });

    return { client, languageId: config.languageId };
  } catch (err) {
    console.warn(`[lsp] Failed to start ${config.command}:`, err);
    return null;
  }
}

export async function stopLspServer(cacheKey: string): Promise<void> {
  const server = activeServers.get(cacheKey);
  if (!server) return;

  server.client.disconnect();
  server.unlisten();
  await invoke("lsp_stop", { id: server.serverId }).catch(() => {});
  activeServers.delete(cacheKey);
}

export async function stopAllLspServers(): Promise<void> {
  for (const key of [...activeServers.keys()]) {
    await stopLspServer(key);
  }
}

export function getActiveLspClient(
  filePath: string,
  rootPath: string,
): { client: LSPClient; languageId: string } | null {
  const lspConfig = getLspConfig(filePath);
  if (!lspConfig) return null;

  const cacheKey = `${lspConfig.serverKey}:${rootPath}`;
  const server = activeServers.get(cacheKey);
  if (!server) return null;

  return {
    client: server.client,
    languageId: lspConfig.config.languageId,
  };
}
