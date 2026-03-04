import type { RefObject } from "react";
import { Spinner } from "@helm/ui";
import type {
  ACPMessage,
  ACPToolCall,
  TimelineEntry,
  PlanEntry,
} from "../../stores/acp-types";
import { MessageBubble } from "./message-bubble";
import { PlanCard } from "./plan-card";
import { ToolCallCard } from "./tool-call-card";

interface MessageListProps {
  messages: ACPMessage[];
  toolCalls: Record<string, ACPToolCall>;
  timeline: TimelineEntry[];
  plan: PlanEntry[];
  isPrompting: boolean;
  isAuthenticating: boolean;
  endRef: RefObject<HTMLDivElement | null>;
}

export function MessageList({
  messages,
  toolCalls,
  timeline,
  plan,
  isPrompting,
  isAuthenticating,
  endRef,
}: MessageListProps) {
  if (isAuthenticating) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <Spinner className="size-5 text-spinner" />
        <p className="text-xs text-muted-foreground">
          Authenticating... Please complete sign-in in your browser.
        </p>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-xs text-muted-foreground">
          Start a conversation with Claude
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {timeline.map((entry, idx) => {
        if (entry.kind === "message") {
          const msg = messages[entry.messageIndex];
          if (!msg) return null;
          return (
            <MessageBubble
              key={`msg-${entry.messageIndex}`}
              message={msg}
              isStreaming={
                isPrompting &&
                msg.role === "agent" &&
                entry.messageIndex === messages.length - 1
              }
            />
          );
        }
        if (entry.kind === "plan") {
          return plan.length > 0 ? (
            <PlanCard key={`plan-${idx}`} entries={plan} />
          ) : null;
        }
        const tc = toolCalls[entry.toolCallId];
        if (!tc) return null;
        return <ToolCallCard key={tc.toolCallId} toolCall={tc} />;
      })}
      <div ref={endRef} className="min-h-[24px] shrink-0" />
    </div>
  );
}
