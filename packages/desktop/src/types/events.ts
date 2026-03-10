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

// ── Event name constants ──

export const EVENTS = {
  WORKFLOW_RUN_STARTED: "workflow-run-started",
  WORKFLOW_RUN_COMPLETED: "workflow-run-completed",
  WORKFLOW_APPROVAL_PENDING: "workflow-approval-pending",
  WORKFLOW_APPROVAL_RESOLVED: "workflow-approval-resolved",

  SCHEDULER_JOB_STARTED: "scheduler-job-started",
  SCHEDULER_JOB_COMPLETED: "scheduler-job-completed",

  OPEN_PROJECT: "open-project",
  FILE_CHANGED: "file-changed",

  MENU_OPEN_FOLDER: "menu-open-folder",
  MENU_NEW_FILE: "menu-new-file",
  MENU_SAVE: "menu-save",
  MENU_SAVE_AS: "menu-save-as",
  MENU_SAVE_ALL: "menu-save-all",
  MENU_AUTO_SAVE: "menu-auto-save",
  MENU_REVERT_FILE: "menu-revert-file",
  MENU_CLOSE_EDITOR: "menu-close-editor",
  MENU_CLOSE_FOLDER: "menu-close-folder",
  MENU_COMMAND_PALETTE: "menu-command-palette",
  MENU_ZOOM: "menu-zoom",
  MENU_OPEN_RECENT: "menu-open-recent",
} as const;
