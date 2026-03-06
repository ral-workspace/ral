import { useRef, useState, useMemo, useEffect, useCallback } from "react";
import { IconPlayerStop, IconCornerRightUp } from "@tabler/icons-react";
import { cn, Button } from "@helm/ui";
import type { ConfigOption, AvailableCommand } from "../../stores/acp-types";
import { useACPStore } from "../../stores/acp-store";
import { ConfigOptionSelector } from "./config-option-selector";

interface ChatInputProps {
  isPrompting: boolean;
  configOptions: ConfigOption[];
  onSend: (text: string) => void;
  onCancel: () => void;
  onSetConfigOption: (configId: string, value: string) => void;
}

export function ChatInput({
  isPrompting,
  configOptions,
  onSend,
  onCancel,
  onSetConfigOption,
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sessionReady = useACPStore((s) => s.sessionReady);
  const availableCommands = useACPStore((s) => s.availableCommands);
  const pendingPermission = useACPStore((s) => s.pendingPermission);
  const respondPermission = useACPStore((s) => s.respondPermission);
  const cancelPrompt = useACPStore((s) => s.cancelPrompt);

  // Filter commands based on input
  const matchedCommands = useMemo(() => {
    if (!input.startsWith("/")) return [];
    const query = input.slice(1).toLowerCase();
    return availableCommands.filter((cmd) =>
      cmd.name.toLowerCase().startsWith(query),
    );
  }, [input, availableCommands]);

  const showCommandMenu = matchedCommands.length > 0 && !input.includes(" ");

  const handleSend = () => {
    const text = input.trim();
    if (!text || isPrompting) return;
    setInput("");
    onSend(text);
  };

  const selectCommand = (cmd: AvailableCommand) => {
    const newInput = `/${cmd.name} `;
    setInput(newInput);
    setSelectedIndex(0);
    textareaRef.current?.focus();
  };

  // Permission: select option by index or Escape to cancel
  const handlePermissionSelect = useCallback(
    (optionId: string) => {
      if (!pendingPermission) return;
      respondPermission(pendingPermission.toolCall.toolCallId, optionId);
    },
    [pendingPermission, respondPermission],
  );

  const handlePermissionCancel = useCallback(() => {
    cancelPrompt();
  }, [cancelPrompt]);

  // Keyboard handler for permission mode
  useEffect(() => {
    if (!pendingPermission) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handlePermissionCancel();
        return;
      }
      // Number keys 1-9 to select option
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= pendingPermission.options.length) {
        e.preventDefault();
        handlePermissionSelect(pendingPermission.options[num - 1].optionId);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [pendingPermission, handlePermissionSelect, handlePermissionCancel]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Command menu navigation
    if (showCommandMenu) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, matchedCommands.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        selectCommand(matchedCommands[selectedIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setInput("");
        return;
      }
    }

    if (
      e.key === "Enter" &&
      !e.shiftKey &&
      !e.nativeEvent.isComposing &&
      e.keyCode !== 229
    ) {
      e.preventDefault();
      handleSend();
    }
  };

  // Permission UI
  if (pendingPermission) {
    return (
      <div className="px-2 pt-0 pb-2">
        <div className="rounded-lg border bg-background p-3">
          <p className="text-xs font-medium text-foreground">
            {pendingPermission.toolCall.title}
          </p>
          <div className="mt-2 space-y-1">
            {pendingPermission.options.map((option, i) => (
              <button
                key={option.optionId}
                onClick={() => handlePermissionSelect(option.optionId)}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs transition-colors",
                  "border hover:bg-accent/50",
                )}
              >
                <span className="shrink-0 text-muted-foreground">{i + 1}</span>
                <span className="text-foreground">{option.name}</span>
              </button>
            ))}
            <input
              type="text"
              placeholder="Tell the agent what to do instead"
              className="w-full rounded border bg-transparent px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.nativeEvent.isComposing &&
                  e.keyCode !== 229
                ) {
                  e.preventDefault();
                  const text = (e.target as HTMLInputElement).value.trim();
                  if (text) {
                    // Reject permission, then send message as next prompt
                    const rejectOption = pendingPermission.options.find(
                      (o) => o.kind === "reject_once" || o.kind === "reject_always",
                    );
                    if (rejectOption) {
                      handlePermissionSelect(rejectOption.optionId);
                    } else {
                      handlePermissionCancel();
                    }
                    onSend(text);
                  }
                }
                // Prevent number keys from triggering option selection
                e.stopPropagation();
              }}
            />
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Esc to cancel
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative px-2 pt-0 pb-2">
      {/* Slash command autocomplete menu */}
      {showCommandMenu && (
        <div className="absolute bottom-full left-2 right-2 mb-1 max-h-48 overflow-y-auto rounded-md border bg-popover shadow-md">
          {matchedCommands.map((cmd, i) => (
            <button
              key={cmd.name}
              onMouseDown={(e) => {
                e.preventDefault();
                selectCommand(cmd);
              }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors",
                i === selectedIndex ? "bg-accent/50" : "hover:bg-accent/30",
              )}
            >
              <span className="text-xs font-medium text-foreground">
                /{cmd.name}
              </span>
              <span className="truncate text-[10px] text-muted-foreground">
                {cmd.description}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="rounded-lg border bg-background focus-within:ring-1 focus-within:ring-ring">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setSelectedIndex(0);
            const el = textareaRef.current;
            if (el) {
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={sessionReady ? "Send a message..." : "Connecting..."}
          disabled={isPrompting}
          rows={1}
          className="w-full resize-none bg-transparent px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
        />
        {/* Toolbar */}
        <div className="flex items-center border-t px-2 py-1">
          <div className="flex flex-1 items-center gap-2 text-[10px] text-muted-foreground">
            {configOptions
              .filter((opt) => opt.category === "mode")
              .map((opt) => (
                <ConfigOptionSelector
                  key={opt.id}
                  option={opt}
                  onSelect={(value) => onSetConfigOption(opt.id, value)}
                />
              ))}
          </div>
          <div className="flex items-center gap-1">
            {isPrompting ? (
              <Button
                variant="destructive"
                size="icon-xs"
                onClick={onCancel}
                title="Cancel"
              >
                <IconPlayerStop />
              </Button>
            ) : (
              <Button
                size="icon-xs"
                onClick={handleSend}
                disabled={!input.trim()}
                title="Send"
              >
                <IconCornerRightUp />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
