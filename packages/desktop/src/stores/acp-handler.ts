import {
  appendToSession,
  type SessionRecord,
} from "../services/chat-history";
import type {
  ChatMessage,
  ToolCallPart,
  PlanEntry,
  ConfigOption,
  AvailableCommand,
} from "./acp-types";
import { useMcpClientStore } from "./mcp-client-store";

export interface ACPStateLike {
  sessionId: string | null;
  cwd: string | null;
  messages: ChatMessage[];
  isPrompting: boolean;
}

function generateUUID(): string {
  return crypto.randomUUID();
}

// Persist a record to disk (fire-and-forget)
export function persist(record: SessionRecord, cwd: string | null) {
  if (!cwd || !record.sessionId) return;
  appendToSession(cwd, record.sessionId, record).catch((e) =>
    console.error("[acp] persist failed:", e),
  );
}

// Track whether we need to persist the current agent message
let pendingAgentPersist: ReturnType<typeof setTimeout> | null = null;

// ── Helpers ──

/** Get last agent message or create one and push it */
function ensureAgentMessage(messages: ChatMessage[]): ChatMessage {
  const last = messages[messages.length - 1];
  if (last && last.role === "agent") return last;
  const msg: ChatMessage = {
    id: generateUUID(),
    role: "agent",
    parts: [],
    timestamp: Date.now(),
  };
  messages.push(msg);
  return msg;
}

/** Append text to the last text/reasoning part, or push a new one */
function appendStreamingText(
  messages: ChatMessage[],
  text: string,
  partType: "text" | "reasoning",
): ChatMessage[] {
  const updated = [...messages];
  const lastMsg = updated[updated.length - 1];

  if (lastMsg && lastMsg.role === "agent") {
    const updatedMsg = { ...lastMsg, parts: [...lastMsg.parts] };
    const lastPart = updatedMsg.parts[updatedMsg.parts.length - 1];

    if (lastPart && lastPart.type === partType) {
      updatedMsg.parts[updatedMsg.parts.length - 1] = {
        ...lastPart,
        text: lastPart.text + text,
      };
    } else {
      updatedMsg.parts.push({ type: partType, text });
    }
    updated[updated.length - 1] = updatedMsg;
  } else {
    updated.push({
      id: generateUUID(),
      role: "agent",
      parts: [{ type: partType, text }],
      timestamp: Date.now(),
    });
  }

  return updated;
}

