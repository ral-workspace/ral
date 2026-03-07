import { useRef, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  EditorView,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
} from "@codemirror/view";
import { Compartment, EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  foldGutter,
  bracketMatching,
} from "@codemirror/language";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  dracula,
  solarizedLight,
  cobalt,
  coolGlow,
  espresso,
  rosePineDawn,
  ayuLight,
  tomorrow,
} from "thememirror";
import { useTheme } from "next-themes";
import { getLanguageExtension } from "../lib/detect-language";
import { resolveEditorLineHeight } from "../settings";
import { useSettingsStore, useEditorStore } from "../stores";
import type { Settings } from "../settings";

// --- Theme map ---

const EDITOR_THEMES: Record<string, import("@codemirror/state").Extension> = {
  oneDark,
  dracula,
  cobalt,
  coolGlow,
  espresso,
  tomorrow,
  solarizedLight,
  ayuLight,
  rosePineDawn,
};

// --- Helpers ---

export function resolveEditorTheme(
  settings: Settings,
  resolvedColorTheme: string | undefined,
) {
  const isDark = resolvedColorTheme !== "light";
  const themeName = isDark
    ? settings["editor.darkTheme"]
    : settings["editor.lightTheme"];
  return EDITOR_THEMES[themeName] ?? oneDark;
}

export function buildEditorTheme(settings: Settings) {
  const lineHeight = resolveEditorLineHeight(settings);
  return EditorView.theme({
    "&": {
      height: "100%",
      fontSize: `${settings["editor.fontSize"]}px`,
      fontFamily: settings["editor.fontFamily"],
      fontWeight: settings["editor.fontWeight"],
      letterSpacing: `${settings["editor.letterSpacing"]}px`,
    },
    ".cm-content": {
      lineHeight: `${lineHeight}px`,
    },
    ".cm-gutters": {
      fontSize: `${settings["editor.fontSize"]}px`,
    },
    ".cm-scroller": {
      overflow: "auto",
    },
  });
}

function buildLineNumbersExt(settings: Settings) {
  if (settings["editor.lineNumbers"] === "off") return [];
  if (settings["editor.lineNumbers"] === "relative") {
    return [
      lineNumbers({
        formatNumber: (n, state) => {
          const cursorLine = state.doc.lineAt(
            state.selection.main.head,
          ).number;
          return n === cursorLine
            ? String(n)
            : String(Math.abs(n - cursorLine));
        },
      }),
    ];
  }
  return [lineNumbers()];
}

function buildHighlightLineExt(settings: Settings) {
  const mode = settings["editor.renderLineHighlight"];
  if (mode === "none") return [];
  if (mode === "gutter") return [highlightActiveLineGutter()];
  if (mode === "line") return [highlightActiveLine()];
  return [highlightActiveLine(), highlightActiveLineGutter()];
}

// --- Compartments per instance ---

function createCompartments() {
  return {
    theme: new Compartment(),
    lineNumbers: new Compartment(),
    bracketMatching: new Compartment(),
    lineWrapping: new Compartment(),
    highlightLine: new Compartment(),
    tabSize: new Compartment(),
    editorTheme: new Compartment(),
  };
}

// --- Active editor view (module-level, for external access) ---

let activeEditorView: EditorView | null = null;

export function getActiveEditorView(): EditorView | null {
  return activeEditorView;
}

// --- Buffer cache ---

const bufferCache = new Map<string, EditorState>();

export function invalidateBufferCache(path: string) {
  bufferCache.delete(path);
}

export function clearBufferCache() {
  bufferCache.clear();
}

// --- Hook ---

