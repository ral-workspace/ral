import { IconCode } from "@tabler/icons-react";

interface MarkdownToolbarProps {
  fileName: string;
  onOpenAsCode: () => void;
}

export function MarkdownToolbar({ fileName, onOpenAsCode }: MarkdownToolbarProps) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
      <span className="text-sm font-medium">{fileName}</span>
      <div className="flex-1" />
      <button
        onClick={onOpenAsCode}
        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted/50"
        title="Open as code"
      >
        <IconCode className="size-3" />
      </button>
    </div>
  );
}
