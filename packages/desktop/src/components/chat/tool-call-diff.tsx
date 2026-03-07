import { IconPencil, IconFilePlus } from "@tabler/icons-react";
import { createTwoFilesPatch } from "diff";
import { useEditorStore } from "../../stores";

export function DiffBlock({
  diff,
}: {
  diff: { path: string; oldText: string | null; newText: string };
}) {
  const openDiff = useEditorStore((s) => s.openDiff);
  const isNewFile = diff.oldText == null;
  const fileName = diff.path.split("/").pop() ?? diff.path;

  // Generate unified diff lines
  const patch = createTwoFilesPatch(
    diff.path,
    diff.path,
    diff.oldText ?? "",
    diff.newText,
    "",
    "",
    { context: 3 },
  );

  // Parse patch into displayable lines (skip header lines)
  const lines = patch.split("\n");
  const diffLines = lines.filter(
    (line) =>
      !line.startsWith("===") &&
      !line.startsWith("---") &&
      !line.startsWith("+++") &&
      !line.startsWith("Index:"),
  );

  return (
    <div className="overflow-hidden rounded border bg-background">
      {/* File path header */}
      <button
        onClick={() => openDiff(diff.path, diff.oldText, diff.newText)}
        className="flex w-full items-center gap-1 border-b px-2 py-1 text-left hover:bg-accent/30"
      >
        {isNewFile ? (
          <IconFilePlus className="size-3 text-green-500" />
        ) : (
          <IconPencil className="size-3 text-yellow-500" />
        )}
        <span className="text-[10px] text-blue-400 hover:underline">
          {fileName}
        </span>
        {isNewFile && (
          <span className="text-[9px] text-green-500">(new)</span>
        )}
      </button>

      {/* Diff lines */}
      <div className="max-h-48 overflow-auto font-mono text-[10px] leading-[16px]">
        {diffLines.map((line, i) => {
          let lineClass = "px-2 text-muted-foreground";
          if (line.startsWith("@@")) {
            lineClass = "px-2 bg-blue-500/10 text-blue-400";
          } else if (line.startsWith("+")) {
            lineClass = "px-2 bg-green-500/10 text-green-400";
          } else if (line.startsWith("-")) {
            lineClass = "px-2 bg-red-500/10 text-red-400";
          }

          return (
            <div key={i} className={lineClass}>
              {line || " "}
            </div>
          );
        })}
      </div>
    </div>
  );
}