interface UseCodeMirrorOptions {
  filePath: string | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

interface UseCodeMirrorReturn {
  loading: boolean;
  error: string | null;
}

export function useCodeMirror({
  filePath,
  containerRef,
}: UseCodeMirrorOptions): UseCodeMirrorReturn {
  const settings = useSettingsStore((s) => s.settings);
  const { resolvedTheme } = useTheme();
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const editorViewRef = useRef<EditorView | null>(null);
  const compartmentsRef = useRef(createCompartments());
  const prevFilePathRef = useRef<string | null>(null);

  // Build extensions (used for both fresh creation and cache miss)
  const buildExtensions = (path: string) => {
    const c = compartmentsRef.current;
    const extensions = [
      c.theme.of(buildEditorTheme(settings)),
      c.lineNumbers.of(buildLineNumbersExt(settings)),
      c.highlightLine.of(buildHighlightLineExt(settings)),
      c.bracketMatching.of(
        settings["editor.bracketMatching"] ? bracketMatching() : [],
      ),
      c.lineWrapping.of(
        settings["editor.wordWrap"] === "on" ? EditorView.lineWrapping : [],
      ),
      foldGutter(),
      history(),
      keymap.of([
        {
          key: "Mod-s",
          run: () => {
            const view = editorViewRef.current;
            if (!view) return false;
            const doc = view.state.doc.toString();
            invoke("write_file", { path, content: doc })
              .then(() => useEditorStore.getState().markClean(path))
              .catch((err) => console.error("Save failed:", err));
            return true;
          },
        },
        ...defaultKeymap,
        ...historyKeymap,
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          useEditorStore.getState().markDirty(path);
        }
      }),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      c.editorTheme.of(resolveEditorTheme(settings, resolvedTheme)),
      c.tabSize.of(EditorState.tabSize.of(settings["editor.tabSize"])),
    ];

    const langExt = getLanguageExtension(path);
    if (langExt) extensions.push(langExt);
    return extensions;
  };

  // Load file content (skip if cached)
  useEffect(() => {
    if (!filePath) {
      setContent(null);
      setError(null);
      setLoading(false);
      return;
    }

    // If we have a cached state, skip fetching
    if (bufferCache.has(filePath)) {
      setContent("__cached__");
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setContent(null);

    invoke<string>("read_file", { path: filePath })
      .then((result) => {
        if (!cancelled) setContent(result);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filePath]);

  // Create / restore CodeMirror editor
  useEffect(() => {
    // Save current editor state to cache before switching
    if (editorViewRef.current && prevFilePathRef.current) {
      bufferCache.set(prevFilePathRef.current, editorViewRef.current.state);
    }

    if (editorViewRef.current) {
      editorViewRef.current.destroy();
      editorViewRef.current = null;
    }

    if (!containerRef.current || content === null || !filePath) {
      prevFilePathRef.current = null;
      return;
    }

    prevFilePathRef.current = filePath;

    // Try restoring from cache
    const cachedState = bufferCache.get(filePath);
    let state: EditorState;

    if (cachedState) {
      // Re-create compartments and state with cached doc + selection but current extensions
      compartmentsRef.current = createCompartments();
      state = EditorState.create({
        doc: cachedState.doc,
        selection: cachedState.selection,
        extensions: buildExtensions(filePath),
      });
    } else if (content !== "__cached__") {
      compartmentsRef.current = createCompartments();
      state = EditorState.create({
        doc: content,
        extensions: buildExtensions(filePath),
      });
    } else {
      // Cache was invalidated after content was set to "__cached__"
      // Re-fetch the file
      prevFilePathRef.current = null;
      setContent(null);
      invoke<string>("read_file", { path: filePath })
        .then((result) => setContent(result))
        .catch((err) => setError(String(err)));
      return;
    }

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    editorViewRef.current = view;
    activeEditorView = view;

    return () => {
      // Save state on cleanup (unmount)
      if (editorViewRef.current && filePath) {
        bufferCache.set(filePath, editorViewRef.current.state);
      }
      view.destroy();
      editorViewRef.current = null;
      if (activeEditorView === view) activeEditorView = null;
    };
  }, [content, filePath]);

  // Reconfigure on settings change
  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;

    const c = compartmentsRef.current;

    view.dispatch({
      effects: [
        c.theme.reconfigure(buildEditorTheme(settings)),
        c.lineNumbers.reconfigure(buildLineNumbersExt(settings)),
        c.highlightLine.reconfigure(buildHighlightLineExt(settings)),
        c.bracketMatching.reconfigure(
          settings["editor.bracketMatching"] ? bracketMatching() : [],
        ),
        c.lineWrapping.reconfigure(
          settings["editor.wordWrap"] === "on" ? EditorView.lineWrapping : [],
        ),
        c.tabSize.reconfigure(
          EditorState.tabSize.of(settings["editor.tabSize"]),
        ),
        c.editorTheme.reconfigure(
          resolveEditorTheme(settings, resolvedTheme),
        ),
      ],
    });
  }, [settings, resolvedTheme]);

  return { loading, error };
}
