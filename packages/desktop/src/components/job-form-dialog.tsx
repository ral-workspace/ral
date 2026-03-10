import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Input,
  Label,
  Switch,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ral/ui";
import {
  type JobDef,
  type NewJob,
  type JobSchedule,
  useJobStore,
} from "../stores/job-store";

interface JobFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingJob: JobDef | null;
}

const SCHEDULE_TYPES = [
  { value: "interval", label: "Interval" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
] as const;

const INTERVAL_UNITS = [
  { value: "minutes", label: "Minutes" },
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
  { value: "weeks", label: "Weeks" },
] as const;

const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export function JobFormDialog({
  open,
  onOpenChange,
  editingJob,
}: JobFormDialogProps) {
  const { createJob, updateJob } = useJobStore();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scheduleType, setScheduleType] = useState<JobSchedule["type"]>("daily");
  const [intervalEvery, setIntervalEvery] = useState(1);
  const [intervalUnit, setIntervalUnit] = useState("hours");
  const [timeAt, setTimeAt] = useState("09:00");
  const [weekday, setWeekday] = useState("monday");
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [cwd, setCwd] = useState("");
  const [timeoutSeconds, setTimeoutSeconds] = useState(300);
  const [notifySuccess, setNotifySuccess] = useState(true);
  const [notifyFailure, setNotifyFailure] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editingJob) {
      setName(editingJob.name);
      setDescription(editingJob.description);
      setScheduleType(editingJob.schedule.type);
      if (editingJob.schedule.type === "interval") {
        setIntervalEvery(editingJob.schedule.every ?? 1);
        setIntervalUnit(editingJob.schedule.unit ?? "hours");
      }
      if (editingJob.schedule.at) setTimeAt(editingJob.schedule.at);
      if (editingJob.schedule.day) setWeekday(editingJob.schedule.day);
      if (editingJob.schedule.day_of_month)
        setDayOfMonth(editingJob.schedule.day_of_month);
      if (editingJob.action.type === "shell") {
        setCommand(editingJob.action.command);
        setArgs((editingJob.action.args ?? []).join(" "));
        setCwd(editingJob.action.cwd ?? "");
        setTimeoutSeconds(editingJob.action.timeout_seconds ?? 300);
      }
      setNotifySuccess(editingJob.notification.on_success);
      setNotifyFailure(editingJob.notification.on_failure);
    } else {
      setName("");
      setDescription("");
      setScheduleType("daily");
      setIntervalEvery(1);
      setIntervalUnit("hours");
      setTimeAt("09:00");
      setWeekday("monday");
      setDayOfMonth(1);
      setCommand("");
      setArgs("");
      setCwd("");
      setTimeoutSeconds(300);
      setNotifySuccess(true);
      setNotifyFailure(true);
    }
  }, [open, editingJob]);

  const buildSchedule = (): JobSchedule => {
    switch (scheduleType) {
      case "interval":
        return {
          type: "interval",
          every: intervalEvery,
          unit: intervalUnit as JobSchedule["unit"],
        };
      case "daily":
        return { type: "daily", at: timeAt };
      case "weekly":
        return { type: "weekly", day: weekday, at: timeAt };
      case "monthly":
        return { type: "monthly", day_of_month: dayOfMonth, at: timeAt };
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !command.trim()) return;
    setSaving(true);
    try {
      const job: NewJob = {
        name: name.trim(),
        description: description.trim(),
        schedule: buildSchedule(),
        action: {
          type: "shell",
          command: command.trim(),
          args: args.trim() ? args.trim().split(/\s+/) : [],
          cwd: cwd.trim() || undefined,
          timeout_seconds: timeoutSeconds,
        },
        notification: {
          on_success: notifySuccess,
          on_failure: notifyFailure,
        },
      };

      if (editingJob) {
        await updateJob(editingJob.id, job);
      } else {
        await createJob(job);
      }
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editingJob ? "Edit Job" : "New Job"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              placeholder="My backup job"
              className="h-8 text-xs"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Input
              value={description}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="h-8 text-xs"
            />
          </div>

          {/* Schedule */}
          <div className="space-y-1.5">
            <Label className="text-xs">Schedule</Label>
            <div className="flex gap-2">
              <Select
                value={scheduleType}
                onValueChange={(v: string) => setScheduleType(v as JobSchedule["type"])}
              >
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULE_TYPES.map((s) => (
                    <SelectItem key={s.value} value={s.value} className="text-xs">
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {scheduleType === "interval" && (
                <>
                  <Input
                    type="number"
                    min={1}
                    value={intervalEvery}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIntervalEvery(Number(e.target.value))}
                    className="h-8 w-16 text-xs"
                  />
                  <Select value={intervalUnit} onValueChange={setIntervalUnit}>
                    <SelectTrigger className="h-8 w-24 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INTERVAL_UNITS.map((u) => (
                        <SelectItem key={u.value} value={u.value} className="text-xs">
                          {u.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}

              {scheduleType !== "interval" && (
                <Input
                  type="time"
                  value={timeAt}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTimeAt(e.target.value)}
                  className="h-8 w-28 text-xs"
                />
              )}
            </div>

            {scheduleType === "weekly" && (
              <Select value={weekday} onValueChange={setWeekday}>
                <SelectTrigger className="mt-2 h-8 w-36 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((d) => (
                    <SelectItem key={d} value={d} className="text-xs capitalize">
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {scheduleType === "monthly" && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Day</span>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={dayOfMonth}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDayOfMonth(Number(e.target.value))}
                  className="h-8 w-16 text-xs"
                />
              </div>
            )}
          </div>

          {/* Command */}
          <div className="space-y-1.5">
            <Label className="text-xs">Command</Label>
            <Input
              value={command}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCommand(e.target.value)}
              placeholder="/usr/local/bin/backup.sh"
              className="h-8 font-mono text-xs"
            />
          </div>

          {/* Arguments */}
          <div className="space-y-1.5">
            <Label className="text-xs">Arguments</Label>
            <Input
              value={args}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setArgs(e.target.value)}
              placeholder="--verbose --output /tmp"
              className="h-8 font-mono text-xs"
            />
          </div>

          {/* Working directory */}
          <div className="space-y-1.5">
            <Label className="text-xs">Working Directory</Label>
            <Input
              value={cwd}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCwd(e.target.value)}
              placeholder="Optional"
              className="h-8 font-mono text-xs"
            />
          </div>

          {/* Timeout */}
          <div className="space-y-1.5">
            <Label className="text-xs">Timeout (seconds)</Label>
            <Input
              type="number"
              min={1}
              value={timeoutSeconds}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTimeoutSeconds(Number(e.target.value))}
              className="h-8 w-24 text-xs"
            />
          </div>

          {/* Notifications */}
          <div className="space-y-2">
            <Label className="text-xs">Notifications</Label>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">On success</span>
              <Switch checked={notifySuccess} onCheckedChange={setNotifySuccess} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">On failure</span>
              <Switch checked={notifyFailure} onCheckedChange={setNotifyFailure} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !name.trim() || !command.trim()}
          >
            {saving ? "Saving..." : editingJob ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
