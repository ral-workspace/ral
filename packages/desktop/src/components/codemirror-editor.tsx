import { useRef } from "react";
import { useCodeMirror } from "../hooks/use-codemirror";
import { EditorLoadingState, EditorErrorState } from "./common/editor-states";

interface CodeMirrorEditorProps {
  filePath: string;
}

export function CodeMirrorEditor({ filePath }: CodeMirrorEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { loading, error } = useCodeMirror({ filePath, containerRef });

  if (loading) {
    return <EditorLoadingState />;
  }

  if (error) {
    return <EditorErrorState detail={error} />;
  }

  return <div ref={containerRef} className="h-full" />;
}
