import { useState } from "react";
import { Droppable } from "@hello-pangea/dnd";
import { IconPlus } from "@tabler/icons-react";
import type { ColumnSchema, DatabaseRow } from "../../types/database";
import { BoardCard } from "./board-card";

interface BoardColumnProps {
  groupValue: string;
  rows: DatabaseRow[];
  allColumns: ColumnSchema[];
  titleColumnId: string;
  groupByColumnId: string;
  onDeleteRow: (rowId: string) => void;
  onAddCard: (title: string) => void;
}

export function BoardColumn({
  groupValue,
  rows,
  allColumns,
  titleColumnId,
  groupByColumnId,
  onDeleteRow,
  onAddCard,
}: BoardColumnProps) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onAddCard(text.trim());
    setText("");
    setAdding(false);
  };

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-lg bg-muted/30">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">
            {groupValue || "No value"}
          </span>
          <span className="rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
            {rows.length}
          </span>
        </div>
      </div>

      <Droppable droppableId={groupValue}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex min-h-[40px] flex-1 flex-col gap-2 overflow-auto px-2 pb-2 rounded-md ${
              snapshot.isDraggingOver ? "bg-primary/5" : ""
            }`}
          >
            {rows.map((row, index) => (
              <BoardCard
                key={row.id}
                row={row}
                index={index}
                columns={allColumns}
                titleColumnId={titleColumnId}
                groupByColumnId={groupByColumnId}
                onDelete={() => onDeleteRow(row.id)}
              />
            ))}
            {provided.placeholder}

            {/* Add card */}
            {adding ? (
              <form onSubmit={handleSubmit}>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  autoFocus
                  placeholder="Add new card..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit(e);
                    }
                    if (e.key === "Escape") {
                      setText("");
                      setAdding(false);
                    }
                  }}
                  onBlur={() => {
                    if (!text.trim()) setAdding(false);
                  }}
                  className="w-full rounded-md border bg-background p-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                  rows={2}
                />
                <div className="mt-1.5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setText("");
                      setAdding(false);
                    }}
                    className="px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex items-center gap-1 rounded bg-primary px-2 py-1 text-[10px] text-primary-foreground hover:bg-primary/90"
                  >
                    Add
                    <IconPlus className="size-3" />
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setAdding(true)}
                className="flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted/50"
              >
                <IconPlus className="size-3" />
                Add card
              </button>
            )}
          </div>
        )}
      </Droppable>
    </div>
  );
}
