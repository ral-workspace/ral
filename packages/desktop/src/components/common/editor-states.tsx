import { Spinner } from "@ral/ui";

interface EditorLoadingStateProps {
  message?: string;
}

export function EditorLoadingState({ message = "Loading content..." }: EditorLoadingStateProps) {
  return (
    <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
      <Spinner className="size-5" />
      <span className="text-sm">{message}</span>
    </div>
  );
}

interface EditorErrorStateProps {
  message?: string;
  detail?: string;
}

export function EditorErrorState({
  message = "Failed to load content",
  detail,
}: EditorErrorStateProps) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md space-y-2 text-center">
        <p className="text-sm font-medium text-destructive">{message}</p>
        {detail && (
          <p className="whitespace-pre-wrap text-xs text-muted-foreground">
            {detail}
          </p>
        )}
      </div>
    </div>
  );
}
