import {
  EditorView,
  GutterMarker,
  gutter,
} from "@codemirror/view";
import { StateField, StateEffect, RangeSet } from "@codemirror/state";

// --- Types ---

export interface DiffLine {
  line: number;
  kind: "added" | "modified" | "deleted";
}

// --- State effects & field ---

const setDiffMarkers = StateEffect.define<DiffLine[]>();

class DiffMarker extends GutterMarker {
  constructor(readonly kind: "added" | "modified" | "deleted") {
    super();
  }

  toDOM() {
    const el = document.createElement("div");
    el.className = `cm-diff-${this.kind}`;
    return el;
  }
}

const addedMarker = new DiffMarker("added");
const modifiedMarker = new DiffMarker("modified");
const deletedMarker = new DiffMarker("deleted");

function markerFor(kind: string): DiffMarker {
  if (kind === "added") return addedMarker;
  if (kind === "modified") return modifiedMarker;
  return deletedMarker;
}

const diffField = StateField.define<RangeSet<DiffMarker>>({
  create() {
    return RangeSet.empty;
  },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setDiffMarkers)) {
        const markers: { from: number; to: number; value: DiffMarker }[] = [];
        for (const d of e.value) {
          if (d.line < 1 || d.line > tr.state.doc.lines) continue;
          const pos = tr.state.doc.line(d.line).from;
          markers.push({ from: pos, to: pos, value: markerFor(d.kind) });
        }
        markers.sort((a, b) => a.from - b.from);
        return RangeSet.of(markers);
      }
    }
    return value;
  },
});

// --- Gutter ---

const diffGutter = gutter({
  class: "cm-diff-gutter",
  markers: (view) => view.state.field(diffField),
});

// --- Theme ---

const diffGutterTheme = EditorView.baseTheme({
  ".cm-diff-gutter": {
    width: "3px",
    marginRight: "2px",
  },
  ".cm-diff-gutter .cm-gutterElement": {
    padding: "0 !important",
  },
  ".cm-diff-added": {
    width: "3px",
    height: "100%",
    backgroundColor: "#2ea04370",
  },
  ".cm-diff-modified": {
    width: "3px",
    height: "100%",
    backgroundColor: "#0078d470",
  },
  ".cm-diff-deleted": {
    width: "3px",
    height: "100%",
    backgroundColor: "#f8514970",
    borderTop: "2px solid #f85149",
  },
});

// --- Public API ---

export function diffGutterExtension() {
  return [diffField, diffGutter, diffGutterTheme];
}

export function updateDiffMarkers(view: EditorView, lines: DiffLine[]) {
  view.dispatch({ effects: setDiffMarkers.of(lines) });
}
