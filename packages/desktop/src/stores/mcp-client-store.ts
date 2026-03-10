import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

interface McpToolInfo {
  name: string;
  description: string | null;
  resourceUri: string | null;
}

interface ToolUiInfo {
  serverName: string;
  serverUrl: string;
  resourceUri: string;
}

export interface McpServerConfig {
  name: string;
  url: string;
  enabled: boolean;
}

const DEFAULT_MCP_SERVERS: McpServerConfig[] = [
  { name: "Excalidraw", url: "https://mcp.excalidraw.com/mcp", enabled: true },
];

interface McpClientState {
  /** Tool name → UI resource info mapping */
  toolUiMap: Record<string, ToolUiInfo>;
  /** Cached HTML keyed by resourceUri */
  htmlCache: Record<string, string>;
  /** Connected server URLs */
  connectedServers: Set<string>;
  /** Connection errors keyed by server name */
  errors: Record<string, string>;
}

interface McpClientActions {
  connect(serverName: string, url: string): Promise<void>;
  connectFromConfig(): Promise<void>;
  readResourceHtml(serverUrl: string, resourceUri: string): Promise<string>;
  getToolUi(mcpToolName: string): ToolUiInfo | null;
}

/**
 * Extracts server name and tool name from ACP mcpToolName format.
 * e.g. "mcp__claude_ai_Excalidraw__create_view" → { server: "Excalidraw", tool: "create_view" }
 */
function parseMcpToolName(mcpToolName: string): { server: string; tool: string } | null {
  const match = mcpToolName.match(/^mcp__claude_ai_(.+?)__(.+)$/);
  if (!match) return null;
  return { server: match[1], tool: match[2] };
}

export const useMcpClientStore = create<McpClientState & McpClientActions>((set, get) => ({
  toolUiMap: {},
  htmlCache: {},
  connectedServers: new Set(),
  errors: {},

  connect: async (serverName: string, url: string) => {
    if (get().connectedServers.has(url)) {
      console.log(`[mcp-client] ${serverName}: already connected, skipping`);
      return;
    }

    console.log(`[mcp-client] ${serverName}: connecting to ${url}...`);
    const t0 = performance.now();

    try {
      // Rust handles: initialize → initialized → tools/list
      const tools = await invoke<McpToolInfo[]>("mcp_connect", { name: serverName, url });
      const t1 = performance.now();
      console.log(`[mcp-client] ${serverName}: connected, ${tools.length} tools (${(t1 - t0).toFixed(0)}ms)`);

      const newToolUiEntries: Record<string, ToolUiInfo> = {};
      for (const tool of tools) {
        if (tool.resourceUri) {
          newToolUiEntries[tool.name] = {
            serverName,
            serverUrl: url,
            resourceUri: tool.resourceUri,
          };
        }
      }

      set((state) => ({
        connectedServers: new Set([...state.connectedServers, url]),
        toolUiMap: { ...state.toolUiMap, ...newToolUiEntries },
        errors: { ...state.errors, [serverName]: undefined } as Record<string, string>,
      }));

      console.log(
        `[mcp-client] ${serverName}: ready, UI tools: [${Object.keys(newToolUiEntries).join(", ")}] (total ${(performance.now() - t0).toFixed(0)}ms)`,
      );
    } catch (e) {
      const elapsed = performance.now() - t0;
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[mcp-client] ${serverName}: connection failed after ${elapsed.toFixed(0)}ms:`, message);
      set((state) => ({
        errors: { ...state.errors, [serverName]: message },
      }));
    }
  },

  connectFromConfig: async () => {
    for (const server of DEFAULT_MCP_SERVERS) {
      if (server.enabled) {
        get().connect(server.name, server.url);
      }
    }
  },

  readResourceHtml: async (serverUrl: string, resourceUri: string) => {
    // Check cache first
    const cached = get().htmlCache[resourceUri];
    if (cached) {
      console.log(`[mcp-client] cache hit for ${resourceUri} (${cached.length} bytes)`);
      return cached;
    }

    console.log(`[mcp-client] reading resource: ${resourceUri}...`);
    const t0 = performance.now();

    // Rust handles the JSON-RPC call
    const html = await invoke<string>("mcp_read_resource", { url: serverUrl, uri: resourceUri });

    const endsWithHtml = html.trimEnd().endsWith("</html>");
    console.log(`[mcp-client] resource read: ${html.length} chars (${(performance.now() - t0).toFixed(0)}ms), ends with </html>: ${endsWithHtml}, last 50: "${html.slice(-50)}"`);

    // Cache the result
    set((state) => ({
      htmlCache: { ...state.htmlCache, [resourceUri]: html },
    }));

    return html;
  },

  getToolUi: (mcpToolName: string) => {
    const parsed = parseMcpToolName(mcpToolName);
    if (!parsed) return null;

    const { toolUiMap } = get();
    const uiInfo = toolUiMap[parsed.tool];
    if (!uiInfo) return null;

    if (uiInfo.serverName.toLowerCase() !== parsed.server.toLowerCase()) return null;

    return uiInfo;
  },
}));
