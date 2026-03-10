import { memo } from "react";
import type { RefObject } from "react";
import { Spinner } from "@ral/ui";
import type { ChatMessage, ChatPart } from "../../stores/acp-types";
import { MessageBubble } from "./message-bubble";
import { MessageReasoning } from "./message-reasoning";
import { PlanCard } from "./plan-card";
import { ToolCallCard } from "./tool-call-card";

interface MessageListProps {
  messages: ChatMessage[];
  isPrompting: boolean;
  isAuthenticating: boolean;
  endRef: RefObject<HTMLDivElement | null>;
}

export function MessageList({
  messages,
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

  // For each uiResourceUri, only the latest toolCall should render McpAppFrame
  const latestMcpAppIds = new Set<string>();
  {
    const lastByUri: Record<string, string> = {};
    for (const msg of messages) {
      if (msg.role !== "agent") continue;
      for (const part of msg.parts) {
        if (part.type === "tool-call" && part.uiResourceUri) {
          lastByUri[part.uiResourceUri] = part.toolCallId;
        }
      }
    }
    for (const id of Object.values(lastByUri)) {
      latestMcpAppIds.add(id);
    }
  }

  return (
    <div className="space-y-5">
      {messages.map((msg, index) => {
        const isLastMsg = index === messages.length - 1;

        if (msg.role === "user") {
          return <UserMessage key={msg.id} msg={msg} />;
        }

        return (
          <AgentMessage
            key={msg.id}
            msg={msg}
            isStreaming={isPrompting && isLastMsg}
            latestMcpAppIds={latestMcpAppIds}
          />
        );
      })}
      <div ref={endRef} className="min-h-[24px] shrink-0" />
    </div>
  );
}

// ── User Message ──

const UserMessage = memo(function UserMessage({ msg }: { msg: ChatMessage }) {
  const textPart = msg.parts.find((p) => p.type === "text");
  const text = textPart && "text" in textPart ? textPart.text : "";
  return <MessageBubble role="user" text={text} />;
});

// ── Agent Message ──

const AgentMessage = memo(function AgentMessage({
  msg,
  isStreaming,
  latestMcpAppIds,
}: {
  msg: ChatMessage;
  isStreaming: boolean;
  latestMcpAppIds: Set<string>;
}) {
  // Find the last text part index for streaming indicator
  let lastTextIdx = -1;
  for (let i = msg.parts.length - 1; i >= 0; i--) {
    if (msg.parts[i].type === "text") {
      lastTextIdx = i;
      break;
    }
  }

  return (
    <div className="space-y-5">
      {msg.parts.map((part, partIdx) => (
        <PartRenderer
          key={partKey(msg.id, part, partIdx)}
          part={part}
          isStreamingText={isStreaming && partIdx === lastTextIdx}
          isStreamingReasoning={
            isStreaming && partIdx === msg.parts.length - 1
          }
          showMcpApp={
            part.type === "tool-call" && latestMcpAppIds.has(part.toolCallId)
          }
        />
      ))}
    </div>
  );
});

// ── Part Renderer ──

function PartRenderer({
  part,
  isStreamingText,
  isStreamingReasoning,
  showMcpApp,
}: {
  part: ChatPart;
  isStreamingText: boolean;
  isStreamingReasoning: boolean;
  showMcpApp: boolean;
}) {
  switch (part.type) {
    case "text":
      return (
        <MessageBubble
          role="agent"
          text={part.text}
          isStreaming={isStreamingText}
        />
      );

    case "reasoning":
      return (
        <MessageReasoning
          reasoning={part.text}
          isStreaming={isStreamingReasoning}
        />
      );

    case "tool-call":
      return <ToolCallCard toolCall={part} showMcpApp={showMcpApp} />;

    case "plan":
      return <PlanCard entries={part.entries} />;

    default:
      return null;
  }
}

// ── Helpers ──

function partKey(msgId: string, part: ChatPart, index: number): string {
  if (part.type === "tool-call") return part.toolCallId;
  return `${msgId}-${part.type}-${index}`;
}
