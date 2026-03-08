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
import "./blocknote-theme.css";

interface MarkdownEditorProps {
  filePath: string;
}

export function MarkdownEditor({ filePath }: MarkdownEditorProps) {
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const readyRef = useRef(false);
  const { resolvedTheme } = useTheme();
  const openFile = useEditorStore((s) => s.openFile);

  const fileName = filePath.split("/").pop() ?? "Untitled";

  const editor = useCreateBlockNote();

  /** Strip trailing empty paragraph blocks before exporting to Markdown. */
  const exportMarkdown = () => {
    const blocks = editor.document;
    // Find last non-empty block
    let lastContentIdx = blocks.length - 1;
    while (lastContentIdx >= 0) {
      const block = blocks[lastContentIdx];
      const isEmpty =
        block.type === "paragraph" &&
        Array.isArray(block.content) &&
        block.content.length === 0 &&
        (!block.children || block.children.length === 0);
      if (!isEmpty) break;
      lastContentIdx--;
    }
    const trimmedBlocks = blocks.slice(0, lastContentIdx + 1);
    return editor.blocksToMarkdownLossy(
      trimmedBlocks.length > 0 ? trimmedBlocks : blocks,
    );
  };

  // Load file content on mount
  useEffect(() => {
    let cancelled = false;
    readyRef.current = false;
    invoke<string>("read_file", { path: filePath })
      .then((md) => {
        if (cancelled) return;
        const blocks = editor.tryParseMarkdownToBlocks(md);
        editor.replaceBlocks(editor.document, blocks);
        // Mark ready after a tick so the initial onChange from replaceBlocks is ignored
        requestAnimationFrame(() => {
          readyRef.current = true;
        });
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filePath, editor]);

  const saveMarkdown = () => {
    const md = exportMarkdown();
    invoke("write_file", { path: filePath, content: md })
      .then(() => {
        useEditorStore.getState().markClean(filePath);
      })
      .catch((e) => console.error("Failed to save markdown:", e));
  };

  // Auto-save on change (skip initial onChange fired by replaceBlocks)
  const handleChange = () => {
    if (!readyRef.current) return;
    useEditorStore.getState().markDirty(filePath);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(saveMarkdown, 1000);
  };

  // Cmd+S immediate save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (debounceRef.current) clearTimeout(debounceRef.current);
        saveMarkdown();
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
          sideMenu={false}
        />
      </div>
    </div>
  );
}
