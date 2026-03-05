import { useEffect } from "react";
import { Spinner } from "@helm/ui";
import { useDatabaseStore } from "../../stores/database-store";
import { useEditorStore } from "../../stores";
import type { ColumnType } from "../../types/database";
import { DatabaseToolbar } from "./database-toolbar";
import { TableView } from "./table-view";
import { BoardView } from "./board-view";

interface DatabaseViewerProps {
  tabId: string;
  filePath: string;
}

export function DatabaseViewer({ tabId, filePath }: DatabaseViewerProps) {
  const doc = useDatabaseStore((s) => s.instances.get(tabId)?.doc ?? null);
  const loadDatabase = useDatabaseStore((s) => s.loadDatabase);
  const addRow = useDatabaseStore((s) => s.addRow);
  const addRowWithValue = useDatabaseStore((s) => s.addRowWithValue);
  const deleteRow = useDatabaseStore((s) => s.deleteRow);
  const updateCell = useDatabaseStore((s) => s.updateCell);
  const moveRow = useDatabaseStore((s) => s.moveRow);
  const addColumn = useDatabaseStore((s) => s.addColumn);
  const deleteColumn = useDatabaseStore((s) => s.deleteColumn);
  const setActiveView = useDatabaseStore((s) => s.setActiveView);
  const openFile = useEditorStore((s) => s.openFile);

  useEffect(() => {
    loadDatabase(tabId, filePath);
  }, [tabId, filePath, loadDatabase]);

  if (!doc) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
        <Spinner className="size-5" />
        <span className="text-sm">Loading…</span>
      </div>
    );
  }

  const activeView = doc.views.find((v) => v.id === doc.activeViewId) ?? doc.views[0];

  const handleAddColumn = (name: string, type: ColumnType) => {
    const id = name.toLowerCase().replace(/\s+/g, "_");
    addColumn(tabId, {
      id,
      name,
      type,
      ...(type === "select" ? { options: [] } : {}),
    });
  };

  return (
    <div className="flex h-full flex-col">
      <DatabaseToolbar
        dbName={doc.name}
        views={doc.views}
        activeViewId={doc.activeViewId}
        onSetActiveView={(viewId) => setActiveView(tabId, viewId)}
        onAddColumn={handleAddColumn}
        onOpenAsCode={() => openFile(filePath, true)}
      />
      <div className="flex-1 overflow-hidden">
        {activeView?.type === "board" ? (
          <BoardView
            columns={doc.schema}
            rows={doc.rows}
            groupByColumnId={activeView.groupBy ?? doc.schema[0]?.id ?? ""}
            onMoveRow={(rowId, colId, newVal) => moveRow(tabId, rowId, colId, newVal)}
            onUpdateCell={(rowId, colId, value) => updateCell(tabId, rowId, colId, value)}
            onAddRow={() => addRow(tabId)}
            onAddRowWithValue={(groupVal, titleColId, title) => {
              const groupColId = activeView.groupBy ?? doc.schema[0]?.id ?? "";
              addRowWithValue(tabId, groupVal, groupColId, titleColId, title);
            }}
            onDeleteRow={(rowId) => deleteRow(tabId, rowId)}
          />
        ) : (
          <TableView
            columns={doc.schema}
            rows={doc.rows}
            onUpdateCell={(rowId, colId, value) => updateCell(tabId, rowId, colId, value)}
            onAddRow={() => addRow(tabId)}
            onDeleteRow={(rowId) => deleteRow(tabId, rowId)}
            onDeleteColumn={(colId) => deleteColumn(tabId, colId)}
          />
        )}
      </div>
    </div>
  );
}
