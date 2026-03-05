import { useCallback, useEffect, useRef, useState } from "react";
import type { ColumnSchema } from "../../types/database";

interface TableCellProps {
  column: ColumnSchema;
  value: unknown;
  onChange: (value: unknown) => void;
}

export function TableCell({ column, value, onChange }: TableCellProps) {
  switch (column.type) {
    case "checkbox":
      return (
        <td className="border-b border-r px-2 py-1">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            className="size-3.5 accent-primary"
          />
        </td>
      );

    case "select":
      return (
        <td className="border-b border-r px-2 py-1">
          <select
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-transparent text-xs outline-none"
          >
            <option value="">—</option>
            {column.options?.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </td>
      );

    case "number":
      return (
        <td className="border-b border-r px-2 py-1">
          <EditableText
            value={value != null ? String(value) : ""}
            onChange={(v) => onChange(v ? Number(v) : null)}
            inputType="number"
          />
        </td>
      );

    case "date":
      return (
        <td className="border-b border-r px-2 py-1">
          <input
            type="date"
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-transparent text-xs outline-none"
          />
        </td>
      );

    default:
      return (
        <td className="border-b border-r px-2 py-1">
          <EditableText
            value={String(value ?? "")}
            onChange={onChange}
          />
        </td>
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
        className="block min-h-[1.25rem] w-full cursor-text text-xs"
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
      className="w-full bg-transparent text-xs outline-none ring-1 ring-primary/50 rounded px-0.5"
    />
  );
}
