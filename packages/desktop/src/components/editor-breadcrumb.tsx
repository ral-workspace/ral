import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@helm/ui";
import { useWorkspaceStore } from "../stores";
import { FileIcon } from "./file-icon";

interface EditorBreadcrumbProps {
  filePath: string;
}

export function EditorBreadcrumb({ filePath }: EditorBreadcrumbProps) {
  const projectPath = useWorkspaceStore((s) => s.projectPath);

  const relativePath = projectPath && filePath.startsWith(projectPath)
    ? filePath.slice(projectPath.length + 1)
    : filePath;

  const segments = relativePath.split("/");
  const fileName = segments[segments.length - 1];
  const dirSegments = segments.slice(0, -1);

  return (
    <Breadcrumb className="border-b border-border bg-background px-3 py-1">
      <BreadcrumbList className="flex-nowrap gap-1 text-xs sm:gap-1">
        {dirSegments.map((segment, i) => (
          <span key={i} className="contents">
            <BreadcrumbItem className="text-muted-foreground">
              {segment}
            </BreadcrumbItem>
            <BreadcrumbSeparator className="[&>svg]:size-3" />
          </span>
        ))}
        <BreadcrumbItem>
          <BreadcrumbPage className="inline-flex items-center gap-1 text-xs">
            <FileIcon fileName={fileName} className="size-3.5" />
            {fileName}
          </BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
