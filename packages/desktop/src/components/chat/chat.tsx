import { cn } from "@ral/ui";
import { useCallback } from "react";
import { IconArrowDown } from "@tabler/icons-react";
import { useACPStore } from "../../stores/acp-store";
import { useWorkspaceStore } from "../../stores";
import { useScrollToBottom } from "../../hooks/use-scroll-to-bottom";
import { ChatHeader } from "./header";
import { ChatInput } from "./input";
import { MessageList } from "./message-list";

interface AiChatProps {
  className?: string;
}

export function AiChat({ className }: AiChatProps) {
  const {
    messages,
    isPrompting,
    isAuthenticating,
    isViewingHistory,
    sessions,
    sessionId,
    configOptions,
    sendPrompt,
    cancelPrompt,
    setConfigOption,
    loadSessions,
    viewSession,
    newChat,
  } = useACPStore();

  const projectPath = useWorkspaceStore((s) => s.projectPath);
  const { containerRef, endRef, isAtBottom, scrollToBottom } = useScrollToBottom();

  const handleViewSession = useCallback(
    (sid: string) => {
      if (projectPath) viewSession(projectPath, sid);
    },
    [projectPath, viewSession],
  );

  const handleLoadSessions = useCallback(() => {
    if (projectPath) loadSessions(projectPath);
  }, [projectPath, loadSessions]);

  const firstUserMsg = messages.find((m) => m.role === "user");
  const firstUserText = firstUserMsg?.parts.find((p) => p.type === "text");
  const currentLabel = firstUserText && "text" in firstUserText
    ? firstUserText.text.slice(0, 40)
    : "New Chat";

  return (
    <div className={cn("flex h-full flex-col bg-sidebar", className)}>
      <ChatHeader
        currentLabel={currentLabel}
        sessionId={sessionId}
        sessions={sessions}
        onNewChat={newChat}
        onViewSession={handleViewSession}
        onLoadSessions={handleLoadSessions}
      />

      <div className="relative flex-1 overflow-hidden">
        <div
          ref={containerRef}
          className="absolute inset-0 overflow-y-auto px-3 py-2"
        >
          <MessageList
            messages={messages}
            isPrompting={isPrompting}
            isAuthenticating={isAuthenticating}
            endRef={endRef}
          />
        </div>

        <button
          aria-label="Scroll to bottom"
          className={cn(
            "absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full border bg-background p-1.5 shadow-md transition-all hover:bg-accent",
            isAtBottom
              ? "pointer-events-none scale-0 opacity-0"
              : "pointer-events-auto scale-100 opacity-100",
          )}
          onClick={() => scrollToBottom("smooth")}
          type="button"
        >
          <IconArrowDown className="size-3.5" />
        </button>
      </div>

      {!isViewingHistory && (
        <ChatInput
          isPrompting={isPrompting}
          configOptions={configOptions}
          onSend={sendPrompt}
          onCancel={cancelPrompt}
          onSetConfigOption={setConfigOption}
        />
      )}
    </div>
  );
}
