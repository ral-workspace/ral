import { memo } from "react";
import { cn, SolarLoader } from "@helm/ui";
import { useState, useCallback } from "react";
import type { ToolCallPart, ACPToolCallContent } from "../../stores/acp-types";
import { useEditorStore } from "../../stores";
import { McpAppFrame } from "./mcp-app-frame";
import { ExecuteBlock, TerminalBlock } from "./tool-call-execute";
import { DiffBlock } from "./tool-call-diff";

export const ToolCallCard = memo(function ToolCallCard({ toolCall, showMcpApp = false }: { toolCall: ToolCallPart; showMcpApp?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const _openFile = useEditorStore((s) => s.openFile);
  const openFile = useCallback((path: string) => _openFile(path, false), [_openFile]);

  const dotColor =
    toolCall.status === "completed"
      ? "bg-green-500"
      : toolCall.status === "failed"
        ? "bg-red-500"
        : toolCall.status === "in_progress"
          ? "bg-yellow-500"
          : "bg-muted-foreground";

  // Capitalize kind for display, map "execute" → "Bash"
  const kindLabel = toolCall.kind === "execute"
    ? "Bash"
    : toolCall.kind
      ? toolCall.kind.charAt(0).toUpperCase() + toolCall.kind.slice(1)
      : "Tool";

  // Clean up title: remove leading kind name if duplicated, shorten file paths
  let displayTitle = toolCall.title;
  if (kindLabel && displayTitle.toLowerCase().startsWith(kindLabel.toLowerCase())) {
    displayTitle = displayTitle.slice(kindLabel.length).trimStart();
  }
  displayTitle = displayTitle.replace(
    /(?:\/[\w.\-~]+){2,}/g,
    (match) => match.split("/").pop() ?? match,
  );

  const isInOutKind = toolCall.kind === "execute" || toolCall.kind === "search";
  const hasAutoShowContent = toolCall.content.some((c) => c.type === "diff" || c.type === "terminal") || isInOutKind;
  const hasContent = toolCall.content.length > 0;

  return (
    <div className="flex gap-2.5">
      {/* Bullet dot */}
      <div className="flex h-[15px] w-2.5 shrink-0 items-center justify-center overflow-visible">
        {toolCall.status === "in_progress" || toolCall.status === "pending" ? (
          <SolarLoader size={14} />
        ) : (
          <span className={cn("size-[7px] rounded-full", dotColor)} />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {/* Header */}
        <button
          onClick={() => {
            if (toolCall.locations.length > 0) {
              openFile(toolCall.locations[0].path);
            } else {
              setExpanded(!expanded);
            }
          }}
          className="flex w-full items-center gap-1.5 text-left text-xs leading-4"
        >
          <span className="font-semibold text-foreground">{kindLabel}</span>
          <span className={cn(
            "flex-1 truncate",
            toolCall.locations.length > 0
              ? "text-blue-400 hover:underline"
              : "text-muted-foreground",
          )}>
            {displayTitle}
          </span>
        </button>

        {/* MCP App UI — only render for the latest toolCall per resourceUri */}
        {showMcpApp && toolCall.uiResourceUri && (
          <McpAppFrame toolCall={toolCall} />
        )}

        {/* Execute/Search tool calls: always show IN/OUT box */}
        {!toolCall.uiResourceUri && isInOutKind && hasContent && (
          <div className="mt-1.5">
            <ExecuteBlock command={toolCall.title} content={toolCall.content} isRunning={toolCall.status === "in_progress"} />
          </div>
        )}

        {/* Expanded content (non-inout) */}
        {!toolCall.uiResourceUri && !isInOutKind && expanded && hasContent && (
          <div className="mt-1.5 space-y-1.5">
            {toolCall.content.map((item, i) => (
              <ToolCallContentBlock key={i} item={item} />
            ))}
          </div>
        )}

        {/* Auto-show diffs and terminals when not expanded (non-execute) */}
        {!toolCall.uiResourceUri && !isInOutKind && !expanded && hasAutoShowContent && (
          <div className="mt-1.5 space-y-1.5">
            {toolCall.content
              .filter((c) => c.type === "diff" || c.type === "terminal")
              .map((item, i) => (
                <ToolCallContentBlock key={i} item={item} />
              ))}
          </div>
        )}
      </div>
    </div>
  );
});

function ToolCallContentBlock({ item }: { item: ACPToolCallContent }) {
  if (item.type === "diff") {
    return <DiffBlock diff={item} />;
  }

  if (item.type === "terminal") {
    return <TerminalBlock terminal={item} />;
  }

  // type === "content"
  return (
    <pre className="max-h-40 overflow-auto rounded bg-background p-2 text-[10px] text-muted-foreground">
      {typeof item.content === "string"
        ? item.content
        : JSON.stringify(item.content, null, 2)}
    </pre>
  );
}
