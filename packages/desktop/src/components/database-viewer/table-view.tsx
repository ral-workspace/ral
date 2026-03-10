import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import {
  Table,
  TableBody,
  TableCell as ShadTableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ral/ui";
import type { ColumnSchema, DatabaseRow } from "../../types/database";
import { EditableHeaderCell } from "./table-header";
import { CellRenderer } from "./table-cell";

interface TableViewProps {
  columns: ColumnSchema[];
  rows: DatabaseRow[];
  onUpdateCell: (rowId: string, columnId: string, value: unknown) => void;
  onAddRow: () => void;
  onDeleteRow: (rowId: string) => void;
  onRenameColumn: (columnId: string, newName: string) => void;
  onDeleteColumn: (columnId: string) => void;
}

export function TableView({
  columns,
  rows,
  onUpdateCell,
  onAddRow,
  onDeleteRow,
  onRenameColumn,
  onDeleteColumn,
}: TableViewProps) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columnDefs = useMemo<ColumnDef<DatabaseRow>[]>(
    () => [
      ...columns.map<ColumnDef<DatabaseRow>>((col) => ({
        id: col.id,
        accessorFn: (row) => row.cells[col.id],
        header: ({ column }) => (
          <EditableHeaderCell
            column={col}
            onRename={(newName) => onRenameColumn(col.id, newName)}
            onDelete={() => onDeleteColumn(col.id)}
            sortDirection={column.getIsSorted()}
            onToggleSort={() => column.toggleSorting()}
          />
        ),
        cell: ({ row }) => (
          <CellRenderer
            column={col}
            value={row.original.cells[col.id]}
            onChange={(v) => onUpdateCell(row.original.id, col.id, v)}
          />
        ),
        sortingFn: col.type === "number" ? "basic" : "alphanumeric",
      })),
      {
        id: "_actions",
        header: () => null,
        cell: ({ row }) => (
          <button
            onClick={() => onDeleteRow(row.original.id)}
            className="rounded p-0.5 opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover/row:opacity-100"
            title="Delete row"
          >
            <IconTrash className="size-3" />
          </button>
        ),
        size: 32,
        enableSorting: false,
      },
    ],
    [columns, onUpdateCell, onDeleteRow, onRenameColumn, onDeleteColumn],
  );

  const table = useReactTable({
    data: rows,
    columns: columnDefs,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
    getRowId: (row) => row.id,
  });

  return (
    <div className="overflow-auto">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className="group border-r bg-muted/30 px-2 py-1.5 text-xs font-medium text-muted-foreground"
                  style={{ width: header.getSize() }}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id} className="group/row">
              {row.getVisibleCells().map((cell) => (
                <ShadTableCell key={cell.id} className="h-10 border-r p-0">
                  <div className="flex h-full items-center">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                </ShadTableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <button
        onClick={onAddRow}
        className="flex w-full items-center gap-1 border-y px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted/20"
      >
        <IconPlus className="size-3" />
        New row
      </button>
    </div>
  );
}
