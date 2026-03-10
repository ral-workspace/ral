import { useEffect } from "react";
import {
  IconPlayerPlay,
  IconPlayerStop,
  IconCheck,
  IconX,
  IconLoader2,
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
} from "@ral/ui";
import { useWorkflowStore } from "../stores/workflow-store";
import { useWorkspaceStore } from "../stores";

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString();
}

function StatusBadge({ status }: { status: string }) {
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
    case "running":
      return (
        <Badge variant="secondary" className="gap-1 text-blue-500">
          <IconLoader2 size={12} className="animate-spin" />
          Running
        </Badge>
      );
    case "cancelled":
      return (
        <Badge variant="secondary" className="gap-1 text-muted-foreground">
          Cancelled
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="gap-1 text-muted-foreground">
          {status}
        </Badge>
      );
  }
}

export function WorkflowsView() {
  const projectPath = useWorkspaceStore((s) => s.projectPath);
  const {
    workflows,
    runs,
    runningWorkflows,
    isLoading,
    _init,
    toggleWorkflow,
    runWorkflow,
    cancelWorkflow,
  } = useWorkflowStore();

  useEffect(() => {
    if (projectPath) {
      _init(projectPath);
    }
  }, [projectPath, _init]);

  if (!projectPath) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-10">
        <div className="rounded-lg border bg-card px-4 py-8 text-center text-xs text-muted-foreground">
          Open a project to manage workflows.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold">Workflows</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Automated workflows that connect to SaaS via MCP and process data with
          AI.
        </p>
      </div>

      {/* Workflow List */}
      <div>
        <h2 className="mb-3 text-sm font-medium">Defined Workflows</h2>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <IconLoader2
              size={20}
              className="animate-spin text-muted-foreground"
            />
          </div>
        ) : workflows.length === 0 ? (
          <div className="rounded-lg border bg-card px-4 py-8 text-center text-xs text-muted-foreground">
            <p>No workflows found.</p>
            <p className="mt-2">
              Create a YAML file in{" "}
              <code className="rounded bg-muted px-1 py-0.5">
                .ral/workflows/
              </code>{" "}
              to get started.
            </p>
          </div>
        ) : (
          <ItemGroup className="rounded-lg border bg-card">
            {workflows.map((wf, i) => {
              const isRunning = runningWorkflows.has(wf.id);
              const lastRun = runs.find((r) => r.workflow_id === wf.id);

              return (
                <div key={wf.id}>
                  {i > 0 && <Separator />}
                  <Item size="sm">
                    <ItemContent>
                      <ItemTitle className="text-xs">
                        {wf.name}
                        {isRunning && (
                          <IconLoader2
                            size={12}
                            className="ml-1.5 inline animate-spin text-blue-500"
                          />
                        )}
                      </ItemTitle>
                      <ItemDescription className="text-[11px]">
                        {wf.schedule_description ?? "Manual only"}
                        {lastRun && (
                          <>
                            {" "}
                            &middot; Last: {formatTime(lastRun.started_at)}{" "}
                            <StatusBadge status={lastRun.status} />
                          </>
                        )}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions className="flex items-center gap-1">
                      <Switch
                        checked={wf.enabled}
                        onCheckedChange={(v: boolean) =>
                          toggleWorkflow(projectPath, wf.id, v)
                        }
                      />
                      {isRunning ? (
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => {
                            const run = runs.find(
                              (r) =>
                                r.workflow_id === wf.id &&
                                r.status === "running",
                            );
                            if (run) cancelWorkflow(run.id);
                          }}
                          title="Cancel"
                        >
                          <IconPlayerStop size={14} />
                        </Button>
                      ) : (
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => runWorkflow(projectPath, wf.id)}
                          title="Run now"
                        >
                          <IconPlayerPlay size={14} />
                        </Button>
                      )}
                    </ItemActions>
                  </Item>
                </div>
              );
            })}
          </ItemGroup>
        )}
      </div>

      {/* Recent Activity */}
      {runs.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium">Recent Activity</h2>
          <ItemGroup className="rounded-lg border bg-card">
            {runs.slice(0, 10).map((run, i) => (
              <div key={run.id}>
                {i > 0 && <Separator />}
                <Item size="sm">
                  <ItemContent>
                    <ItemTitle className="text-xs">
                      {workflows.find((w) => w.id === run.workflow_id)?.name ??
                        run.workflow_id}
                    </ItemTitle>
                    <ItemDescription className="text-[11px]">
                      {formatTime(run.started_at)}
                      {run.error && (
                        <span className="ml-1 text-red-500">
                          — {run.error}
                        </span>
                      )}
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
    </div>
  );
}
