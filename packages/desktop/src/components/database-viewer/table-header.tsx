import { useState, useRef, useEffect } from "react";
import {
  IconArrowUp,
  IconArrowDown,
  IconArrowsSort,
} from "@tabler/icons-react";
import type { SortDirection } from "@tanstack/react-table";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@helm/ui";
import type { ColumnSchema } from "../../types/database";

interface EditableHeaderCellProps {
  column: ColumnSchema;
  onRename: (newName: string) => void;
  onDelete: () => void;
  sortDirection: false | SortDirection;
  onToggleSort: () => void;
}

export function EditableHeaderCell({
  column,
  onRename,
  onDelete,
  sortDirection,
  onToggleSort,
}: EditableHeaderCellProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(column.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== column.name) {
      onRename(trimmed);
    } else {
      setEditValue(column.name);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setEditValue(column.name);
            setEditing(false);
          }
        }}
        className="w-full rounded bg-background px-1 py-0.5 text-xs font-medium text-foreground outline-none ring-1 ring-ring"
      />
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className="flex h-full w-full cursor-default items-center gap-1"
          onDoubleClick={() => {
            setEditValue(column.name);
            setEditing(true);
          }}
        >
          <span className="flex-1 truncate">{column.name}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleSort();
            }}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
          >
            {sortDirection === "asc" ? (
              <IconArrowUp className="size-3" />
            ) : sortDirection === "desc" ? (
              <IconArrowDown className="size-3" />
            ) : (
              <IconArrowsSort className="size-3 opacity-0 group-hover:opacity-100" />
            )}
          </button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onToggleSort}>
          <IconArrowsSort className="size-4" />
          {sortDirection === "asc"
            ? "Sort descending"
            : sortDirection === "desc"
              ? "Clear sort"
              : "Sort ascending"}
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            setEditValue(column.name);
            setEditing(true);
          }}
        >
          Rename column
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={onDelete}>
          Delete column
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
