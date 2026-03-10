import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { useACPStore } from "../stores/acp-store";
import { cn } from "@ral/ui";

export function StatusBar() {
  const connected = useACPStore((s) => s.connected);
  const sessionReady = useACPStore((s) => s.sessionReady);
  const [version, setVersion] = useState("");

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  const statusLabel = sessionReady
    ? "Ready"
    : connected
      ? "Connecting..."
      : "Disconnected";

  return (
    <div className="flex h-6 items-center border-t px-3">
      <span className="text-[10px] text-muted-foreground">Ral{version ? ` v${version}` : ""}</span>
      <div className="flex-1" />
      <div className="flex items-center gap-1.5">
        {connected && !sessionReady ? (
          <span className="size-3 animate-spin rounded-full border border-yellow-500 border-t-transparent" />
        ) : (
          <span
            className={cn(
              "size-1.5 rounded-full",
              sessionReady ? "bg-green-500" : "bg-red-500",
            )}
          />
        )}
        <span className="text-[10px] text-muted-foreground">{statusLabel}</span>
      </div>
    </div>
  );
}
