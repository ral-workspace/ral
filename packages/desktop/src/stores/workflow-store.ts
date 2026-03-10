import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useWorkspaceStore } from "./workspace-store";

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
  retry?: number;
}

export interface PendingApproval {
  runId: string;
  workflowId: string;
  workflowName: string;
  stepId: string;
  stepTool?: string;
  stepAgent?: string;
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
  pendingApprovals: PendingApproval[];
  isLoading: boolean;

  _init: (projectPath: string) => Promise<void>;
  fetchWorkflows: (projectPath: string) => Promise<void>;
  fetchRuns: (workflowId?: string) => Promise<void>;
  runWorkflow: (projectPath: string, workflowId: string) => Promise<void>;
  cancelWorkflow: (runId: string) => Promise<void>;
  respondApproval: (runId: string, approved: boolean) => Promise<void>;
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
  pendingApprovals: [],
  isLoading: false,

  _init: async (projectPath: string) => {
    await get().fetchWorkflows(projectPath);
    await get().fetchRuns();

    // Sync runningWorkflows from actual DB state
    const runs = get().runs;
    const running = new Set<string>();
    for (const r of runs) {
      if (r.status === "running") running.add(r.workflow_id);
    }
    set({ runningWorkflows: running, pendingApprovals: [] });

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

  respondApproval: async (runId: string, approved: boolean) => {
    await invoke("workflow_respond_approval", { runId, approved });
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

// ── Event listeners (registered once at module load) ──

function setupListeners() {
  const { set, get } = { set: useWorkflowStore.setState, get: useWorkflowStore.getState };

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
        const approvals = s.pendingApprovals.filter(
          (a) => a.runId !== event.payload.run_id,
        );
        return { runningWorkflows: next, pendingApprovals: approvals };
      });
      get().fetchRuns();
      const projectPath = useWorkspaceStore.getState().projectPath;
      if (projectPath) get().fetchWorkflows(projectPath);
    },
  );

  listen<{
    run_id: string;
    workflow_id: string;
    workflow_name: string;
    step_id: string;
    step_tool?: string;
    step_agent?: string;
  }>("workflow-approval-pending", (event) => {
    const { run_id, workflow_id, workflow_name, step_id, step_tool, step_agent } =
      event.payload;
    set((s) => {
      const exists = s.pendingApprovals.some(
        (a) => a.runId === run_id && a.stepId === step_id,
      );
      if (exists) return s;
      return {
        pendingApprovals: [
          ...s.pendingApprovals,
          {
            runId: run_id,
            workflowId: workflow_id,
            workflowName: workflow_name,
            stepId: step_id,
            stepTool: step_tool,
            stepAgent: step_agent,
          },
        ],
      };
    });
  });

  listen<{ run_id: string; step_id: string; approved: boolean }>(
    "workflow-approval-resolved",
    (event) => {
      set((s) => ({
        pendingApprovals: s.pendingApprovals.filter(
          (a) => a.runId !== event.payload.run_id || a.stepId !== event.payload.step_id,
        ),
      }));
    },
  );
}

setupListeners();
