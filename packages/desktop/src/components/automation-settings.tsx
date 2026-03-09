import { useEffect, useState } from "react";
import {
  IconPlayerPlay,
  IconPlayerStop,
  IconPencil,
  IconTrash,
  IconPlus,
  IconLoader2,
  IconCheck,
  IconX,
  IconClock,
} from "@tabler/icons-react";
import {
  Item,
  ItemGroup,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  Button,
  Switch,
  Separator,
  Badge,
} from "@helm/ui";
import { useJobStore, type JobDef, type JobRun } from "../stores/job-store";
import { JobFormDialog } from "./job-form-dialog";

function formatSchedule(schedule: JobDef["schedule"]): string {
  switch (schedule.type) {
    case "interval":
      return `Every ${schedule.every} ${schedule.unit}`;
    case "daily":
      return `Daily at ${schedule.at}`;
    case "weekly":
      return `${schedule.day} at ${schedule.at}`;
    case "monthly":
      return `Day ${schedule.day_of_month} at ${schedule.at}`;
    default:
      return "Unknown";
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString();
}

function StatusBadge({ status }: { status: JobRun["status"] }) {
  switch (status) {
    case "success":
      return (
        <Badge variant="secondary" className="gap-1 text-green-500">
          <IconCheck size={12} />
          Success
        </Badge>
      );
    case "failure":
      return (
        <Badge variant="secondary" className="gap-1 text-red-500">
          <IconX size={12} />
          Failed
        </Badge>
      );
    case "timeout":
      return (
        <Badge variant="secondary" className="gap-1 text-yellow-500">
          <IconClock size={12} />
          Timeout
        </Badge>
      );
    case "cancelled":
      return (
        <Badge variant="secondary" className="gap-1 text-muted-foreground">
          Cancelled
        </Badge>
      );
  }
}

export function AutomationSettings() {
  const {
    jobs,
    history,
    runningJobIds,
    isLoading,
    _init,
    toggleJob,
    deleteJob,
    runJobNow,
    cancelJob,
  } = useJobStore();

  const [editingJob, setEditingJob] = useState<JobDef | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    _init();
  }, [_init]);

  const openCreate = () => {
    setEditingJob(null);
    setShowForm(true);
  };

  const openEdit = (job: JobDef) => {
    setEditingJob(job);
    setShowForm(true);
  };

  return (
    <div className="space-y-6">
      {/* Jobs */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium">Scheduled Jobs</h2>
          <Button size="xs" variant="outline" onClick={openCreate}>
            <IconPlus size={14} className="mr-1" />
            New Job
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <IconLoader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="rounded-lg border bg-card px-4 py-8 text-center text-xs text-muted-foreground">
            No scheduled jobs yet. Create one to get started.
          </div>
        ) : (
          <ItemGroup className="rounded-lg border bg-card">
            {jobs.map((job, i) => {
              const isRunning = runningJobIds.has(job.id);
              const lastRun = history.find((r) => r.job_id === job.id);

              return (
                <div key={job.id}>
                  {i > 0 && <Separator />}
                  <Item size="sm">
                    <ItemContent>
                      <ItemTitle className="text-xs">
                        {job.name}
                        {isRunning && (
                          <IconLoader2
                            size={12}
                            className="ml-1.5 inline animate-spin text-blue-500"
                          />
                        )}
                      </ItemTitle>
                      <ItemDescription className="text-[11px]">
                        {formatSchedule(job.schedule)}
                        {lastRun && (
                          <>
                            {" "}
                            &middot; Last: {formatTime(lastRun.finished_at)}{" "}
                            <StatusBadge status={lastRun.status} />
                          </>
                        )}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions className="flex items-center gap-1">
                      <Switch
                        checked={job.enabled}
                        onCheckedChange={(v: boolean) => toggleJob(job.id, v)}
                      />
                      {isRunning ? (
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => cancelJob(job.id)}
                          title="Cancel"
                        >
                          <IconPlayerStop size={14} />
                        </Button>
                      ) : (
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => runJobNow(job.id)}
                          title="Run now"
                        >
                          <IconPlayerPlay size={14} />
                        </Button>
                      )}
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        onClick={() => openEdit(job)}
                        title="Edit"
                      >
                        <IconPencil size={14} />
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        onClick={() => deleteJob(job.id)}
                        title="Delete"
                      >
                        <IconTrash size={14} />
                      </Button>
                    </ItemActions>
                  </Item>
                </div>
              );
            })}
          </ItemGroup>
        )}
      </div>

      {/* Recent Activity */}
      {history.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium">Recent Activity</h2>
          <ItemGroup className="rounded-lg border bg-card">
            {history.slice(0, 10).map((run, i) => (
              <div key={run.id}>
                {i > 0 && <Separator />}
                <Item size="sm">
                  <ItemContent>
                    <ItemTitle className="text-xs">{run.job_name}</ItemTitle>
                    <ItemDescription className="text-[11px]">
                      {formatTime(run.started_at)}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <StatusBadge status={run.status} />
                  </ItemActions>
                </Item>
              </div>
            ))}
          </ItemGroup>
        </div>
      )}

      <JobFormDialog
        open={showForm}
        onOpenChange={setShowForm}
        editingJob={editingJob}
      />
    </div>
  );
}
