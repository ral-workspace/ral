import type { JobRun } from "./job";

// ── Workflow events ──

export interface WorkflowRunStartedEvent {
  workflow_id: string;
  run_id: string;
  project_path?: string;
}

export interface WorkflowRunCompletedEvent {
  run_id: string;
  workflow_id: string;
  status: string;
  project_path?: string;
}

export interface WorkflowApprovalPendingEvent {
  run_id: string;
  workflow_id: string;
  workflow_name: string;
  step_id: string;
  step_tool?: string;
  step_agent?: string;
  project_path?: string;
}

export interface WorkflowApprovalResolvedEvent {
  run_id: string;
  step_id: string;
  approved: boolean;
  project_path?: string;
}

// ── Scheduler job events ──

export interface SchedulerJobStartedEvent {
  job_id: string;
}

export type SchedulerJobCompletedEvent = JobRun;
