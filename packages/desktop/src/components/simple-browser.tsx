import { useCallback, useRef, useState } from "react";
import {
  IconArrowLeft,
  IconArrowRight,
  IconRefresh,
  IconExternalLink,
} from "@tabler/icons-react";
import { openUrl } from "@tauri-apps/plugin-opener";

interface SimpleBrowserProps {
  initialUrl: string;
}

export function SimpleBrowser({ initialUrl }: SimpleBrowserProps) {
  const [history, setHistory] = useState<string[]>([initialUrl]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [inputValue, setInputValue] = useState(initialUrl);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const currentUrl = history[historyIndex];
  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < history.length - 1;

  const navigateTo = useCallback(
    (url: string) => {
      const trimmed = url.trim();
      if (!trimmed) return;

      const normalized =
        trimmed.startsWith("http://") || trimmed.startsWith("https://")
          ? trimmed
          : `https://${trimmed}`;

      setHistory((prev) => [...prev.slice(0, historyIndex + 1), normalized]);
      setHistoryIndex((i) => i + 1);
      setInputValue(normalized);
    },
    [historyIndex],
  );

  const goBack = useCallback(() => {
    if (!canGoBack) return;
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    setInputValue(history[newIndex]);
  }, [canGoBack, historyIndex, history]);

  const goForward = useCallback(() => {
    if (!canGoForward) return;
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    setInputValue(history[newIndex]);
  }, [canGoForward, historyIndex, history]);

  const reload = useCallback(() => {
    const iframe = iframeRef.current;
    if (iframe) {
      iframe.src = iframe.src;
    }
  }, []);

  const openExternal = useCallback(() => {
    openUrl(inputValue || currentUrl);
  }, [inputValue, currentUrl]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      navigateTo(inputValue);
    }
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Toolbar */}
      <div className="flex h-9 items-center gap-1 border-b px-2">
        <button
          onClick={goBack}
          disabled={!canGoBack}
          title="Back"
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <IconArrowLeft className="size-4" />
        </button>
        <button
          onClick={goForward}
          disabled={!canGoForward}
          title="Forward"
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <IconArrowRight className="size-4" />
        </button>
        <button
          onClick={reload}
          title="Reload"
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted"
        >
          <IconRefresh className="size-4" />
        </button>

        <input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="mx-1 h-6 min-w-0 flex-1 rounded border bg-muted/50 px-2 text-[13px] text-foreground outline-none focus:border-blue-500"
        />

        <button
          onClick={openExternal}
          title="Open in External Browser"
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted"
        >
          <IconExternalLink className="size-4" />
        </button>
      </div>

      {/* iframe */}
      <iframe
        ref={iframeRef}
        src={currentUrl}
        sandbox="allow-scripts allow-forms allow-same-origin allow-downloads allow-popups"
        className="flex-1 border-none"
      />
    </div>
  );
}
