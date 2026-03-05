import { useState } from "react";
import { IconPlus, IconTable, IconLayoutKanban, IconCode } from "@tabler/icons-react";
import type { DatabaseView, ColumnType } from "../../types/database";
import { AddPropertyDialog } from "./add-property-dialog";

interface DatabaseToolbarProps {
  dbName: string;
  views: DatabaseView[];
  activeViewId: string;
  onSetActiveView: (viewId: string) => void;
  onAddColumn: (name: string, type: ColumnType) => void;
  onOpenAsCode: () => void;
}

export function DatabaseToolbar({
  dbName,
  views,
  activeViewId,
  onSetActiveView,
  onAddColumn,
  onOpenAsCode,
}: DatabaseToolbarProps) {
  const [showAddProperty, setShowAddProperty] = useState(false);

  return (
    <>
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <span className="text-sm font-medium">{dbName}</span>

        <div className="mx-2 h-4 w-px bg-border" />

        {/* View tabs */}
        <div className="flex items-center gap-1">
          {views.map((view) => (
            <button
              key={view.id}
              onClick={() => onSetActiveView(view.id)}
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
                view.id === activeViewId
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {view.type === "board" ? (
                <IconLayoutKanban className="size-3" />
              ) : (
                <IconTable className="size-3" />
              )}
              {view.name}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Add property */}
        <button
          onClick={() => setShowAddProperty(true)}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted/50"
        >
          <IconPlus className="size-3" />
          Property
        </button>

        <button
          onClick={onOpenAsCode}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted/50"
          title="Open as code"
        >
          <IconCode className="size-3" />
        </button>
      </div>

      {showAddProperty && (
        <AddPropertyDialog
          onAdd={onAddColumn}
          onClose={() => setShowAddProperty(false)}
        />
      )}
    </>
  );
}
