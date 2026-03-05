import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import yaml from "js-yaml";
import type {
  DatabaseDocument,
  DatabaseRow,
  ColumnSchema,
  DatabaseView,
} from "../types/database";

interface DatabaseInstance {
  filePath: string;
  doc: DatabaseDocument;
  dirty: boolean;
}

interface DatabaseState {
  instances: Map<string, DatabaseInstance>;

  loadDatabase: (tabId: string, filePath: string) => Promise<void>;
  removeDatabase: (tabId: string) => void;
  getDoc: (tabId: string) => DatabaseDocument | null;

  // Row operations
  addRow: (tabId: string) => void;
  addRowWithValue: (
    tabId: string,
    groupColumnValue: string,
    groupColumnId: string,
    titleColumnId: string,
    title: string,
  ) => void;
  deleteRow: (tabId: string, rowId: string) => void;
  updateCell: (
    tabId: string,
    rowId: string,
    columnId: string,
    value: unknown,
  ) => void;
  moveRow: (
    tabId: string,
    rowId: string,
    columnId: string,
    newValue: string,
  ) => void;

  // Schema operations
  addColumn: (tabId: string, column: ColumnSchema) => void;
  renameColumn: (tabId: string, columnId: string, newName: string) => void;
  deleteColumn: (tabId: string, columnId: string) => void;

  // View operations
  setActiveView: (tabId: string, viewId: string) => void;
  addView: (tabId: string, view: DatabaseView) => void;

  // Persistence
  saveDatabase: (tabId: string) => Promise<void>;
}

let saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleSave(tabId: string) {
  const existing = saveTimers.get(tabId);
  if (existing) clearTimeout(existing);
  saveTimers.set(
    tabId,
    setTimeout(() => {
      saveTimers.delete(tabId);
      useDatabaseStore.getState().saveDatabase(tabId);
    }, 500),
  );
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function updateInstance(
  instances: Map<string, DatabaseInstance>,
  tabId: string,
  updater: (inst: DatabaseInstance) => DatabaseInstance,
): Map<string, DatabaseInstance> {
  const inst = instances.get(tabId);
  if (!inst) return instances;
  const next = new Map(instances);
  next.set(tabId, updater(inst));
  return next;
}

export const useDatabaseStore = create<DatabaseState>((set, get) => ({
  instances: new Map(),

  loadDatabase: async (tabId, filePath) => {
    try {
      const content = await invoke<string>("read_file", { path: filePath });
      const doc = yaml.load(content) as DatabaseDocument;

      // Ensure required fields
      if (!doc.schema) doc.schema = [];
      if (!doc.rows) doc.rows = [];
      if (!doc.views)
        doc.views = [{ id: "v1", name: "Table", type: "table" }];
      if (!doc.activeViewId) doc.activeViewId = doc.views[0]?.id ?? "v1";
      if (!doc.name) doc.name = "Untitled";

      const next = new Map(get().instances);
      next.set(tabId, { filePath, doc, dirty: false });
      set({ instances: next });
    } catch {
      // File doesn't exist or is empty — create default
      const doc: DatabaseDocument = {
        name: "Untitled",
        schema: [{ id: "title", name: "Title", type: "text" }],
        rows: [],
        views: [{ id: "v1", name: "Table", type: "table" }],
        activeViewId: "v1",
      };
      const next = new Map(get().instances);
      next.set(tabId, { filePath, doc, dirty: true });
      set({ instances: next });
      scheduleSave(tabId);
    }
  },

  removeDatabase: (tabId) => {
    const timer = saveTimers.get(tabId);
    if (timer) {
      clearTimeout(timer);
      saveTimers.delete(tabId);
    }
    const next = new Map(get().instances);
    next.delete(tabId);
    set({ instances: next });
  },

  getDoc: (tabId) => {
    return get().instances.get(tabId)?.doc ?? null;
  },

  addRow: (tabId) => {
    set({
      instances: updateInstance(get().instances, tabId, (inst) => {
        const newRow: DatabaseRow = {
          id: generateId(),
          cells: {},
        };
        return {
          ...inst,
          dirty: true,
          doc: { ...inst.doc, rows: [...inst.doc.rows, newRow] },
        };
      }),
    });
    scheduleSave(tabId);
  },

  addRowWithValue: (tabId, groupColumnValue, groupColumnId, titleColumnId, title) => {
    set({
      instances: updateInstance(get().instances, tabId, (inst) => {
        const newRow: DatabaseRow = {
          id: generateId(),
          cells: {
            [groupColumnId]: groupColumnValue,
            [titleColumnId]: title,
          },
        };
        return {
          ...inst,
          dirty: true,
          doc: { ...inst.doc, rows: [...inst.doc.rows, newRow] },
        };
      }),
    });
    scheduleSave(tabId);
  },

  deleteRow: (tabId, rowId) => {
    set({
      instances: updateInstance(get().instances, tabId, (inst) => ({
        ...inst,
        dirty: true,
        doc: {
          ...inst.doc,
          rows: inst.doc.rows.filter((r) => r.id !== rowId),
        },
      })),
    });
    scheduleSave(tabId);
  },

  updateCell: (tabId, rowId, columnId, value) => {
    set({
      instances: updateInstance(get().instances, tabId, (inst) => ({
        ...inst,
        dirty: true,
        doc: {
          ...inst.doc,
          rows: inst.doc.rows.map((r) =>
            r.id === rowId
              ? { ...r, cells: { ...r.cells, [columnId]: value } }
              : r,
          ),
        },
      })),
    });
    scheduleSave(tabId);
  },

  moveRow: (tabId, rowId, columnId, newValue) => {
    set({
      instances: updateInstance(get().instances, tabId, (inst) => ({
        ...inst,
        dirty: true,
        doc: {
          ...inst.doc,
          rows: inst.doc.rows.map((r) =>
            r.id === rowId
              ? { ...r, cells: { ...r.cells, [columnId]: newValue } }
              : r,
          ),
        },
      })),
    });
    scheduleSave(tabId);
  },

  addColumn: (tabId, column) => {
    set({
      instances: updateInstance(get().instances, tabId, (inst) => ({
        ...inst,
        dirty: true,
        doc: {
          ...inst.doc,
          schema: [...inst.doc.schema, column],
        },
      })),
    });
    scheduleSave(tabId);
  },

  renameColumn: (tabId, columnId, newName) => {
    set({
      instances: updateInstance(get().instances, tabId, (inst) => ({
        ...inst,
        dirty: true,
        doc: {
          ...inst.doc,
          schema: inst.doc.schema.map((c) =>
            c.id === columnId ? { ...c, name: newName } : c,
          ),
        },
      })),
    });
    scheduleSave(tabId);
  },

  deleteColumn: (tabId, columnId) => {
    set({
      instances: updateInstance(get().instances, tabId, (inst) => ({
        ...inst,
        dirty: true,
        doc: {
          ...inst.doc,
          schema: inst.doc.schema.filter((c) => c.id !== columnId),
          rows: inst.doc.rows.map((r) => {
            const cells = { ...r.cells };
            delete cells[columnId];
            return { ...r, cells };
          }),
        },
      })),
    });
    scheduleSave(tabId);
  },

  setActiveView: (tabId, viewId) => {
    set({
      instances: updateInstance(get().instances, tabId, (inst) => ({
        ...inst,
        dirty: true,
        doc: { ...inst.doc, activeViewId: viewId },
      })),
    });
    scheduleSave(tabId);
  },

  addView: (tabId, view) => {
    set({
      instances: updateInstance(get().instances, tabId, (inst) => ({
        ...inst,
        dirty: true,
        doc: {
          ...inst.doc,
          views: [...inst.doc.views, view],
          activeViewId: view.id,
        },
      })),
    });
    scheduleSave(tabId);
  },

  saveDatabase: async (tabId) => {
    const inst = get().instances.get(tabId);
    if (!inst || !inst.dirty) return;

    const content = yaml.dump(inst.doc, { lineWidth: -1 });
    try {
      await invoke("write_file", { path: inst.filePath, content });
      set({
        instances: updateInstance(get().instances, tabId, (i) => ({
          ...i,
          dirty: false,
        })),
      });
    } catch (e) {
      console.error("Failed to save database:", e);
    }
  },
}));
