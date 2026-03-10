import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useWorkspaceStore } from "./workspace-store";
import { addToSet, removeFromSet } from "./shared/store-helpers";
import type {
  PendingApproval,
  WorkflowSummary,
  WorkflowRun,
} from "../types/workflow";
import type {
  WorkflowRunStartedEvent,
  WorkflowRunCompletedEvent,
  WorkflowApprovalPendingEvent,
  WorkflowApprovalResolvedEvent,
} from "../types/events";

// ── Store ──

interface WorkflowState {
  workflows: WorkflowSummary[];
  runs: WorkflowRun[];
  runningWorkflows: Set<string>;
  pendingApprovals: PendingApproval[];
  isLoading: boolean;

  _init: (projectPath: string) => Promise<void>;
  fetchWorkflows: (projectPath: string) => Promise<void>;
  fetchRuns: (projectPath: string, workflowId?: string) => Promise<void>;
  runWorkflow: (projectPath: string, workflowId: string) => Promise<void>;
  cancelWorkflow: (runId: string) => Promise<void>;
  respondApproval: (runId: string, approved: boolean) => Promise<void>;
  toggleWorkflow: (
    projectPath: string,
    workflowId: string,
    enabled: boolean,
  ) => Promise<void>;
  startScheduler: (projectPath: string) => Promise<void>;
  stopScheduler: (projectPath: string) => Promise<void>;
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflows: [],
  runs: [],
  runningWorkflows: new Set(),
  pendingApprovals: [],
  isLoading: false,

  _init: async (projectPath: string) => {
    await get().fetchWorkflows(projectPath);
    await get().fetchRuns(projectPath);

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

  fetchRuns: async (projectPath: string, workflowId?: string) => {
    try {
      const runs = await invoke<WorkflowRun[]>("workflow_get_runs", {
        projectPath,
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

  stopScheduler: async (projectPath: string) => {
    try {
      await invoke("workflow_stop_scheduler", { projectPath });
    } catch (e) {
      console.error("[workflow] stopScheduler error:", e);
    }
  },
}));

// ── Event listeners (registered once at module load) ──

function isCurrentProject(eventProjectPath?: string): boolean {
  const current = useWorkspaceStore.getState().projectPath;
  if (!current || !eventProjectPath) return false;
  return current === eventProjectPath;
}

function setupListeners() {
  const { set, get } = { set: useWorkflowStore.setState, get: useWorkflowStore.getState };

  listen<WorkflowRunStartedEvent>(
    "workflow-run-started",
    (event) => {
      if (!isCurrentProject(event.payload.project_path)) return;
      set((s) => ({
        runningWorkflows: addToSet(s.runningWorkflows, event.payload.workflow_id),
      }));
    },
  );

  listen<WorkflowRunCompletedEvent>(
    "workflow-run-completed",
    (event) => {
      if (!isCurrentProject(event.payload.project_path)) return;
      set((s) => ({
        runningWorkflows: removeFromSet(s.runningWorkflows, event.payload.workflow_id),
        pendingApprovals: s.pendingApprovals.filter(
          (a) => a.runId !== event.payload.run_id,
        ),
      }));
      const projectPath = useWorkspaceStore.getState().projectPath;
      if (projectPath) {
        get().fetchRuns(projectPath);
        get().fetchWorkflows(projectPath);
      }
    },
  );

  listen<WorkflowApprovalPendingEvent>("workflow-approval-pending", (event) => {
    if (!isCurrentProject(event.payload.project_path)) return;
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

  listen<WorkflowApprovalResolvedEvent>(
    "workflow-approval-resolved",
    (event) => {
      if (!isCurrentProject(event.payload.project_path)) return;
      set((s) => ({
        pendingApprovals: s.pendingApprovals.filter(
          (a) => a.runId !== event.payload.run_id || a.stepId !== event.payload.step_id,
        ),
      }));
    },
  );
}

setupListeners();
