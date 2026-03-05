import { Draggable } from "@hello-pangea/dnd";
import { IconTrash } from "@tabler/icons-react";
import type { ColumnSchema, DatabaseRow } from "../../types/database";

interface BoardCardProps {
  row: DatabaseRow;
  index: number;
  columns: ColumnSchema[];
  titleColumnId: string;
  groupByColumnId: string;
  onDelete: () => void;
}

export function BoardCard({
  row,
  index,
  columns,
  titleColumnId,
  groupByColumnId,
  onDelete,
}: BoardCardProps) {
  const title = String(row.cells[titleColumnId] ?? "Untitled");
  const otherColumns = columns.filter(
    (c) =>
      c.id !== titleColumnId &&
      c.id !== groupByColumnId &&
      row.cells[c.id] != null &&
      row.cells[c.id] !== "",
  );

  return (
    <Draggable draggableId={row.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`group/card cursor-grab rounded-lg border bg-card p-3 transition-shadow hover:shadow-md ${
            snapshot.isDragging ? "shadow-lg" : ""
          }`}
        >
          <div className="flex items-start gap-1">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{title}</p>
              {otherColumns.slice(0, 3).map((col) => (
                <p
                  key={col.id}
                  className="mt-1 truncate text-[10px] text-muted-foreground"
                >
                  {col.name}: {String(row.cells[col.id])}
                </p>
              ))}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="shrink-0 rounded p-0.5 opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover/card:opacity-100"
            >
              <IconTrash className="size-3" />
            </button>
          </div>
        </div>
      )}
    </Draggable>
  );
}
