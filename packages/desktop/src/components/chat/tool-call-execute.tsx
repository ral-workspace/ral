import { cn, SolarLoader } from "@helm/ui";
import type { ACPToolCallContent } from "../../stores/acp-types";

export function ExecuteBlock({
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

export function TerminalBlock({
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
