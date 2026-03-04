import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@helm/ui";
import { getCommands, type Command } from "../lib/commands";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const commands = getCommands();

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const execute = (cmd: Command) => {
    onClose();
    requestAnimationFrame(() => cmd.run());
  };

  // Group commands by category
  const groups = new Map<string, Command[]>();
  for (const cmd of commands) {
    const cat = cmd.category ?? "Other";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(cmd);
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={(v) => !v && onClose()}
      showCloseButton={false}
    >
      <CommandInput
        placeholder="Type a command..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No matching commands</CommandEmpty>
        {Array.from(groups.entries()).map(([category, cmds]) => (
          <CommandGroup key={category} heading={category}>
            {cmds.map((cmd) => (
              <CommandItem
                key={cmd.id}
                value={`${category}: ${cmd.label}`}
                onSelect={() => execute(cmd)}
              >
                <span>{cmd.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
