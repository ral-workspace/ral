import { useCallback, useMemo } from "react";
import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import type { ColumnSchema, DatabaseRow } from "../../types/database";
import { BoardColumn } from "./board-column";

interface BoardViewProps {
  columns: ColumnSchema[];
  rows: DatabaseRow[];
  groupByColumnId: string;
  onMoveRow: (rowId: string, columnId: string, newValue: string) => void;
  onUpdateCell: (rowId: string, columnId: string, value: unknown) => void;
  onAddRow: () => void;
  onAddRowWithValue: (columnId: string, value: string, title: string) => void;
  onDeleteRow: (rowId: string) => void;
}

export function BoardView({
  columns,
  rows,
  groupByColumnId,
  onMoveRow,
  onAddRowWithValue,
  onDeleteRow,
}: BoardViewProps) {
  const groupColumn = columns.find((c) => c.id === groupByColumnId);
  const titleColumnId =
    columns.find((c) => c.type === "text")?.id ?? columns[0]?.id ?? "";

  const groupValues = useMemo(() => {
    if (groupColumn?.options) return groupColumn.options;
    const values = new Set<string>();
    for (const row of rows) {
      const v = row.cells[groupByColumnId];
      if (v != null && v !== "") values.add(String(v));
    }
    return Array.from(values);
  }, [groupColumn, rows, groupByColumnId]);

  const grouped = useMemo(() => {
    const map = new Map<string, DatabaseRow[]>();
    for (const gv of groupValues) {
      map.set(gv, []);
    }
    map.set("", []);
    for (const row of rows) {
      const val = String(row.cells[groupByColumnId] ?? "");
      const bucket = map.get(val);
      if (bucket) {
        bucket.push(row);
      } else {
        map.get("")!.push(row);
      }
    }
    return map;
  }, [rows, groupValues, groupByColumnId]);

  const displayGroups = useMemo(() => {
    const result: [string, DatabaseRow[]][] = [];
    for (const gv of groupValues) {
      result.push([gv, grouped.get(gv) ?? []]);
    }
    const uncategorized = grouped.get("") ?? [];
    if (uncategorized.length > 0) {
      result.push(["", uncategorized]);
    }
    return result;
  }, [groupValues, grouped]);

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      const { destination, draggableId } = result;
      if (!destination) return;
      onMoveRow(draggableId, groupByColumnId, destination.droppableId);
    },
    [onMoveRow, groupByColumnId],
  );

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex h-full w-full gap-3 overflow-x-auto p-4">
        {displayGroups.map(([groupValue, groupRows]) => (
          <BoardColumn
            key={groupValue || "__empty__"}
            groupValue={groupValue}
            rows={groupRows}
            allColumns={columns}
            titleColumnId={titleColumnId}
            groupByColumnId={groupByColumnId}
            onDeleteRow={onDeleteRow}
            onAddCard={(title) =>
              onAddRowWithValue(groupValue, titleColumnId, title)
            }
          />
        ))}
      </div>
    </DragDropContext>
  );
}
