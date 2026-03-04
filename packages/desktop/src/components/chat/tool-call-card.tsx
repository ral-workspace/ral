import { cn, SolarLoader } from "@helm/ui";
import { useState, useCallback } from "react";
import {
  IconPencil,
  IconFilePlus,
} from "@tabler/icons-react";
import { createTwoFilesPatch } from "diff";
import type { ACPToolCall, ACPToolCallContent } from "../../stores/acp-types";
import { useEditorStore } from "../../stores";

export function ToolCallCard({ toolCall }: { toolCall: ACPToolCall }) {
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

        {/* Execute/Search tool calls: always show IN/OUT box */}
        {isInOutKind && hasContent && (
          <div className="mt-1.5">
            <ExecuteBlock command={toolCall.title} content={toolCall.content} isRunning={toolCall.status === "in_progress"} />
          </div>
        )}

        {/* Expanded content (non-inout) */}
        {!isInOutKind && expanded && hasContent && (
          <div className="mt-1.5 space-y-1.5">
            {toolCall.content.map((item, i) => (
              <ToolCallContentBlock
                key={i}
                item={item}
              />
            ))}
          </div>
        )}

        {/* Auto-show diffs and terminals when not expanded (non-execute) */}
        {!isInOutKind && !expanded && hasAutoShowContent && (
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
}

function ToolCallContentBlock({
  item,
}: {
  item: ACPToolCallContent;
}) {
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

function ExecuteBlock({
  command,
  content,
  isRunning,
}: {
  command: string;
  content: ACPToolCallContent[];
  isRunning: boolean;
}) {
  // Parse text content items: code blocks = output
  let output = "";

  for (const item of content) {
    if (item.type !== "content") continue;
    const text =
      typeof item.content === "object" &&
      item.content !== null &&
      "text" in (item.content as Record<string, unknown>)
        ? (item.content as { text: string }).text
        : typeof item.content === "string"
          ? item.content
          : "";
    if (!text) continue;

    // Check if text is a code block → output
    const codeBlockMatch = text.match(/^```(?:\w*)\n([\s\S]*?)```\s*$/);
    if (codeBlockMatch) {
      output += (output ? "\n" : "") + codeBlockMatch[1].trimEnd();
    }
  }

  const hasOutput = output.length > 0;

  return (
    <div className="overflow-hidden rounded border bg-background font-mono text-[10px]">
      {/* IN — actual command from title */}
      <div className={cn("flex gap-2 px-2 py-1.5", (hasOutput || isRunning) && "border-b")}>
        <span className="shrink-0 select-none text-muted-foreground">IN</span>
        <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all text-foreground">
          {command}
        </pre>
      </div>
      {/* OUT — output */}
      {hasOutput && (
        <div className="flex gap-2 px-2 py-1.5">
          <span className="shrink-0 select-none text-muted-foreground">OUT</span>
          <pre className="max-h-40 min-w-0 flex-1 overflow-auto whitespace-pre-wrap break-all text-muted-foreground">
            {output}
          </pre>
        </div>
      )}
      {/* Running state — waiting for output */}
      {!hasOutput && isRunning && (
        <div className="flex items-center gap-2 px-2 py-1.5 text-muted-foreground">
          <SolarLoader size={12} />
          Running...
        </div>
      )}
    </div>
  );
}

function TerminalBlock({
  terminal,
}: {
  terminal: { terminalId: string; command?: string; output?: string };
}) {
  const hasOutput = terminal.output && terminal.output.trim().length > 0;

  return (
    <div className="overflow-hidden rounded border bg-background font-mono text-[10px]">
      {/* IN — command */}
      {terminal.command && (
        <div className="flex gap-2 border-b px-2 py-1.5">
          <span className="shrink-0 select-none text-muted-foreground">IN</span>
          <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all text-foreground">
            {terminal.command}
          </pre>
        </div>
      )}
      {/* OUT — output */}
      {hasOutput && (
        <div className="flex gap-2 px-2 py-1.5">
          <span className="shrink-0 select-none text-muted-foreground">OUT</span>
          <pre className="max-h-40 min-w-0 flex-1 overflow-auto whitespace-pre-wrap break-all text-muted-foreground">
            {terminal.output!.trim()}
          </pre>
        </div>
      )}
      {/* Fallback if no command/output yet */}
      {!terminal.command && !hasOutput && (
        <div className="px-2 py-1.5 text-muted-foreground">
          Terminal: {terminal.terminalId}
        </div>
      )}
    </div>
  );
}

function DiffBlock({
  diff,
}: {
  diff: { path: string; oldText: string | null; newText: string };
}) {
  const openDiff = useEditorStore((s) => s.openDiff);
  const isNewFile = diff.oldText == null;
  const fileName = diff.path.split("/").pop() ?? diff.path;

  // Generate unified diff lines
  const patch = createTwoFilesPatch(
    diff.path,
    diff.path,
    diff.oldText ?? "",
    diff.newText,
    "",
    "",
    { context: 3 },
  );

  // Parse patch into displayable lines (skip header lines)
  const lines = patch.split("\n");
  const diffLines = lines.filter(
    (line) =>
      !line.startsWith("===") &&
      !line.startsWith("---") &&
      !line.startsWith("+++") &&
      !line.startsWith("Index:"),
  );

  return (
    <div className="overflow-hidden rounded border bg-background">
      {/* File path header */}
      <button
        onClick={() => openDiff(diff.path, diff.oldText, diff.newText)}
        className="flex w-full items-center gap-1 border-b px-2 py-1 text-left hover:bg-accent/30"
      >
        {isNewFile ? (
          <IconFilePlus className="size-3 text-green-500" />
        ) : (
          <IconPencil className="size-3 text-yellow-500" />
        )}
        <span className="text-[10px] text-blue-400 hover:underline">
          {fileName}
        </span>
        {isNewFile && (
          <span className="text-[9px] text-green-500">(new)</span>
        )}
      </button>

      {/* Diff lines */}
      <div className="max-h-48 overflow-auto font-mono text-[10px] leading-[16px]">
        {diffLines.map((line, i) => {
          let lineClass = "px-2 text-muted-foreground";
          if (line.startsWith("@@")) {
            lineClass = "px-2 bg-blue-500/10 text-blue-400";
          } else if (line.startsWith("+")) {
            lineClass = "px-2 bg-green-500/10 text-green-400";
          } else if (line.startsWith("-")) {
            lineClass = "px-2 bg-red-500/10 text-red-400";
          }

          return (
            <div key={i} className={lineClass}>
              {line || " "}
            </div>
          );
        })}
      </div>
    </div>
  );
}
