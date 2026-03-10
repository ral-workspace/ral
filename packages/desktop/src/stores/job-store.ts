import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { addToSet, removeFromSet, prependCapped, normalizeError } from "./shared/store-helpers";
import type { JobDef, JobRun, NewJob } from "../types/job";
import {
  EVENTS,
  type SchedulerJobStartedEvent,
  type SchedulerJobCompletedEvent,
} from "../types/events";

// ── Store ──

export type JobInFlightAction = "run" | "cancel" | "toggle";

interface JobState {
  jobs: JobDef[];
  history: JobRun[];
  runningJobIds: Set<string>;
  isLoading: boolean;
  inFlight: Record<string, JobInFlightAction | undefined>;
  lastError: string | null;
  lastAction: string | null;

  _init: () => Promise<void>;
  fetchJobs: () => Promise<void>;
  fetchHistory: (jobId?: string) => Promise<void>;
  createJob: (job: NewJob) => Promise<JobDef>;
  updateJob: (id: string, job: NewJob) => Promise<JobDef>;
  deleteJob: (id: string) => Promise<void>;
  toggleJob: (id: string, enabled: boolean) => Promise<void>;
  runJobNow: (id: string) => Promise<void>;
  cancelJob: (id: string) => Promise<void>;
  clearError: () => void;
}

export const useJobStore = create<JobState>((set, get) => ({
  jobs: [],
  history: [],
  runningJobIds: new Set(),
  isLoading: false,
  inFlight: {},
  lastError: null,
  lastAction: null,

  _init: async () => {
    await get().fetchJobs();
    await get().fetchHistory();
  },

  fetchJobs: async () => {
    set({ isLoading: true });
    try {
      const jobs = await invoke<JobDef[]>("scheduler_list_jobs");
      set({ jobs });
    } catch (e) {
      console.error("[job] fetchJobs error:", e);
    } finally {
      set({ isLoading: false });
    }
  },

  fetchHistory: async (jobId?: string) => {
    try {
      const history = await invoke<JobRun[]>("scheduler_get_history", {
        jobId,
        limit: 50,
      });
      set({ history });
    } catch (e) {
      console.error("[job] fetchHistory error:", e);
    }
  },

  createJob: async (job: NewJob) => {
    const created = await invoke<JobDef>("scheduler_create_job", { job });
    set((s) => ({ jobs: [...s.jobs, created] }));
    return created;
  },

  updateJob: async (id: string, job: NewJob) => {
    const updated = await invoke<JobDef>("scheduler_update_job", { id, job });
    set((s) => ({
      jobs: s.jobs.map((j) => (j.id === id ? updated : j)),
    }));
    return updated;
  },

  deleteJob: async (id: string) => {
    await invoke("scheduler_delete_job", { id });
    set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) }));
  },

  toggleJob: async (id: string, enabled: boolean) => {
    if (get().inFlight[id]) return;
    set((s) => ({ inFlight: { ...s.inFlight, [id]: "toggle" }, lastError: null }));
    try {
      await invoke("scheduler_toggle_job", { id, enabled });
      set((s) => ({
        jobs: s.jobs.map((j) => (j.id === id ? { ...j, enabled } : j)),
      }));
    } catch (e) {
      const msg = normalizeError(e);
      set({ lastError: msg, lastAction: "toggle" });
      toast.error(`Failed to toggle job: ${msg}`);
    } finally {
      set((s) => { const { [id]: _, ...rest } = s.inFlight; return { inFlight: rest }; });
    }
  },

  runJobNow: async (id: string) => {
    if (get().inFlight[id]) return;
    set((s) => ({ inFlight: { ...s.inFlight, [id]: "run" }, lastError: null }));
    try {
      await invoke("scheduler_run_job_now", { id });
    } catch (e) {
      const msg = normalizeError(e);
      set({ lastError: msg, lastAction: "run" });
      toast.error(`Failed to run job: ${msg}`);
    } finally {
      set((s) => { const { [id]: _, ...rest } = s.inFlight; return { inFlight: rest }; });
    }
  },

  cancelJob: async (id: string) => {
    if (get().inFlight[id]) return;
    set((s) => ({ inFlight: { ...s.inFlight, [id]: "cancel" }, lastError: null }));
    try {
      await invoke("scheduler_cancel_job", { id });
    } catch (e) {
      const msg = normalizeError(e);
      set({ lastError: msg, lastAction: "cancel" });
      toast.error(`Failed to cancel job: ${msg}`);
    } finally {
      set((s) => { const { [id]: _, ...rest } = s.inFlight; return { inFlight: rest }; });
    }
  },

  clearError: () => set({ lastError: null, lastAction: null }),
}));

// ── Event listeners (registered once at module load) ──

function setupListeners() {
  const { setState: set } = useJobStore;

  listen<SchedulerJobStartedEvent>(EVENTS.SCHEDULER_JOB_STARTED, (event) => {
    set((s) => ({
      runningJobIds: addToSet(s.runningJobIds, event.payload.job_id),
    }));
  });

  listen<SchedulerJobCompletedEvent>(EVENTS.SCHEDULER_JOB_COMPLETED, (event) => {
    const run = event.payload;
    set((s) => ({
      runningJobIds: removeFromSet(s.runningJobIds, run.job_id),
      history: prependCapped(s.history, run, 50),
    }));
  });
}

setupListeners();
