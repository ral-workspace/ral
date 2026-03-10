import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ral/ui";
import { syntaxTree } from "@codemirror/language";
import type { EditorView } from "@codemirror/view";
import { useWorkspaceStore, useEditorStore } from "../stores";
import { FileIcon, FolderIcon } from "./file-icon";
import { getActiveEditorView, subscribeToEditorUpdates } from "../hooks/use-codemirror";

interface DirEntry {
  name: string;
  path: string;
  is_directory: boolean;
}

interface EditorBreadcrumbProps {
  filePath: string;
}

// --- Symbol extraction from Lezer syntax tree ---

interface SymbolInfo {
  name: string;
  kind: string;
}

const SYMBOL_NODE_TYPES = new Set([
  // JS/TS
  "FunctionDeclaration",
  "MethodDeclaration",
  "ClassDeclaration",
  "ArrowFunction",
  "FunctionExpression",
  // Rust
  "FunctionItem",
  "ImplItem",
  "StructItem",
  "EnumItem",
  "TraitItem",
  // Python
  "FunctionDefinition",
  "ClassDefinition",
  // Go
  "FunctionDecl",
  "MethodDecl",
  "TypeDecl",
  // Java/C++
  "ClassSpecifier",
  "FunctionDefinition",
]);

function getSymbolName(view: EditorView, nodeFrom: number, nodeTo: number, nodeType: string): string | null {
  const doc = view.state.doc;

  // For variable declarations with arrow functions, get the variable name
  if (nodeType === "ArrowFunction" || nodeType === "FunctionExpression") {
    const tree = syntaxTree(view.state);
    const parent = tree.resolveInner(nodeFrom, -1);
    if (parent && (parent.name === "VariableDeclarator" || parent.name === "VariableDefinition")) {
      const nameNode = parent.getChild("VariableDefinition") ?? parent.firstChild;
      if (nameNode) {
        return doc.sliceString(nameNode.from, nameNode.to);
      }
    }
    return null;
  }

  // Find name node within the declaration
  const tree = syntaxTree(view.state);
  const node = tree.resolve(nodeFrom, 1);
  if (!node) return null;

  // Try common name child types
  for (const childName of ["VariableDefinition", "PropertyDefinition", "Definition", "TypeName", "Name"]) {
    const nameChild = node.getChild(childName);
    if (nameChild) {
      return doc.sliceString(nameChild.from, nameChild.to);
    }
  }

  // Fallback: first word after the keyword
  const text = doc.sliceString(nodeFrom, Math.min(nodeTo, nodeFrom + 200));
  const match = text.match(/(?:function|class|fn|impl|struct|enum|trait|def|func|type)\s+(\w+)/);
  return match ? match[1] : null;
}

function getSymbolsAtCursor(view: EditorView): SymbolInfo[] {
  const pos = view.state.selection.main.head;
  const tree = syntaxTree(view.state);
  const symbols: SymbolInfo[] = [];

  let cursor = tree.resolveInner(pos, -1);
  while (cursor) {
    if (SYMBOL_NODE_TYPES.has(cursor.name)) {
      const name = getSymbolName(view, cursor.from, cursor.to, cursor.name);
      if (name) {
        symbols.unshift({ name, kind: cursor.name });
      }
    }
    if (cursor.parent) {
      cursor = cursor.parent;
    } else {
      break;
    }
  }

  return symbols;
}

// --- Breadcrumb dropdown ---