/** Persist the last agent message as a single chat_message record */
function persistLastAgentMessage(state: ACPStateLike) {
  const lastMsg = state.messages[state.messages.length - 1];
  if (lastMsg && lastMsg.role === "agent" && state.sessionId) {
    persist(
      {
        type: "chat_message",
        sessionId: state.sessionId,
        timestamp: new Date().toISOString(),
        message: lastMsg,
      },
      state.cwd,
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleSessionUpdate(payload: any, set: any, get: any) {
  const update = payload?.update;
  if (!update) return;

  const updateType: string = update.sessionUpdate;

  // ── Agent text streaming ──
  if (updateType === "agent_message_chunk") {
    const text = update.content?.text;
    if (text == null) return;

    set((state: ACPStateLike) => ({
      messages: appendStreamingText(state.messages, text, "text"),
    }));

    // Debounce agent message persistence
    if (pendingAgentPersist) clearTimeout(pendingAgentPersist);
    pendingAgentPersist = setTimeout(() => {
      const state = get() as ACPStateLike;
      if (!state.isPrompting) {
        persistLastAgentMessage(state);
        pendingAgentPersist = null;
      }
    }, 500);
  }

  // ── Agent thought streaming ──
  if (updateType === "agent_thought_chunk") {
    const text = update.content?.text;
    if (text == null) return;

    set((state: ACPStateLike) => ({
      messages: appendStreamingText(state.messages, text, "reasoning"),
    }));
  }

  // ── New tool call ──
  if (updateType === "tool_call") {
    const toolCallId = update.toolCallId;
    if (!toolCallId) return;

    const mcpToolName: string | undefined = update._meta?.claudeCode?.toolName;
    const toolUi = mcpToolName
      ? useMcpClientStore.getState().getToolUi(mcpToolName)
      : null;

    const toolCallPart: ToolCallPart = {
      type: "tool-call",
      toolCallId,
      title: update.title ?? "Tool Call",
      kind: update.kind ?? "other",
      status: update.status ?? "pending",
      content: update.content ?? [],
      locations: update.locations ?? [],
      ...(mcpToolName && { mcpToolName }),
      ...(toolUi && { uiResourceUri: toolUi.resourceUri }),
      ...(update.rawInput && { rawInput: update.rawInput }),
    };

    set((state: ACPStateLike) => {
      const messages = [...state.messages];
      const agentMsg = ensureAgentMessage(messages);
      const idx = messages.indexOf(agentMsg);
      messages[idx] = { ...agentMsg, parts: [...agentMsg.parts, toolCallPart] };
      return { messages };
    });
  }

  // ── Tool call update ──
  if (updateType === "tool_call_update") {
    const toolCallId = update.toolCallId;
    if (!toolCallId) return;

    set((state: ACPStateLike) => {
      // Search from the end for the tool-call part
      const messages = [...state.messages];
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.role !== "agent") continue;

        const partIdx = msg.parts.findIndex(
          (p) => p.type === "tool-call" && p.toolCallId === toolCallId,
        );
        if (partIdx === -1) continue;

        const parts = [...msg.parts];
        const existing = parts[partIdx] as ToolCallPart;

        // Accumulate content
        let mergedContent = existing.content;
        if (update.content && existing.content.length) {
          mergedContent = [...existing.content, ...update.content];
        } else if (update.content) {
          mergedContent = update.content;
        }

        parts[partIdx] = {
          ...existing,
          title: update.title ?? existing.title,
          kind: update.kind ?? existing.kind,
          status: update.status ?? existing.status,
          content: mergedContent,
          locations: update.locations ?? existing.locations,
          rawInput: update.rawInput ?? existing.rawInput,
          rawOutput: update.rawOutput ?? existing.rawOutput,
        };

        messages[i] = { ...msg, parts };
        return { messages };
      }
      return {};
    });
  }

  // ── Plan updates ──
  if (updateType === "plan") {
    const entries: PlanEntry[] = (update.entries ?? []).map(
      (e: Record<string, unknown>) => ({
        content: String(e.content ?? ""),
        priority: (e.priority as PlanEntry["priority"]) ?? "medium",
        status: (e.status as PlanEntry["status"]) ?? "pending",
      }),
    );

    set((state: ACPStateLike) => {
      const messages = [...state.messages];
      const agentMsg = ensureAgentMessage(messages);
      const idx = messages.indexOf(agentMsg);
      const parts = [...agentMsg.parts];

      const planIdx = parts.findIndex((p) => p.type === "plan");
      const planPart = { type: "plan" as const, entries };

      if (planIdx !== -1) {
        parts[planIdx] = planPart;
      } else {
        parts.push(planPart);
      }

      messages[idx] = { ...agentMsg, parts };
      return { messages };
    });
  }

  // ── Config options update ──
  if (updateType === "config_option_update") {
    const options = update.configOptions ?? update.config_options;
    if (Array.isArray(options)) {
      set({ configOptions: options as ConfigOption[] });
    }
  }

  // ── Available commands update ──
  if (updateType === "available_commands_update") {
    const commands = update.availableCommands;
    if (Array.isArray(commands)) {
      set({ availableCommands: commands as AvailableCommand[] });
    }
  }

  // ── Agent turn end — persist final message ──
  if (updateType === "agent_turn_end" || updateType === "prompt_end") {
    if (pendingAgentPersist) {
      clearTimeout(pendingAgentPersist);
      pendingAgentPersist = null;
    }
    persistLastAgentMessage(get() as ACPStateLike);
  }
}
