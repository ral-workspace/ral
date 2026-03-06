import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  loadSession,
  listSessions,
  type SessionSummary,
} from "../services/chat-history";
import { handleSessionUpdate, persist } from "./acp-handler";
import { useWorkspaceStore } from "./workspace-store";

// Re-export all types for consumers
export type {
  ACPMessage,
  ACPDiff,
  ACPToolCallLocation,
  ACPToolCallContent,
  ACPToolCall,
  TimelineEntry,
  PlanEntry,
  ConfigSelectOption,
  ConfigSelectGroup,
  ConfigOption,
  ACPPermissionOption,
  ACPPermissionRequest,
  AvailableCommand,
} from "./acp-types";

import type {
  ACPMessage,
  ACPToolCall,
  TimelineEntry,
  PlanEntry,
  ConfigOption,
  ACPPermissionRequest,
  AvailableCommand,
} from "./acp-types";

interface ACPState {
  connected: boolean;
  sessionReady: boolean;
  sessionId: string | null;
  agentSessionId: string | null;
  cwd: string | null;
  messages: ACPMessage[];
  toolCalls: Record<string, ACPToolCall>;
  timeline: TimelineEntry[];
  pendingPermission: ACPPermissionRequest | null;
  isPrompting: boolean;
  isAuthenticating: boolean;
  agentInfo: Record<string, unknown> | null;
  sessions: SessionSummary[];
  isViewingHistory: boolean;
  plan: PlanEntry[];
  configOptions: ConfigOption[];
  availableCommands: AvailableCommand[];

  // Actions
  startAgent: (cwd: string) => Promise<void>;
  sendPrompt: (text: string) => Promise<void>;
  cancelPrompt: () => Promise<void>;
  respondPermission: (toolCallId: string, optionId: string) => Promise<void>;
  stopAgent: () => Promise<void>;
  setConfigOption: (configId: string, value: string) => Promise<void>;
  loadSessions: (projectPath: string) => Promise<void>;
  viewSession: (projectPath: string, sessionId: string) => Promise<void>;
  newChat: () => void;
  _init: () => void;
}

let unlisteners: UnlistenFn[] = [];
let initialized = false;

function generateUUID(): string {
  return crypto.randomUUID();
}

