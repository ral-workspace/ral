import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useWorkspaceStore } from "./workspace-store";
import { toast } from "sonner";
import { addToSet, removeFromSet, normalizeError } from "./shared/store-helpers";
import type {
  PendingApproval,
  WorkflowSummary,
  WorkflowRun,
} from "../types/workflow";
import {
  EVENTS,
  type WorkflowRunStartedEvent,
  type WorkflowRunCompletedEvent,
  type WorkflowApprovalPendingEvent,
  type WorkflowApprovalResolvedEvent,
} from "../types/events";

// ── Store ──

export type WorkflowInFlightAction = "run" | "cancel" | "toggle" | "approve" | "reject";

interface WorkflowState {
  workflows: WorkflowSummary[];
  runs: WorkflowRun[];
  runningWorkflows: Set<string>;
  pendingApprovals: PendingApproval[];
  isLoading: boolean;
  inFlight: Record<string, WorkflowInFlightAction | undefined>;
  lastError: string | null;
  lastAction: string | null;
  /** Track which project path the scheduler is running for (prevents redundant starts) */
  activeSchedulerPath: string | null;

  _init: (projectPath: string) => Promise<void>;
  fetchWorkflows: (projectPath: string) => Promise<void>;
  fetchRuns: (projectPath: string, workflowId?: string) => Promise<void>;
  runWorkflow: (projectPath: string, workflowId: string) => Promise<void>;
  cancelWorkflow: (runId: string, workflowId: string) => Promise<void>;
  respondApproval: (runId: string, approved: boolean) => Promise<void>;
  toggleWorkflow: (
    projectPath: string,
    workflowId: string,
    enabled: boolean,
  ) => Promise<void>;
  startScheduler: (projectPath: string) => Promise<void>;
  stopScheduler: (projectPath: string) => Promise<void>;
  clearError: () => void;
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflows: [],
  runs: [],
  runningWorkflows: new Set(),
  pendingApprovals: [],
  isLoading: false,
  inFlight: {},
  lastError: null,
  lastAction: null,
  activeSchedulerPath: null,

  _init: async (projectPath: string) => {
    await setupListeners();
    await get().fetchWorkflows(projectPath);
    await get().fetchRuns(projectPath);

    // Sync runningWorkflows from actual DB state
    const runs = get().runs;
    const running = new Set<string>();
    for (const r of runs) {
      if (r.status === "running") running.add(r.workflow_id);
    }
    set({ runningWorkflows: running, pendingApprovals: [] });

    // Only start scheduler if not already running for this project
    if (get().activeSchedulerPath !== projectPath) {
      await get().startScheduler(projectPath);
    }
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
    if (get().inFlight[workflowId]) return;
    set((s) => ({ inFlight: { ...s.inFlight, [workflowId]: "run" }, lastError: null }));
    try {
      await invoke<string>("workflow_run", { projectPath, workflowId });
    } catch (e) {
      const msg = normalizeError(e);
      set({ lastError: msg, lastAction: "run" });
      toast.error(`Failed to run workflow: ${msg}`);
    } finally {
      set((s) => { const { [workflowId]: _, ...rest } = s.inFlight; return { inFlight: rest }; });
    }
  },

  cancelWorkflow: async (runId: string, workflowId: string) => {
    if (get().inFlight[workflowId]) return;
    set((s) => ({ inFlight: { ...s.inFlight, [workflowId]: "cancel" }, lastError: null }));
    try {
      await invoke("workflow_cancel", { runId });
    } catch (e) {
      const msg = normalizeError(e);
      set({ lastError: msg, lastAction: "cancel" });
      toast.error(`Failed to cancel workflow: ${msg}`);
    } finally {
      set((s) => { const { [workflowId]: _, ...rest } = s.inFlight; return { inFlight: rest }; });
    }
  },

  respondApproval: async (runId: string, approved: boolean) => {
    const action = approved ? "approve" : "reject";
    if (get().inFlight[runId]) return;
    set((s) => ({ inFlight: { ...s.inFlight, [runId]: action }, lastError: null }));
    try {
      await invoke("workflow_respond_approval", { runId, approved });
    } catch (e) {
      const msg = normalizeError(e);
      set({ lastError: msg, lastAction: action });
      toast.error(`Failed to ${action} approval: ${msg}`);
    } finally {
      set((s) => { const { [runId]: _, ...rest } = s.inFlight; return { inFlight: rest }; });
    }
  },

  toggleWorkflow: async (
    projectPath: string,
    workflowId: string,
    enabled: boolean,
  ) => {
    if (get().inFlight[workflowId]) return;
    set((s) => ({ inFlight: { ...s.inFlight, [workflowId]: "toggle" }, lastError: null }));
    try {
      await invoke("workflow_toggle", { projectPath, workflowId, enabled });
      set((s) => ({
        workflows: s.workflows.map((w) =>
          w.id === workflowId ? { ...w, enabled } : w,
        ),
      }));
    } catch (e) {
      const msg = normalizeError(e);
      set({ lastError: msg, lastAction: "toggle" });
      toast.error(`Failed to toggle workflow: ${msg}`);
    } finally {
      set((s) => { const { [workflowId]: _, ...rest } = s.inFlight; return { inFlight: rest }; });
    }
  },

  clearError: () => set({ lastError: null, lastAction: null }),

  startScheduler: async (projectPath: string) => {
    try {
      await invoke("workflow_start_scheduler", { projectPath });
      set({ activeSchedulerPath: projectPath });
    } catch (e) {
      console.error("[workflow] startScheduler error:", e);
    }
  },

  stopScheduler: async (projectPath: string) => {
    try {
      await invoke("workflow_stop_scheduler", { projectPath });
      set((s) =>
        s.activeSchedulerPath === projectPath
          ? { activeSchedulerPath: null }
          : s
      );
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

type UnlistenFn = () => void;
let activeUnlistens: UnlistenFn[] = [];

async function setupListeners() {
  // Clean up previous listeners (safe for HMR)
  for (const unlisten of activeUnlistens) {
    unlisten();
  }
  activeUnlistens = [];

  const { set, get } = { set: useWorkflowStore.setState, get: useWorkflowStore.getState };

  activeUnlistens.push(
    await listen<WorkflowRunStartedEvent>(
      EVENTS.WORKFLOW_RUN_STARTED,
      (event) => {
        if (!isCurrentProject(event.payload.project_path)) return;
        set((s) => ({
          runningWorkflows: addToSet(s.runningWorkflows, event.payload.workflow_id),
        }));
      },
    ),
  );

  activeUnlistens.push(
    await listen<WorkflowRunCompletedEvent>(
      EVENTS.WORKFLOW_RUN_COMPLETED,
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
    ),
  );

  activeUnlistens.push(
    await listen<WorkflowApprovalPendingEvent>(EVENTS.WORKFLOW_APPROVAL_PENDING, (event) => {
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
    }),
  );

  activeUnlistens.push(
    await listen<WorkflowApprovalResolvedEvent>(
      EVENTS.WORKFLOW_APPROVAL_RESOLVED,
      (event) => {
        if (!isCurrentProject(event.payload.project_path)) return;
        set((s) => ({
          pendingApprovals: s.pendingApprovals.filter(
            (a) => a.runId !== event.payload.run_id || a.stepId !== event.payload.step_id,
          ),
        }));
      },
    ),
  );
}

// Listeners are set up lazily via _init() to avoid module-level side effects.
// HMR: clean up listeners on module reload.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const unlisten of activeUnlistens) unlisten();
    activeUnlistens = [];
  });
}
