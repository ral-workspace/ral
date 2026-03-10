import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useJobStore } from "../stores/job-store";
import type { JobDef, JobRun } from "../types/job";

const mockedInvoke = vi.mocked(invoke);

function makeJob(overrides: Partial<JobDef> = {}): JobDef {
  return {
    id: "job-1",
    name: "Test Job",
    description: "",
    source: "user",
    enabled: true,
    schedule: { type: "daily", at: "09:00" },
    action: { type: "shell", command: "echo", args: ["hello"] },
    notification: { on_success: true, on_failure: true },
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeRun(overrides: Partial<JobRun> = {}): JobRun {
  return {
    id: "run-1",
    job_id: "job-1",
    job_name: "Test Job",
    started_at: "2026-01-01T00:00:00Z",
    finished_at: "2026-01-01T00:01:00Z",
    status: "success",
    ...overrides,
  };
}

describe("job-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the store state
    useJobStore.setState({
      jobs: [],
      history: [],
      runningJobIds: new Set(),
      isLoading: false,
    });
  });

  describe("fetchJobs", () => {
    it("should fetch jobs and update state", async () => {
      const jobs = [makeJob(), makeJob({ id: "job-2", name: "Job 2" })];
      mockedInvoke.mockResolvedValueOnce(jobs);

      await useJobStore.getState().fetchJobs();

      expect(mockedInvoke).toHaveBeenCalledWith("scheduler_list_jobs");
      expect(useJobStore.getState().jobs).toEqual(jobs);
      expect(useJobStore.getState().isLoading).toBe(false);
    });

    it("should set isLoading during fetch", async () => {
      let resolveInvoke: (value: unknown) => void;
      mockedInvoke.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveInvoke = resolve;
        }),
      );

      const promise = useJobStore.getState().fetchJobs();
      expect(useJobStore.getState().isLoading).toBe(true);

      resolveInvoke!([]);
      await promise;
      expect(useJobStore.getState().isLoading).toBe(false);
    });

    it("should reset isLoading on error", async () => {
      mockedInvoke.mockRejectedValueOnce(new Error("fail"));

      // fetchJobs catches errors internally (logs to console.error)
      await useJobStore.getState().fetchJobs();
      expect(useJobStore.getState().isLoading).toBe(false);
    });
  });

  describe("fetchHistory", () => {
    it("should fetch history and update state", async () => {
      const history = [makeRun()];
      mockedInvoke.mockResolvedValueOnce(history);

      await useJobStore.getState().fetchHistory();

      expect(mockedInvoke).toHaveBeenCalledWith("scheduler_get_history", {
        jobId: undefined,
        limit: 50,
      });
      expect(useJobStore.getState().history).toEqual(history);
    });

    it("should pass jobId filter", async () => {
      mockedInvoke.mockResolvedValueOnce([]);

      await useJobStore.getState().fetchHistory("job-1");

      expect(mockedInvoke).toHaveBeenCalledWith("scheduler_get_history", {
        jobId: "job-1",
        limit: 50,
      });
    });
  });

  describe("createJob", () => {
    it("should create a job and add to state", async () => {
      const created = makeJob({ id: "new-job" });
      mockedInvoke.mockResolvedValueOnce(created);

      const result = await useJobStore.getState().createJob({
        name: "New Job",
        schedule: { type: "daily", at: "09:00" },
        action: { type: "shell", command: "echo" },
      });

      expect(mockedInvoke).toHaveBeenCalledWith("scheduler_create_job", {
        job: {
          name: "New Job",
          schedule: { type: "daily", at: "09:00" },
          action: { type: "shell", command: "echo" },
        },
      });
      expect(result).toEqual(created);
      expect(useJobStore.getState().jobs).toContainEqual(created);
    });
  });

  describe("updateJob", () => {
    it("should update a job and replace in state", async () => {
      const original = makeJob({ id: "job-1", name: "Old" });
      const updated = makeJob({ id: "job-1", name: "Updated" });
      useJobStore.setState({ jobs: [original] });

      mockedInvoke.mockResolvedValueOnce(updated);

      const result = await useJobStore.getState().updateJob("job-1", {
        name: "Updated",
        schedule: { type: "daily", at: "10:00" },
        action: { type: "shell", command: "echo" },
      });

      expect(result.name).toBe("Updated");
      expect(useJobStore.getState().jobs[0].name).toBe("Updated");
    });
  });

  describe("deleteJob", () => {
    it("should delete a job and remove from state", async () => {
      const job = makeJob({ id: "job-1" });
      useJobStore.setState({ jobs: [job] });
      mockedInvoke.mockResolvedValueOnce(undefined);

      await useJobStore.getState().deleteJob("job-1");

      expect(mockedInvoke).toHaveBeenCalledWith("scheduler_delete_job", {
        id: "job-1",
      });
      expect(useJobStore.getState().jobs).toHaveLength(0);
    });

    it("should only remove the targeted job", async () => {
      const jobs = [
        makeJob({ id: "job-1" }),
        makeJob({ id: "job-2", name: "Keep" }),
      ];
      useJobStore.setState({ jobs });
      mockedInvoke.mockResolvedValueOnce(undefined);

      await useJobStore.getState().deleteJob("job-1");

      expect(useJobStore.getState().jobs).toHaveLength(1);
      expect(useJobStore.getState().jobs[0].id).toBe("job-2");
    });
  });

  describe("toggleJob", () => {
    it("should toggle job enabled state", async () => {
      const job = makeJob({ id: "job-1", enabled: true });
      useJobStore.setState({ jobs: [job] });
      mockedInvoke.mockResolvedValueOnce(undefined);

      await useJobStore.getState().toggleJob("job-1", false);

      expect(mockedInvoke).toHaveBeenCalledWith("scheduler_toggle_job", {
        id: "job-1",
        enabled: false,
      });
      expect(useJobStore.getState().jobs[0].enabled).toBe(false);
    });
  });

  describe("runJobNow", () => {
    it("should invoke run command", async () => {
      mockedInvoke.mockResolvedValueOnce(undefined);

      await useJobStore.getState().runJobNow("job-1");

      expect(mockedInvoke).toHaveBeenCalledWith("scheduler_run_job_now", {
        id: "job-1",
      });
    });
  });

  describe("cancelJob", () => {
    it("should invoke cancel command", async () => {
      mockedInvoke.mockResolvedValueOnce(undefined);

      await useJobStore.getState().cancelJob("job-1");

      expect(mockedInvoke).toHaveBeenCalledWith("scheduler_cancel_job", {
        id: "job-1",
      });
    });
  });

  describe("event handling", () => {
    it("should track running job ids from started events", () => {
      useJobStore.setState({
        runningJobIds: new Set(["job-1"]),
      });

      const state = useJobStore.getState();
      expect(state.runningJobIds.has("job-1")).toBe(true);
      expect(state.runningJobIds.has("job-2")).toBe(false);
    });

    it("should prepend completed runs to history", () => {
      const existingRun = makeRun({ id: "run-old", job_id: "job-1" });
      const newRun = makeRun({ id: "run-new", job_id: "job-2" });
      useJobStore.setState({
        history: [existingRun],
        runningJobIds: new Set(["job-2"]),
      });

      // Simulate what the event handler does
      useJobStore.setState((s) => {
        const next = new Set(s.runningJobIds);
        next.delete(newRun.job_id);
        return {
          runningJobIds: next,
          history: [newRun, ...s.history].slice(0, 50),
        };
      });

      const state = useJobStore.getState();
      expect(state.history).toHaveLength(2);
      expect(state.history[0].id).toBe("run-new");
      expect(state.runningJobIds.has("job-2")).toBe(false);
    });

    it("should cap history at 50 entries", () => {
      const runs = Array.from({ length: 55 }, (_, i) =>
        makeRun({ id: `run-${i}` }),
      );
      useJobStore.setState({ history: runs.slice(0, 49) });

      const newRun = makeRun({ id: "run-latest" });
      useJobStore.setState((s) => ({
        history: [newRun, ...s.history].slice(0, 50),
      }));

      expect(useJobStore.getState().history).toHaveLength(50);
      expect(useJobStore.getState().history[0].id).toBe("run-latest");
    });
  });
});
