import {
  appendToSession,
  type SessionRecord,
} from "../services/chat-history";
import type {
  ACPMessage,
  ACPToolCall,
  ACPToolCallContent,
  PlanEntry,
  ConfigOption,
  AvailableCommand,
} from "./acp-types";

// Re-export ACPState type for handler usage
// (defined in acp-store.ts to avoid circular deps)
export interface ACPStateLike {
  sessionId: string | null;
  cwd: string | null;
  messages: ACPMessage[];
  toolCalls: Record<string, ACPToolCall>;
  timeline: { kind: string; [key: string]: unknown }[];
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleSessionUpdate(payload: any, set: any, get: any) {
  const update = payload?.update;
  if (!update) return;

  const updateType: string = update.sessionUpdate;

  // Handle agent text streaming
  if (updateType === "agent_message_chunk") {
    const text = update.content?.text;
    if (text == null) return;

    set((state: ACPStateLike) => {
      const messages = [...state.messages];
      const lastMsg = messages[messages.length - 1];

      if (lastMsg && lastMsg.role === "agent") {
        // Check if the last timeline entry is for this message (append case)
        const lastTimeline = state.timeline[state.timeline.length - 1];
        const isAppend = lastTimeline?.kind === "message" &&
          (lastTimeline as { messageIndex?: number }).messageIndex === messages.length - 1;

        messages[messages.length - 1] = {
          ...lastMsg,
          content: lastMsg.content + text,
        };

        if (isAppend) {
          return { messages };
        }
        // Last timeline entry was a tool call — this is a new message segment
        const newMsg: ACPMessage = { role: "agent", content: text, timestamp: Date.now() };
        messages[messages.length - 1] = lastMsg; // restore
        messages.push(newMsg);
        return {
          messages,
          timeline: [...state.timeline, { kind: "message" as const, messageIndex: messages.length - 1 }],
        };
      } else {
        messages.push({
          role: "agent",
          content: text,
          timestamp: Date.now(),
        });
        return {
          messages,
          timeline: [...state.timeline, { kind: "message" as const, messageIndex: messages.length - 1 }],
        };
      }
    });

    // Debounce agent message persistence (persist when streaming pauses)
    if (pendingAgentPersist) clearTimeout(pendingAgentPersist);
    pendingAgentPersist = setTimeout(() => {
      const state = get() as ACPStateLike;
      const lastMsg = state.messages[state.messages.length - 1];
      if (lastMsg && lastMsg.role === "agent" && state.sessionId && !state.isPrompting) {
        persist({
          type: "agent",
          sessionId: state.sessionId,
          timestamp: new Date().toISOString(),
          uuid: generateUUID(),
          message: { role: "agent", content: lastMsg.content },
        }, state.cwd);
        pendingAgentPersist = null;
      }
    }, 500);
  }

  // Handle new tool call
  if (updateType === "tool_call") {
    const toolCallId = update.toolCallId;
    if (!toolCallId) return;
    const tc: ACPToolCall = {
      toolCallId,
      title: update.title ?? "Tool Call",
      kind: update.kind ?? "other",
      status: update.status ?? "pending",
      content: update.content ?? [],
      locations: update.locations ?? [],
    };

    set((state: ACPStateLike) => {
      const toolCalls = { ...state.toolCalls };
      toolCalls[toolCallId] = tc;
      return {
        toolCalls,
        timeline: [...state.timeline, { kind: "tool_call" as const, toolCallId }],
      };
    });

    const state = get() as ACPStateLike;
    if (state.sessionId) {
      persist({
        type: "tool_call",
        sessionId: state.sessionId,
        timestamp: new Date().toISOString(),
        toolCall: tc,
      }, state.cwd);
    }
  }

  // Handle tool call update
  if (updateType === "tool_call_update") {
    const toolCallId = update.toolCallId;
    if (!toolCallId) return;
    set((state: ACPStateLike) => {
      const toolCalls = { ...state.toolCalls };
      const existing = toolCalls[toolCallId];

      // Accumulate content across updates so earlier data isn't lost
      let mergedContent: ACPToolCallContent[];
      if (update.content && existing?.content?.length) {
        mergedContent = [...existing.content, ...update.content];
      } else {
        mergedContent = update.content ?? existing?.content ?? [];
      }

      toolCalls[toolCallId] = {
        toolCallId,
        title: update.title ?? existing?.title ?? "Tool Call",
        kind: update.kind ?? existing?.kind ?? "other",
        status: update.status ?? existing?.status ?? "pending",
        content: mergedContent,
        locations: update.locations ?? existing?.locations ?? [],
      };
      return { toolCalls };
    });

    // Persist completed tool calls (includes final terminal output)
    const newStatus = update.status ?? "pending";
    if (newStatus === "completed" || newStatus === "failed") {
      const state = get() as ACPStateLike;
      const tc = state.toolCalls[toolCallId];
      if (tc && state.sessionId) {
        persist({
          type: "tool_call",
          sessionId: state.sessionId,
          timestamp: new Date().toISOString(),
          toolCall: tc,
        }, state.cwd);
      }
    }
  }

  // Handle plan updates (complete replacement each time)
  if (updateType === "plan") {
    const entries: PlanEntry[] = (update.entries ?? []).map((e: Record<string, unknown>) => ({
      content: String(e.content ?? ""),
      priority: (e.priority as PlanEntry["priority"]) ?? "medium",
      status: (e.status as PlanEntry["status"]) ?? "pending",
    }));

    set((state: ACPStateLike) => {
      // Add plan to timeline only once (replace if exists)
      const hasPlanEntry = state.timeline.some((t) => t.kind === "plan");
      return {
        plan: entries,
        timeline: hasPlanEntry ? state.timeline : [...state.timeline, { kind: "plan" as const }],
      };
    });

    // Persist plan
    const state = get() as ACPStateLike;
    if (state.sessionId) {
      persist({
        type: "plan",
        sessionId: state.sessionId,
        timestamp: new Date().toISOString(),
        entries,
      }, state.cwd);
    }
  }

  // Handle config options update from agent
  if (updateType === "config_option_update") {
    const options = update.configOptions ?? update.config_options;
    if (Array.isArray(options)) {
      set({ configOptions: options as ConfigOption[] });
    }
  }

  // Handle available commands update from agent
  if (updateType === "available_commands_update") {
    const commands = update.availableCommands;
    if (Array.isArray(commands)) {
      set({ availableCommands: commands as AvailableCommand[] });
    }
  }

  // When agent turn ends, persist the final agent message
  if (updateType === "agent_turn_end" || updateType === "prompt_end") {
    if (pendingAgentPersist) {
      clearTimeout(pendingAgentPersist);
      pendingAgentPersist = null;
    }
    const state = get() as ACPStateLike;
    const lastMsg = state.messages[state.messages.length - 1];
    if (lastMsg && lastMsg.role === "agent" && state.sessionId) {
      persist({
        type: "agent",
        sessionId: state.sessionId,
        timestamp: new Date().toISOString(),
        uuid: generateUUID(),
        message: { role: "agent", content: lastMsg.content },
      }, state.cwd);
    }
  }
}
