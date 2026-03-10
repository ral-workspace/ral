import { memo } from "react";
import { SolarLoader } from "@ral/ui";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { mermaid } from "@streamdown/mermaid";

export const MessageBubble = memo(function MessageBubble({
  role,
  text,
  isStreaming = false,
}: {
  role: "user" | "agent";
  text: string;
  isStreaming?: boolean;
}) {
  if (role === "user") {
    return (
      <div>
        <div className="inline-block rounded-lg border bg-background px-3 py-2 text-xs text-foreground">
          {text}
        </div>
      </div>
    );
  }

  // Agent message — bullet point style
  return (
    <div className="flex gap-2.5">
      <div className="flex h-[15px] w-2.5 shrink-0 items-center justify-center overflow-visible">
        {isStreaming ? (
          <SolarLoader size={14} />
        ) : (
          <span className="size-[7px] rounded-full bg-foreground/40" />
        )}
      </div>
      <div className="min-w-0 flex-1 text-xs leading-4 text-foreground">
        <Streamdown
          animated={{ animation: "blurIn" }}
          isAnimating={isStreaming}
          plugins={{ code, mermaid }}
          controls={{ table: false, code: true }}
        >
          {text}
        </Streamdown>
      </div>
    </div>
  );
});
