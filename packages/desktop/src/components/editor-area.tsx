import { cn, FlickeringGrid, ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@helm/ui";
import { useEditorStore } from "../stores";
import type { SplitNode } from "../types/editor";
import { EditorPane } from "./editor-pane";

interface EditorAreaProps {
  className?: string;
}

function SplitNodeView({ node }: { node: SplitNode }) {
  if (node.type === "leaf") {
    return <EditorPane groupId={node.groupId} className="h-full" />;
  }

  return (
    <ResizablePanelGroup orientation={node.direction}>
      {node.children.map((child, i) => (
        <SplitNodePanel key={i} child={child} index={i} total={node.children.length} />
      ))}
    </ResizablePanelGroup>
  );
}

function SplitNodePanel({ child, index, total }: { child: SplitNode; index: number; total: number }) {
  return (
    <>
      {index > 0 && <ResizableHandle />}
      <ResizablePanel defaultSize={`${100 / total}%`} minSize="10%">
        <SplitNodeView node={child} />
      </ResizablePanel>
    </>
  );
}

export function EditorArea({ className }: EditorAreaProps) {
  const splitRoot = useEditorStore((s) => s.splitRoot);
  const hasAnyTabs = useEditorStore((s) => {
    for (const group of s.groups.values()) {
      if (group.openTabs.length > 0) return true;
    }
    return false;
  });

  if (!hasAnyTabs) {
    return (
      <div className={cn("relative flex h-full flex-col bg-background", className)}>
        <FlickeringGrid
          className="absolute inset-0 z-0"
          style={{ maskImage: "linear-gradient(to bottom, transparent 0%, black 66%)" }}
          squareSize={4}
          gridGap={6}
          color="rgb(96, 165, 250)"
          maxOpacity={0.15}
          flickerChance={0.1}
        />
        <div className="relative z-10 flex flex-1 items-center justify-center">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-semibold text-foreground/80">Helm</h2>
            <p className="text-sm text-muted-foreground">
              Open a file or start a conversation
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex h-full flex-col bg-background", className)}>
      <SplitNodeView node={splitRoot} />
    </div>
  );
}
