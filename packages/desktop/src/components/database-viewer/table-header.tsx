import { useState, useRef, useEffect, useCallback } from "react";
import {
  IconArrowUp,
  IconArrowDown,
  IconArrowsSort,
} from "@tabler/icons-react";
import type { SortDirection } from "@tanstack/react-table";
import type { ColumnSchema } from "../../types/database";
import type { NativeMenuItem } from "../../lib/native-context-menu";
import { useNativeContextMenu } from "../../lib/use-native-context-menu";

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

  const getContextMenuItems = useCallback((): NativeMenuItem[] => {
    const sortLabel =
      sortDirection === "asc"
        ? "Sort Descending"
        : sortDirection === "desc"
          ? "Clear Sort"
          : "Sort Ascending";
    return [
      { type: "item", id: "toggle-sort", label: sortLabel },
      { type: "item", id: "rename", label: "Rename Column" },
      { type: "separator" },
      { type: "item", id: "delete", label: "Delete Column" },
    ];
  }, [sortDirection]);

  const handleContextMenuAction = useCallback(
    (actionId: string) => {
      switch (actionId) {
        case "toggle-sort":
          onToggleSort();
          break;
        case "rename":
          setEditValue(column.name);
          setEditing(true);
          break;
        case "delete":
          onDelete();
          break;
      }
    },
    [onToggleSort, onDelete, column.name],
  );

  const { onContextMenu } = useNativeContextMenu(
    getContextMenuItems,
    handleContextMenuAction,
  );

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
    <div
      className="flex h-full w-full cursor-default items-center gap-1"
      onContextMenu={onContextMenu}
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
  );
}
