import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// ── Types ──

export interface ScheduleTrigger {
  schedule_type: "daily" | "weekly" | "monthly" | "interval";
  at?: string;
  day?: string;
  day_of_month?: number;
  every?: number;
  unit?: string;
}

export interface TriggerDef {
  schedule?: ScheduleTrigger;
  manual: boolean;
}

export interface StepDef {
  id: string;
  tool?: string;
  agent?: string;
  prompt?: string;
  params?: Record<string, unknown>;
  approve: boolean;
}

export interface OutputDef {
  output_type: string;
  path?: string;
}

export interface WorkflowDef {
  name: string;
  enabled: boolean;
  trigger: TriggerDef;
  permissions: string[];
  steps: StepDef[];
  output: OutputDef[];
}

export interface WorkflowSummary {
  id: string;
  name: string;
  enabled: boolean;
  file_path: string;
  schedule_description: string | null;
  last_run_at: string | null;
  last_run_status: string | null;
}

export interface StepResult {
  step_id: string;
  status: string;
  result: unknown;
  error: string | null;
  started_at: string;
  finished_at: string;
}

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  steps: StepResult[];
  error: string | null;
}

// ── Store ──

interface WorkflowState {
  workflows: WorkflowSummary[];
  runs: WorkflowRun[];
  runningWorkflows: Set<string>;
  isLoading: boolean;

  _init: (projectPath: string) => Promise<void>;
  fetchWorkflows: (projectPath: string) => Promise<void>;
  fetchRuns: (workflowId?: string) => Promise<void>;
  runWorkflow: (projectPath: string, workflowId: string) => Promise<void>;
  cancelWorkflow: (runId: string) => Promise<void>;
  toggleWorkflow: (
    projectPath: string,
    workflowId: string,
    enabled: boolean,
  ) => Promise<void>;
  startScheduler: (projectPath: string) => Promise<void>;
  stopScheduler: () => Promise<void>;
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflows: [],
  runs: [],
  runningWorkflows: new Set(),
  isLoading: false,

  _init: async (projectPath: string) => {
    await get().fetchWorkflows(projectPath);
    await get().fetchRuns();

    listen<{ workflow_id: string; run_id: string }>(
      "workflow-run-started",
      (event) => {
        set((s) => {
          const next = new Set(s.runningWorkflows);
          next.add(event.payload.workflow_id);
          return { runningWorkflows: next };
        });
      },
    );

    listen<{ run_id: string; workflow_id: string; status: string }>(
      "workflow-run-completed",
      (event) => {
        set((s) => {
          const next = new Set(s.runningWorkflows);
          next.delete(event.payload.workflow_id);
          return { runningWorkflows: next };
        });
        // Refresh runs and workflow list
        get().fetchRuns();
        get().fetchWorkflows(projectPath);
      },
    );

    // Start scheduler
    await get().startScheduler(projectPath);
  },

  fetchWorkflows: async (projectPath: string) => {
    set({ isLoading: true });
    try {
      const workflows = await invoke<WorkflowSummary[]>("workflow_list", {
        projectPath,
      });
      set({ workflows });
    } catch (e) {
      console.error("[workflow] fetchWorkflows error:", e);
    } finally {
      set({ isLoading: false });
    }
  },

  fetchRuns: async (workflowId?: string) => {
    try {
      const runs = await invoke<WorkflowRun[]>("workflow_get_runs", {
        workflowId,
        limit: 50,
      });
      set({ runs });
    } catch (e) {
      console.error("[workflow] fetchRuns error:", e);
    }
  },

  runWorkflow: async (projectPath: string, workflowId: string) => {
    await invoke<string>("workflow_run", { projectPath, workflowId });
  },

  cancelWorkflow: async (runId: string) => {
    await invoke("workflow_cancel", { runId });
  },

  toggleWorkflow: async (
    projectPath: string,
    workflowId: string,
    enabled: boolean,
  ) => {
    await invoke("workflow_toggle", { projectPath, workflowId, enabled });
    set((s) => ({
      workflows: s.workflows.map((w) =>
        w.id === workflowId ? { ...w, enabled } : w,
      ),
    }));
  },

  startScheduler: async (projectPath: string) => {
    try {
      await invoke("workflow_start_scheduler", { projectPath });
    } catch (e) {
      console.error("[workflow] startScheduler error:", e);
    }
  },

  stopScheduler: async () => {
    try {
      await invoke("workflow_stop_scheduler");
    } catch (e) {
      console.error("[workflow] stopScheduler error:", e);
    }
  },
}));
