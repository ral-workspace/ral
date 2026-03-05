export type ColumnType = "text" | "number" | "select" | "checkbox" | "date";

export interface ColumnSchema {
  id: string;
  name: string;
  type: ColumnType;
  options?: string[]; // for "select" type
}

export interface DatabaseRow {
  id: string;
  cells: Record<string, unknown>;
}

export interface DatabaseView {
  id: string;
  name: string;
  type: "table" | "board";
  groupBy?: string; // column id for board view
}

export interface DatabaseDocument {
  name: string;
  schema: ColumnSchema[];
  rows: DatabaseRow[];
  views: DatabaseView[];
  activeViewId: string;
}
