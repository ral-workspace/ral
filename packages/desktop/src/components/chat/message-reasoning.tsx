import { memo, useState, useEffect } from "react";
import { SolarLoader } from "@helm/ui";
import { IconChevronRight } from "@tabler/icons-react";
import { cn } from "@helm/ui";

export const MessageReasoning = memo(function MessageReasoning({
  reasoning,
  isStreaming = false,
}: {
  reasoning: string;
  isStreaming?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(isStreaming);

  // Auto-open when streaming starts, keep open after
  useEffect(() => {
    if (isStreaming) setIsOpen(true);
  }, [isStreaming]);

  return (
    <div className="flex gap-2.5">
      <div className="flex h-[15px] w-2.5 shrink-0 items-center justify-center overflow-visible">
        {isStreaming ? (
          <SolarLoader size={14} />
        ) : (
          <span className="size-[7px] rounded-full bg-foreground/40" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <IconChevronRight
            className={cn(
              "size-3 transition-transform",
              isOpen && "rotate-90",
            )}
          />
          <span>Thinking{isStreaming ? "..." : ""}</span>
        </button>
        {isOpen && (
          <div className="mt-1 text-xs leading-4 text-muted-foreground/70 whitespace-pre-wrap">
            {reasoning}
          </div>
        )}
      </div>
    </div>
  );
});
