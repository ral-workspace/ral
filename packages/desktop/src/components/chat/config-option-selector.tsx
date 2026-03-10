import { cn } from "@ral/ui";
import { useState, useRef, useEffect } from "react";
import { IconChevronDown } from "@tabler/icons-react";
import type { ConfigOption } from "../../stores/acp-types";

export function ConfigOptionSelector({
  option,
  onSelect,
}: {
  option: ConfigOption;
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Flatten options (handle both grouped and ungrouped)
  const allOptions = option.options.length > 0 && "group" in option.options[0]
    ? (option.options as { group: string; name: string; options: { value: string; name: string; description?: string }[] }[])
        .flatMap((g) => g.options)
    : (option.options as { value: string; name: string; description?: string }[]);

  const currentLabel = allOptions.find((o) => o.value === option.currentValue)?.name ?? option.name;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-accent/50"
      >
        <span>{currentLabel}</span>
        <IconChevronDown className="size-2.5" />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-1 min-w-[140px] rounded-md border bg-popover p-1 shadow-md">
          {"group" in (option.options[0] ?? {})
            ? (option.options as { group: string; name: string; options: { value: string; name: string; description?: string }[] }[]).map((g) => (
                <div key={g.group}>
                  <div className="px-2 py-0.5 text-[9px] text-muted-foreground">{g.name}</div>
                  {g.options.map((o) => (
                    <button
                      key={o.value}
                      onClick={() => { onSelect(o.value); setOpen(false); }}
                      className={cn(
                        "flex w-full flex-col rounded px-2 py-1 text-left transition-colors hover:bg-accent/50",
                        o.value === option.currentValue && "bg-accent/30",
                      )}
                    >
                      <span className="text-[10px] text-foreground">{o.name}</span>
                      {o.description && (
                        <span className="text-[9px] text-muted-foreground">{o.description}</span>
                      )}
                    </button>
                  ))}
                </div>
              ))
            : allOptions.map((o) => (
                <button
                  key={o.value}
                  onClick={() => { onSelect(o.value); setOpen(false); }}
                  className={cn(
                    "flex w-full flex-col rounded px-2 py-1 text-left transition-colors hover:bg-accent/50",
                    o.value === option.currentValue && "bg-accent/30",
                  )}
                >
                  <span className="text-[10px] text-foreground">{o.name}</span>
                  {o.description && (
                    <span className="text-[9px] text-muted-foreground">{o.description}</span>
                  )}
                </button>
              ))
          }
        </div>
      )}
    </div>
  );
}
