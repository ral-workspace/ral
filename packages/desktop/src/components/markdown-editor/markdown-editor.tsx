import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTheme } from "next-themes";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { Spinner } from "@helm/ui";
import { useEditorStore } from "../../stores";
import { MarkdownToolbar } from "./markdown-toolbar";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/shadcn/style.css";

interface MarkdownEditorProps {
  filePath: string;
}

export function MarkdownEditor({ filePath }: MarkdownEditorProps) {
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { resolvedTheme } = useTheme();
  const openFile = useEditorStore((s) => s.openFile);

  const fileName = filePath.split("/").pop() ?? "Untitled";

  const editor = useCreateBlockNote();

  // Load file content on mount
  useEffect(() => {
    let cancelled = false;
    invoke<string>("read_file", { path: filePath })
      .then((md) => {
        if (cancelled) return;
        const blocks = editor.tryParseMarkdownToBlocks(md);
        editor.replaceBlocks(editor.document, blocks);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filePath, editor]);

  // Auto-save on change
  const handleChange = () => {
    useEditorStore.getState().markDirty(filePath);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const md = editor.blocksToMarkdownLossy(editor.document);
      invoke("write_file", { path: filePath, content: md })
        .then(() => {
          useEditorStore.getState().markClean(filePath);
        })
        .catch((e) => console.error("Failed to save markdown:", e));
    }, 1000);
  };

  // Cmd+S immediate save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (debounceRef.current) clearTimeout(debounceRef.current);
        const md = editor.blocksToMarkdownLossy(editor.document);
        invoke("write_file", { path: filePath, content: md })
          .then(() => {
            useEditorStore.getState().markClean(filePath);
          })
          .catch((e) => console.error("Failed to save markdown:", e));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filePath, editor]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
        <Spinner className="size-5" />
        <span className="text-sm">Loading...</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <MarkdownToolbar
        fileName={fileName}
        onOpenAsCode={() => openFile(filePath, true)}
      />
      <div className="flex-1 overflow-auto">
        <BlockNoteView
          editor={editor}
          onChange={handleChange}
          theme={resolvedTheme === "light" ? "light" : "dark"}
        />
      </div>
    </div>
  );
}
