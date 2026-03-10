import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { JobDef, JobRun, NewJob } from "../types/job";
import type {
  SchedulerJobStartedEvent,
  SchedulerJobCompletedEvent,
} from "../types/events";

// ── Store ──

interface JobState {
  jobs: JobDef[];
  history: JobRun[];
  runningJobIds: Set<string>;
  isLoading: boolean;

  _init: () => Promise<void>;
  fetchJobs: () => Promise<void>;
  fetchHistory: (jobId?: string) => Promise<void>;
  createJob: (job: NewJob) => Promise<JobDef>;
  updateJob: (id: string, job: NewJob) => Promise<JobDef>;
  deleteJob: (id: string) => Promise<void>;
  toggleJob: (id: string, enabled: boolean) => Promise<void>;
  runJobNow: (id: string) => Promise<void>;
  cancelJob: (id: string) => Promise<void>;
}

export const useJobStore = create<JobState>((set, get) => ({
  jobs: [],
  history: [],
  runningJobIds: new Set(),
  isLoading: false,

  _init: async () => {
    await get().fetchJobs();
    await get().fetchHistory();
  },

  fetchJobs: async () => {
    set({ isLoading: true });
    try {
      const jobs = await invoke<JobDef[]>("scheduler_list_jobs");
      set({ jobs });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchHistory: async (jobId?: string) => {
    const history = await invoke<JobRun[]>("scheduler_get_history", {
      jobId,
      limit: 50,
    });
    set({ history });
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
    await invoke("scheduler_toggle_job", { id, enabled });
    set((s) => ({
      jobs: s.jobs.map((j) => (j.id === id ? { ...j, enabled } : j)),
    }));
  },

  runJobNow: async (id: string) => {
    await invoke("scheduler_run_job_now", { id });
  },

  cancelJob: async (id: string) => {
    await invoke("scheduler_cancel_job", { id });
  },
}));

// ── Event listeners (registered once at module load) ──

function setupListeners() {
  const { setState: set } = useJobStore;

  listen<SchedulerJobStartedEvent>("scheduler-job-started", (event) => {
    set((s) => {
      const next = new Set(s.runningJobIds);
      next.add(event.payload.job_id);
      return { runningJobIds: next };
    });
  });

  listen<SchedulerJobCompletedEvent>("scheduler-job-completed", (event) => {
    const run = event.payload;
    set((s) => {
      const next = new Set(s.runningJobIds);
      next.delete(run.job_id);
      return {
        runningJobIds: next,
        history: [run, ...s.history].slice(0, 50),
      };
    });
  });
}

setupListeners();
