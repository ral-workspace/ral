import { IconPlus } from "@tabler/icons-react";
import type { ColumnSchema, DatabaseRow } from "../../types/database";
import { TableHeader } from "./table-header";
import { TableRowComponent } from "./table-row";

interface TableViewProps {
  columns: ColumnSchema[];
  rows: DatabaseRow[];
  onUpdateCell: (rowId: string, columnId: string, value: unknown) => void;
  onAddRow: () => void;
  onDeleteRow: (rowId: string) => void;
  onDeleteColumn: (columnId: string) => void;
}

export function TableView({
  columns,
  rows,
  onUpdateCell,
  onAddRow,
  onDeleteRow,
  onDeleteColumn,
}: TableViewProps) {
  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse text-sm">
        <TableHeader columns={columns} onDeleteColumn={onDeleteColumn} />
        <tbody>
          {rows.map((row) => (
            <TableRowComponent
              key={row.id}
              row={row}
              columns={columns}
              onUpdateCell={(colId, value) => onUpdateCell(row.id, colId, value)}
              onDeleteRow={() => onDeleteRow(row.id)}
            />
          ))}
        </tbody>
      </table>
      <button
        onClick={onAddRow}
        className="flex w-full items-center gap-1 border-b px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted/20"
      >
        <IconPlus className="size-3" />
        New row
      </button>
    </div>
  );
}
