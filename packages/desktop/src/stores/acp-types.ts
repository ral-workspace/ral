export interface ACPMessage {
  role: "user" | "agent";
  content: string;
  timestamp: number;
}

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

export interface ACPToolCall {
  toolCallId: string;
  title: string;
  kind: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  content: ACPToolCallContent[];
  locations: ACPToolCallLocation[];
}

export type TimelineEntry =
  | { kind: "message"; messageIndex: number }
  | { kind: "tool_call"; toolCallId: string }
  | { kind: "plan" };

export interface PlanEntry {
  content: string;
  priority: "high" | "medium" | "low";
  status: "pending" | "in_progress" | "completed";
}

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
