// ── Message Parts ──

export interface TextPart {
  type: "text";
  text: string;
}

export interface ReasoningPart {
  type: "reasoning";
  text: string;
}

export interface ToolCallPart {
  type: "tool-call";
  toolCallId: string;
  title: string;
  kind: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  content: ACPToolCallContent[];
  locations: ACPToolCallLocation[];
  mcpToolName?: string;
  uiResourceUri?: string;
  rawInput?: Record<string, unknown>;
  rawOutput?: unknown;
}

export interface PlanPart {
  type: "plan";
  entries: PlanEntry[];
}

export type ChatPart = TextPart | ReasoningPart | ToolCallPart | PlanPart;

// ── Chat Message ──

export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  parts: ChatPart[];
  timestamp: number;
}

// ── Shared Sub-types ──

export interface ACPDiff {
  path: string;
  oldText: string | null;
  newText: string;
}

export interface ACPToolCallLocation {
  path: string;
  line?: number;
}

export type ACPToolCallContent =
  | { type: "content"; content: unknown }
  | { type: "diff"; path: string; oldText: string | null; newText: string }
  | { type: "terminal"; terminalId: string; command?: string; output?: string };

export interface PlanEntry {
  content: string;
  priority: "high" | "medium" | "low";
  status: "pending" | "in_progress" | "completed";
}

// ── Config & Commands ──

export interface ConfigSelectOption {
  value: string;
  name: string;
  description?: string;
}

export interface ConfigSelectGroup {
  group: string;
  name: string;
  options: ConfigSelectOption[];
}

export interface ConfigOption {
  id: string;
  name: string;
  description?: string;
  category?: "mode" | "model" | "thought_level" | string;
  type: "select";
  currentValue: string;
  options: ConfigSelectOption[] | ConfigSelectGroup[];
}

export interface AvailableCommand {
  name: string;
  description: string;
  input?: {
    hint: string;
  };
}

// ── Permission ──

export interface ACPPermissionOption {
  optionId: string;
  name: string;
  kind: string;
}

export interface ACPPermissionRequest {
  toolCall: {
    toolCallId: string;
    title: string;
    kind: string;
  };
  options: ACPPermissionOption[];
}
