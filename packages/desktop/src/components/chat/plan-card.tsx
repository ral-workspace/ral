import { cn } from "@helm/ui";
import { IconCheck, IconLoader2, IconCircle } from "@tabler/icons-react";
import type { PlanEntry } from "../../stores/acp-types";

export function PlanCard({ entries }: { entries: PlanEntry[] }) {
  return (
    <div className="flex gap-2.5">
      <div className="flex h-[15px] w-2.5 shrink-0 items-center justify-center">
        <span className="size-[7px] rounded-full bg-blue-500" />
      </div>
      <div className="min-w-0 flex-1">
        <span className="text-xs font-semibold leading-4 text-foreground">Plan</span>
        <div className="mt-1 space-y-0.5">
          {entries.map((entry, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs leading-5">
              {entry.status === "completed" ? (
                <IconCheck className="size-3 shrink-0 text-green-500" />
              ) : entry.status === "in_progress" ? (
                <IconLoader2 className="size-3 shrink-0 animate-spin text-yellow-500" />
              ) : (
                <IconCircle className="size-3 shrink-0 text-muted-foreground/40" />
              )}
              <span className={cn(
                entry.status === "completed" ? "text-muted-foreground line-through" :
                entry.priority === "low" ? "text-muted-foreground" : "text-foreground",
              )}>
                {entry.content}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
