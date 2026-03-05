import { IconTrash } from "@tabler/icons-react";
import type { ColumnSchema, DatabaseRow } from "../../types/database";
import { TableCell } from "./table-cell";

interface TableRowProps {
  row: DatabaseRow;
  columns: ColumnSchema[];
  onUpdateCell: (columnId: string, value: unknown) => void;
  onDeleteRow: () => void;
}

export function TableRowComponent({
  row,
  columns,
  onUpdateCell,
  onDeleteRow,
}: TableRowProps) {
  return (
    <tr className="group/row hover:bg-muted/20">
      {columns.map((col) => (
        <TableCell
          key={col.id}
          column={col}
          value={row.cells[col.id]}
          onChange={(v) => onUpdateCell(col.id, v)}
        />
      ))}
      <td className="w-8 border-b px-1 py-1">
        <button
          onClick={onDeleteRow}
          className="rounded p-0.5 opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover/row:opacity-100"
          title="Delete row"
        >
          <IconTrash className="size-3" />
        </button>
      </td>
    </tr>
  );
}
