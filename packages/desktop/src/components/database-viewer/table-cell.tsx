import { useCallback, useEffect, useRef, useState } from "react";
import type { ColumnSchema } from "../../types/database";

interface CellRendererProps {
  column: ColumnSchema;
  value: unknown;
  onChange: (value: unknown) => void;
}

export function CellRenderer({ column, value, onChange }: CellRendererProps) {
  switch (column.type) {
    case "checkbox":
      return (
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          className="ml-2 size-3.5 accent-primary"
        />
      );

    case "select":
      return (
        <select
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className="h-full w-full bg-transparent px-2 text-xs outline-none"
        >
          <option value="">—</option>
          {column.options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );

    case "number":
      return (
        <EditableText
          value={value != null ? String(value) : ""}
          onChange={(v) => onChange(v ? Number(v) : null)}
          inputType="number"
        />
      );

    case "date":
      return (
        <input
          type="date"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className="h-full w-full bg-transparent px-2 text-xs outline-none"
        />
      );

    default:
      return (
        <EditableText
          value={String(value ?? "")}
          onChange={onChange}
        />
      );
  }
}

function EditableText({
  value,
  onChange,
  inputType = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  inputType?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = useCallback(() => {
    setEditing(false);
    if (draft !== value) onChange(draft);
  }, [draft, value, onChange]);

  if (!editing) {
    return (
      <span
        className="flex h-full w-full cursor-text items-center px-2 text-xs"
        onDoubleClick={() => setEditing(true)}
      >
        {value || "\u00A0"}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      type={inputType}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
      className="h-full w-full bg-transparent px-2 text-xs outline-none ring-1 ring-inset ring-primary/50"
    />
  );
}
