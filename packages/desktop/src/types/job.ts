export interface JobSchedule {
  type: "interval" | "daily" | "weekly" | "monthly";
  every?: number;
  unit?: "minutes" | "hours" | "days" | "weeks";
  at?: string;
  day?: string;
  day_of_month?: number;
}

export interface JobAction {
  type: "shell";
  command: string;
  args?: string[];
  cwd?: string;
  timeout_seconds?: number;
}

export interface NotificationConfig {
  on_success: boolean;
  on_failure: boolean;
}

export interface JobDef {
  id: string;
  name: string;
  description: string;
  source: string;
  enabled: boolean;
  schedule: JobSchedule;
  action: JobAction;
  notification: NotificationConfig;
  created_at: string;
  updated_at: string;
}

export interface NewJob {
  name: string;
  description?: string;
  schedule: JobSchedule;
  action: JobAction;
  notification?: NotificationConfig;
}

export interface JobRun {
  id: string;
  job_id: string;
  job_name: string;
  started_at: string;
  finished_at: string;
  status: "success" | "failure" | "timeout" | "cancelled";
  stdout?: string;
  stderr?: string;
  exit_code?: number;
}
