import { useRef, useEffect } from "react";
import { MergeView } from "@codemirror/merge";
import { EditorView } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
} from "@codemirror/language";
import { useTheme } from "next-themes";
import { getLanguageExtension } from "../lib/detect-language";
import { buildEditorTheme, resolveEditorTheme } from "../hooks/use-codemirror";
import { useSettingsStore, useDiffStore } from "../stores";

interface DiffEditorProps {
  tabId: string;
}

export function DiffEditor({ tabId }: DiffEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mergeViewRef = useRef<MergeView | null>(null);
  const compartmentsRef = useRef({
    themeA: new Compartment(),
    themeB: new Compartment(),
    editorThemeA: new Compartment(),
    editorThemeB: new Compartment(),
  });
  const settings = useSettingsStore((s) => s.settings);
  const { resolvedTheme } = useTheme();
  const diffData = useDiffStore((s) => s.diffs.get(tabId));

  // Create / destroy MergeView
  useEffect(() => {
    if (!containerRef.current || !diffData) return;

    const c = compartmentsRef.current;
    const langExt = getLanguageExtension(diffData.path);

    const sharedExtensions = (
      themeCompartment: Compartment,
      editorThemeCompartment: Compartment,
    ) => [
      themeCompartment.of(buildEditorTheme(settings)),
      editorThemeCompartment.of(resolveEditorTheme(settings, resolvedTheme)),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      EditorState.tabSize.of(settings["editor.tabSize"]),
      EditorView.editable.of(false),
      EditorState.readOnly.of(true),
      ...(langExt ? [langExt] : []),
    ];

    const view = new MergeView({
      a: {
        doc: diffData.oldText,
        extensions: sharedExtensions(c.themeA, c.editorThemeA),
      },
      b: {
        doc: diffData.newText,
        extensions: sharedExtensions(c.themeB, c.editorThemeB),
      },
      parent: containerRef.current,
      collapseUnchanged: { margin: 3, minSize: 4 },
    });

    mergeViewRef.current = view;

    return () => {
      view.destroy();
      mergeViewRef.current = null;
    };
  }, [diffData?.path, diffData?.oldText, diffData?.newText]);

  // Reconfigure on settings/theme change
  useEffect(() => {
    const view = mergeViewRef.current;
    if (!view) return;

    const c = compartmentsRef.current;
    const theme = buildEditorTheme(settings);
    const editorTheme = resolveEditorTheme(settings, resolvedTheme);

    view.a.dispatch({
      effects: [
        c.themeA.reconfigure(theme),
        c.editorThemeA.reconfigure(editorTheme),
      ],
    });
    view.b.dispatch({
      effects: [
        c.themeB.reconfigure(theme),
        c.editorThemeB.reconfigure(editorTheme),
      ],
    });
  }, [settings, resolvedTheme]);

  if (!diffData) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Diff data not available
      </div>
    );
  }

  return <div ref={containerRef} className="h-full overflow-auto" />;
}