export const useACPStore = create<ACPState>((set, get) => ({
  connected: false,
  sessionReady: false,
  sessionId: null,
  agentSessionId: null,
  cwd: null,
  messages: [],
  toolCalls: {},
  timeline: [],
  pendingPermission: null,
  isPrompting: false,
  isAuthenticating: false,
  agentInfo: null,
  sessions: [],
  isViewingHistory: false,
  plan: [],
  configOptions: [],
  availableCommands: [],

  startAgent: async (cwd) => {
    try {
      await invoke("acp_start_agent", {
        agentPath: "claude-agent-acp",
        agentArgs: [],
        cwd,
      });
    } catch (e) {
      // If agent is already running (e.g. after HMR reload), just update cwd
      if (String(e).includes("already running")) {
        console.log("[acp] agent already running, reusing session");
        set({ connected: true, sessionReady: true, cwd });
        return;
      }
      console.error("[acp] start agent failed:", e);
      return;
    }

    // Agent started successfully — initialize session
    const sessionId = generateUUID();
    set({
      sessionId,
      cwd,
      messages: [],
      toolCalls: {},
      timeline: [],
      isViewingHistory: false,
    });

    persist({
      type: "session_meta",
      sessionId,
      timestamp: new Date().toISOString(),
      projectPath: cwd,
      agentPath: "claude-agent-acp",
    }, cwd);
  },

  sendPrompt: async (text) => {
    if (get().isPrompting) return;
    const sessionId = get().sessionId;

    const userMsg: ACPMessage = {
      role: "user",
      content: text,
      timestamp: Date.now(),
    };

    set((state) => ({
      isPrompting: true,
      messages: [...state.messages, userMsg],
      timeline: [...state.timeline, { kind: "message" as const, messageIndex: state.messages.length }],
    }));

    // Persist user message
    if (sessionId) {
      persist({
        type: "user",
        sessionId,
        timestamp: new Date().toISOString(),
        uuid: generateUUID(),
        message: { role: "user", content: text },
      }, get().cwd);
    }

    // Wait for session to be ready (prewarm may still be in progress)
    if (!get().sessionReady) {
      await new Promise<void>((resolve) => {
        if (get().sessionReady) { resolve(); return; }
        const unsub = useACPStore.subscribe((state) => {
          if (state.sessionReady) { unsub(); resolve(); }
        });
      });
    }

    try {
      const result = await invoke<string>("acp_send_prompt", { text });
      console.log("[acp] prompt completed:", result);
    } catch (e) {
      console.error("[acp] prompt failed:", e);
      set((state) => ({
        messages: [
          ...state.messages,
          {
            role: "agent",
            content: `Error: ${e}`,
            timestamp: Date.now(),
          },
        ],
        timeline: [...state.timeline, { kind: "message" as const, messageIndex: state.messages.length }],
      }));
    } finally {
      set({ isPrompting: false });
    }
  },

  cancelPrompt: async () => {
    try {
      await invoke("acp_cancel");
    } catch (e) {
      console.error("[acp] cancel failed:", e);
    }
  },

  respondPermission: async (toolCallId, optionId) => {
    set({ pendingPermission: null });
    try {
      await invoke("acp_respond_permission", { toolCallId, optionId });
    } catch (e) {
      console.error("[acp] respond permission failed:", e);
    }
  },

  setConfigOption: async (configId, value) => {
    try {
      const result = await invoke<ConfigOption[]>("acp_set_config_option", { configId, value });
      if (result) {
        set({ configOptions: result });
      }
    } catch (e) {
      console.error("[acp] set config option failed:", e);
    }
  },

  stopAgent: async () => {
    try {
      await invoke("acp_stop_agent");
    } catch (e) {
      console.error("[acp] stop agent failed:", e);
    }
  },

  loadSessions: async (projectPath) => {
    try {
      const sessions = await listSessions(projectPath);
      set({ sessions });
    } catch (e) {
      console.error("[acp] load sessions failed:", e);
    }
  },

  viewSession: async (projectPath, sessionId) => {
    try {
      // Find the agentSessionId from the session list
      const sessions = get().sessions;
      const sessionInfo = sessions.find((s) => s.sessionId === sessionId);
      const agentSessionId = sessionInfo?.agentSessionId;

      if (agentSessionId) {
        // Resume session via ACP load_session
        // Stop existing agent if running
        if (get().connected) {
          await invoke("acp_stop_agent");
          // Wait briefly for cleanup
          await new Promise((r) => setTimeout(r, 100));
        }

        // Reset state — agent will replay history via session/update events
        set({
          sessionId,
          agentSessionId,
          messages: [],
          toolCalls: {},
          timeline: [],
          plan: [],
          isViewingHistory: false,
        });

        // Start agent with load_session
        await invoke("acp_load_session", {
          agentPath: "claude-agent-acp",
          agentArgs: [],
          cwd: projectPath,
          sessionId: agentSessionId,
        });
      } else {
        // Fallback: read-only view for sessions without agentSessionId
        const records = await loadSession(projectPath, sessionId);
        const messages: ACPMessage[] = [];
        const toolCalls: Record<string, ACPToolCall> = {};
        const timeline: TimelineEntry[] = [];

        let plan: PlanEntry[] = [];

        for (const rec of records) {
          if (rec.type === "user" || rec.type === "agent") {
            const msg = rec.message as { role: "user" | "agent"; content: string };
            timeline.push({ kind: "message", messageIndex: messages.length });
            messages.push({
              role: msg.role,
              content: msg.content,
              timestamp: new Date(rec.timestamp).getTime(),
            });
          } else if (rec.type === "tool_call") {
            const tc = rec.toolCall as ACPToolCall;
            if (tc) {
              toolCalls[tc.toolCallId] = tc;
              timeline.push({ kind: "tool_call", toolCallId: tc.toolCallId });
            }
          } else if (rec.type === "plan") {
            plan = (rec.entries as PlanEntry[]) ?? [];
            if (!timeline.some((t) => t.kind === "plan")) {
              timeline.push({ kind: "plan" });
            }
          }
        }

        set({
          sessionId,
          messages,
          toolCalls,
          timeline,
          plan,
          isViewingHistory: true,
          connected: false,
        });
      }
    } catch (e) {
      console.error("[acp] view session failed:", e);
    }
  },

  newChat: () => {
    set({
      sessionId: null,
      agentSessionId: null,
      messages: [],
      toolCalls: {},
      timeline: [],
      isViewingHistory: false,
      plan: [],
    });
  },

  _init: () => {
    if (initialized) return;
    initialized = true;

    // Prewarm: start agent immediately if a project is already open
    // This runs the full startup (spawn → initialize → new_session) in the background
    // so the session is ready by the time the user opens the AI panel.
    // Unused sessions don't create jsonl files, so no garbage accumulates.
    const { projectPath } = useWorkspaceStore.getState();
    if (projectPath) {
      get().startAgent(projectPath);
    } else {
      // If no project yet, start agent as soon as one is opened
      const unsub = useWorkspaceStore.subscribe((state) => {
        if (state.projectPath && !get().connected) {
          get().startAgent(state.projectPath);
          unsub();
        }
      });
    }

    // Listen for ACP events
    listen("acp-connected", (event) => {
      set({
        connected: true,
        agentInfo: event.payload as Record<string, unknown>,
      });
    }).then((fn) => unlisteners.push(fn));

    listen("acp-disconnected", () => {
      // Persist final agent message if streaming was in progress
      const state = get();
      if (state.sessionId) {
        const lastMsg = state.messages[state.messages.length - 1];
        if (lastMsg && lastMsg.role === "agent") {
          persist({
            type: "agent",
            sessionId: state.sessionId,
            timestamp: new Date().toISOString(),
            uuid: generateUUID(),
            message: { role: "agent", content: lastMsg.content },
          }, state.cwd);
        }
      }
      set({
        connected: false,
        sessionReady: false,
        agentInfo: null,
        isPrompting: false,
        pendingPermission: null,
      });
    }).then((fn) => unlisteners.push(fn));

    listen("acp-error", (event) => {
      console.error("[acp] error:", event.payload);
      set((state) => ({
        messages: [
          ...state.messages,
          {
            role: "agent",
            content: `Error: ${event.payload}`,
            timestamp: Date.now(),
          },
        ],
        timeline: [...state.timeline, { kind: "message" as const, messageIndex: state.messages.length }],
      }));
    }).then((fn) => unlisteners.push(fn));

    listen("acp-update", (event) => {
      handleSessionUpdate(event.payload, set, get);
    }).then((fn) => unlisteners.push(fn));

    listen("acp-auth-started", () => {
      set({ isAuthenticating: true });
    }).then((fn) => unlisteners.push(fn));

    listen("acp-auth-completed", () => {
      set({ isAuthenticating: false });
    }).then((fn) => unlisteners.push(fn));

    listen("acp-permission", (event) => {
      const req = event.payload as ACPPermissionRequest;
      set({ pendingPermission: req });
    }).then((fn) => unlisteners.push(fn));

    listen("acp-session-id", (event) => {
      const agentSessionId = event.payload as string;
      set({ agentSessionId, sessionReady: true });
      // Persist agentSessionId to session_meta
      const state = get();
      if (state.sessionId && state.cwd) {
        persist({
          type: "session_meta",
          sessionId: state.sessionId,
          timestamp: new Date().toISOString(),
          agentSessionId,
          projectPath: state.cwd,
          agentPath: "claude-agent-acp",
        }, state.cwd);
      }
    }).then((fn) => unlisteners.push(fn));

    listen("acp-config-options", (event) => {
      const options = event.payload as ConfigOption[];
      set({ configOptions: Array.isArray(options) ? options : [] });
    }).then((fn) => unlisteners.push(fn));
  },
}));
