import { useState } from "react";
import type { ColumnType } from "../../types/database";

interface AddPropertyDialogProps {
  onAdd: (name: string, type: ColumnType) => void;
  onClose: () => void;
}

const COLUMN_TYPES: { value: ColumnType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Select" },
  { value: "checkbox", label: "Checkbox" },
  { value: "date", label: "Date" },
];

export function AddPropertyDialog({ onAdd, onClose }: AddPropertyDialogProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<ColumnType>("text");

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed, type);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-72 rounded-lg border bg-background p-4 shadow-lg">
        <h3 className="mb-3 text-sm font-medium">Add Property</h3>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Name
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
                if (e.key === "Escape") onClose();
              }}
              className="w-full rounded border bg-transparent px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary/50"
              placeholder="Column name"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as ColumnType)}
              className="w-full rounded border bg-transparent px-2 py-1 text-sm outline-none"
            >
              {COLUMN_TYPES.map((ct) => (
                <option key={ct.value} value={ct.value}>
                  {ct.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded px-3 py-1 text-xs hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!name.trim()}
              className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
