import { useCallback, useEffect, useRef, useState } from "react";
import { EditorView } from "@codemirror/view";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ral/ui";
import { getActiveEditorView } from "../hooks/use-codemirror";

interface GoToLineProps {
  open: boolean;
  onClose: () => void;
}

export function GoToLine({ open, onClose }: GoToLineProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const goToLine = useCallback(() => {
    const lineNum = parseInt(value, 10);
    if (isNaN(lineNum) || lineNum < 1) return;

    const view = getActiveEditorView();
    if (!view) return;

    const maxLine = view.state.doc.lines;
    const targetLine = Math.min(lineNum, maxLine);
    const line = view.state.doc.line(targetLine);

    view.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: "center" }),
    });
    view.focus();
    onClose();
  }, [value, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        goToLine();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [goToLine, onClose],
  );

  const view = open ? getActiveEditorView() : null;
  const currentLine = view
    ? view.state.doc.lineAt(view.state.selection.main.head).number
    : null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogHeader className="sr-only">
        <DialogTitle>Go to Line</DialogTitle>
        <DialogDescription>Enter a line number to jump to</DialogDescription>
      </DialogHeader>
      <DialogContent className="overflow-hidden p-0" showCloseButton={false}>
        <div className="flex h-12 items-center gap-2 px-3">
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            className="flex h-10 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            placeholder={
              currentLine !== null
                ? `Go to line (current: ${currentLine}, max: ${view!.state.doc.lines})`
                : "Go to line..."
            }
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
