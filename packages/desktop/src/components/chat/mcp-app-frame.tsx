import { useEffect, useMemo, useState } from "react";
import { AppRenderer } from "@mcp-ui/client";
import { resolveResource } from "@tauri-apps/api/path";
import { convertFileSrc } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { SolarLoader } from "@helm/ui";
import type { ToolCallPart } from "../../stores/acp-types";
import { useMcpClientStore } from "../../stores/mcp-client-store";

interface McpAppFrameProps {
  toolCall: ToolCallPart;
}

export function McpAppFrame({ toolCall }: McpAppFrameProps) {
  const [sandboxUrl, setSandboxUrl] = useState<URL | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [height, setHeight] = useState(300);

  const toolUi = toolCall.mcpToolName
    ? useMcpClientStore.getState().getToolUi(toolCall.mcpToolName)
    : null;

  // Memoize to avoid infinite re-render loop (AppFrame's useEffect depends on reference equality)
  const toolResult = useMemo(() => {
    if (toolCall.rawOutput == null) return undefined;
    const text = typeof toolCall.rawOutput === "string" ? toolCall.rawOutput : JSON.stringify(toolCall.rawOutput);
    return { content: [{ type: "text" as const, text }] };
  }, [toolCall.rawOutput]);

  // Resolve sandbox-proxy.html asset URL
  useEffect(() => {
    let cancelled = false;
    resolveResource("sandbox-proxy.html")
      .then((path) => {
        if (cancelled) return;
        const assetUrl = convertFileSrc(path);
        setSandboxUrl(new URL(assetUrl));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(`Failed to resolve sandbox proxy: ${err}`);
      });
    return () => { cancelled = true; };
  }, []);

  // Fetch HTML from MCP server via Rust proxy
  useEffect(() => {
    if (!toolUi) return;
    let cancelled = false;

    useMcpClientStore.getState()
      .readResourceHtml(toolUi.serverUrl, toolUi.resourceUri)
      .then((fetchedHtml) => {
        if (cancelled) return;
        setHtml(fetchedHtml);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(`Failed to fetch MCP resource: ${err}`);
      });

    return () => { cancelled = true; };
  }, [toolUi?.resourceUri]);

  if (error) {
    return (
      <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
        {error}
      </div>
    );
  }

  if (!sandboxUrl || !html) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
        <SolarLoader size={14} />
        Loading MCP App...
      </div>
    );
  }

  return (
    <div className="mcp-app-container mt-1.5 w-full overflow-hidden rounded border" style={{ height }}>
      <AppRenderer
        toolName={toolCall.mcpToolName ?? toolCall.title}
        html={html}
        sandbox={{ url: sandboxUrl }}
        toolInput={toolCall.rawInput}
        toolResult={toolResult}
        onSizeChanged={(params) => {
          console.log("[McpAppFrame] size-changed:", params);
          if (params.height && params.height > 0) {
            setHeight(Math.min(params.height + 2, 600));
          }
          // AppRenderer sets iframe width from size-changed event.
          // Force it back to 100% since the app may report width: 0.
          queueMicrotask(() => {
            const iframe = document.querySelector<HTMLIFrameElement>(
              ".mcp-app-container iframe"
            );
            if (iframe) iframe.style.width = "100%";
          });
        }}
        onOpenLink={async (params) => {
          if (params.url) {
            await openUrl(params.url);
          }
          return {};
        }}
        onError={(err) => {
          console.error("[McpAppFrame] Error:", err);
          setError(err.message);
        }}
      />
    </div>
  );
}