function BreadcrumbDropdown({
  dirPath,
  children,
}: {
  dirPath: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const openFile = useEditorStore((s) => s.openFile);

  useEffect(() => {
    if (!open) return;
    invoke<DirEntry[]>("read_dir", { path: dirPath })
      .then((result) => {
        const sorted = [...result].sort((a, b) => {
          if (a.is_directory !== b.is_directory) return a.is_directory ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        setEntries(sorted);
      })
      .catch(() => setEntries([]));
  }, [open, dirPath]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={2}
        className="max-h-64 w-56 overflow-y-auto p-1"
      >
        {entries.map((entry) => (
          <button
            key={entry.path}
            className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs hover:bg-accent"
            onClick={() => {
              if (!entry.is_directory) {
                openFile(entry.path, false);
              }
              setOpen(false);
            }}
          >
            {entry.is_directory ? (
              <FolderIcon
                folderName={entry.name}
                expanded={false}
                className="size-3.5 shrink-0"
              />
            ) : (
              <FileIcon fileName={entry.name} className="size-3.5 shrink-0" />
            )}
            <span className="truncate">{entry.name}</span>
          </button>
        ))}
        {entries.length === 0 && (
          <div className="px-2 py-1 text-xs text-muted-foreground">Empty</div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// --- Breadcrumb symbol display ---

function useSymbolsAtCursor(filePath: string): SymbolInfo[] {
  const [symbols, setSymbols] = useState<SymbolInfo[]>([]);

  const updateSymbols = useCallback(() => {
    const view = getActiveEditorView();
    if (!view) {
      setSymbols([]);
      return;
    }
    const newSymbols = getSymbolsAtCursor(view);
    setSymbols((prev) => {
      if (prev.length === newSymbols.length && prev.every((s, i) => s.name === newSymbols[i].name)) {
        return prev;
      }
      return newSymbols;
    });
  }, []);

  useEffect(() => {
    // Initial read (deferred to allow EditorView to initialize)
    const timer = setTimeout(updateSymbols, 100);

    // Subscribe to cursor/document changes with RAF throttle
    let rafId = 0;
    const unsub = subscribeToEditorUpdates(() => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        updateSymbols();
      });
    });

    return () => {
      clearTimeout(timer);
      if (rafId) cancelAnimationFrame(rafId);
      unsub();
    };
  }, [filePath, updateSymbols]);

  return symbols;
}

// --- Main component ---

export function EditorBreadcrumb({ filePath }: EditorBreadcrumbProps) {
  const projectPath = useWorkspaceStore((s) => s.projectPath);
  const symbols = useSymbolsAtCursor(filePath);

  const relativePath =
    projectPath && filePath.startsWith(projectPath)
      ? filePath.slice(projectPath.length + 1)
      : filePath;

  const segments = relativePath.split("/");
  const fileName = segments[segments.length - 1];
  const dirSegments = segments.slice(0, -1);

  const basePath = projectPath ?? "";
  const dirPaths = dirSegments.map((_, i) =>
    basePath + "/" + dirSegments.slice(0, i + 1).join("/"),
  );
  const parentDirPath =
    dirSegments.length > 0 ? dirPaths[dirPaths.length - 1] : basePath;

  return (
    <Breadcrumb className="border-b border-border bg-background px-3 py-1">
      <BreadcrumbList className="flex-nowrap gap-1 text-xs sm:gap-1">
        {dirSegments.map((segment, i) => (
          <span key={i} className="contents">
            <BreadcrumbItem>
              <BreadcrumbDropdown
                dirPath={i === 0 ? basePath : dirPaths[i - 1]}
              >
                <button className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                  <FolderIcon
                    folderName={segment}
                    expanded={false}
                    className="size-3.5"
                  />
                  {segment}
                </button>
              </BreadcrumbDropdown>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="[&>svg]:size-3" />
          </span>
        ))}
        <BreadcrumbItem>
          <BreadcrumbDropdown dirPath={parentDirPath}>
            <button className="inline-flex items-center gap-1">
              <BreadcrumbPage className="inline-flex items-center gap-1 text-xs">
                <FileIcon fileName={fileName} className="size-3.5" />
                {fileName}
              </BreadcrumbPage>
            </button>
          </BreadcrumbDropdown>
        </BreadcrumbItem>
        {symbols.map((sym, i) => (
          <span key={`sym-${i}`} className="contents">
            <BreadcrumbSeparator className="[&>svg]:size-3" />
            <BreadcrumbItem>
              <BreadcrumbPage className="text-xs text-muted-foreground">
                {sym.name}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </span>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
