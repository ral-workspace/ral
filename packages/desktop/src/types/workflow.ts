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
  project_path: string | null;
  status: string;
  started_at: string;
  finished_at: string | null;
  steps: StepResult[];
  error: string | null;
}
