import { useRef } from "react";
import { useCodeMirror } from "../hooks/use-codemirror";

interface CodeMirrorEditorProps {
  filePath: string;
}

export function CodeMirrorEditor({ filePath }: CodeMirrorEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { loading, error } = useCodeMirror({ filePath, containerRef });

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-xs text-muted-foreground">Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-xs text-destructive">{error}</span>
      </div>
    );
  }

  return <div ref={containerRef} className="h-full" />;
}
