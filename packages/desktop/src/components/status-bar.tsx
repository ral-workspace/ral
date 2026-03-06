import { useACPStore } from "../stores/acp-store";
import { cn } from "@helm/ui";

export function StatusBar() {
  const connected = useACPStore((s) => s.connected);
  const sessionReady = useACPStore((s) => s.sessionReady);

  const statusLabel = sessionReady
    ? "Ready"
    : connected
      ? "Connecting..."
      : "Disconnected";

  return (
    <div className="flex h-6 items-center border-t px-3">
      <span className="text-[10px] text-muted-foreground">Helm v0.1.0</span>
      <div className="flex-1" />
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "size-1.5 rounded-full",
            sessionReady
              ? "bg-green-500"
              : connected
                ? "bg-yellow-500"
                : "bg-red-500",
          )}
        />
        <span className="text-[10px] text-muted-foreground">{statusLabel}</span>
      </div>
    </div>
  );
}
