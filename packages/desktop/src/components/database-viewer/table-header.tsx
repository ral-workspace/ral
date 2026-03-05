import { IconTrash } from "@tabler/icons-react";
import type { ColumnSchema } from "../../types/database";

interface TableHeaderProps {
  columns: ColumnSchema[];
  onDeleteColumn: (columnId: string) => void;
}

export function TableHeader({ columns, onDeleteColumn }: TableHeaderProps) {
  return (
    <thead>
      <tr>
        {columns.map((col) => (
          <th
            key={col.id}
            className="group border-b border-r bg-muted/30 px-2 py-1.5 text-left text-xs font-medium text-muted-foreground"
          >
            <div className="flex items-center gap-1">
              <span className="flex-1 truncate">{col.name}</span>
              <button
                onClick={() => onDeleteColumn(col.id)}
                className="shrink-0 rounded p-0.5 opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                title="Delete column"
              >
                <IconTrash className="size-3" />
              </button>
            </div>
          </th>
        ))}
        <th className="w-8 border-b bg-muted/30" />
      </tr>
    </thead>
  );
}
