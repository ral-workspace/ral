import { Button } from "@ral/ui";
import { IconShield } from "@tabler/icons-react";
import {
  useACPStore,
  type ACPPermissionRequest,
} from "../stores/acp-store";

interface PermissionDialogProps {
  request: ACPPermissionRequest;
}

export function PermissionDialog({ request }: PermissionDialogProps) {
  const respondPermission = useACPStore((s) => s.respondPermission);

  return (
    <div className="border-t bg-accent/50 px-3 py-2.5">
      <div className="mb-2 flex items-center gap-1.5">
        <IconShield className="size-3.5 text-yellow-500" />
        <span className="text-[11px] font-medium text-foreground">
          Permission Required
        </span>
      </div>
      <p className="mb-2 text-[11px] text-muted-foreground">
        {request.toolCall.title}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {request.options.map((option) => (
          <Button
            key={option.optionId}
            size="xs"
            variant={option.kind === "always" ? "default" : "outline"}
            onClick={() =>
              respondPermission(request.toolCall.toolCallId, option.optionId)
            }
          >
            {option.name}
          </Button>
        ))}
      </div>
    </div>
  );
}
