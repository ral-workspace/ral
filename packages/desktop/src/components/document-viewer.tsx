import { memo, useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import * as pdfjs from "pdfjs-dist";
import { PPTXViewer } from "pptxviewjs";
import {
  IconChevronLeft,
  IconChevronRight,
  IconZoomIn,
  IconZoomOut,
} from "@tabler/icons-react";
import { Spinner } from "@ral/ui";
import { isPdfFile, isPptxFile } from "../lib/file-type";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface DocumentViewerProps {
  filePath: string;
}

export function DocumentViewer({ filePath }: DocumentViewerProps) {
  if (isPptxFile(filePath)) {
    return <PptxDocumentViewer filePath={filePath} />;
  }
  return <PdfDocumentViewer filePath={filePath} />;
}

// ─── PPTX Viewer (PptxViewJS + Canvas) ───

function PptxDocumentViewer({ filePath }: { filePath: string }) {
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState("");
  const [slideCount, setSlideCount] = useState(0);
  const fileDataRef = useRef<Uint8Array | null>(null);

  // Load PPTX file data
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus("loading");
      fileDataRef.current = null;
      try {
        const url = convertFileSrc(filePath);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch file: ${res.status}`);
        const buffer = await res.arrayBuffer();
        if (cancelled) return;

        // Probe slide count with a temporary viewer
        const probe = new PPTXViewer();
        await probe.loadFile(new Uint8Array(buffer));
        const count = probe.getSlideCount();
        probe.destroy();
        if (cancelled) return;

        fileDataRef.current = new Uint8Array(buffer);
        setSlideCount(count);
        setStatus("ready");
      } catch (e) {
        if (!cancelled) {
          setError(String(e));
          setStatus("error");
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [filePath]);

  if (status === "loading") {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
        <Spinner className="size-5" />
        <span className="text-sm">Loading presentation…</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md space-y-2 text-center">
          <p className="text-sm font-medium text-destructive">Failed to open presentation</p>
          <p className="whitespace-pre-wrap text-xs text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex h-9 shrink-0 items-center justify-center gap-2 border-b px-3">
        <span className="text-xs text-muted-foreground">
          {slideCount} slides
        </span>
      </div>

      {/* Slides */}
      <div className="flex flex-1 flex-col items-center overflow-auto bg-muted/20 p-4 gap-4">
        {fileDataRef.current && Array.from({ length: slideCount }, (_, i) => (
          <PptxSlide key={i} fileData={fileDataRef.current!} slideIndex={i} />
        ))}
      </div>
    </div>
  );
}

/** Renders a single PPTX slide into its own canvas */
const PptxSlide = memo(function PptxSlide({ fileData, slideIndex }: { fileData: Uint8Array; slideIndex: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    async function render() {
      const viewer = new PPTXViewer({ canvas: canvas! });
      await viewer.loadFile(fileData);
      if (cancelled) { viewer.destroy(); return; }
      await viewer.renderSlide(slideIndex, canvas!, { scale: 2, quality: "high" });
      viewer.destroy();
      if (cancelled) return;
      // Clear inline styles set by PptxViewJS so CSS classes take effect
      canvas!.style.width = "";
      canvas!.style.height = "";
    }

    render();
    return () => { cancelled = true; };
  }, [fileData, slideIndex]);

  return <canvas ref={canvasRef} className="w-full max-w-full aspect-video shadow-lg" />;
});

// ─── PDF Viewer (pdfjs + Canvas) ───

type PdfViewerState =
  | { status: "loading"; message: string }
  | { status: "error"; message: string }
  | { status: "ready"; pdfPath: string };

function PdfDocumentViewer({ filePath }: { filePath: string }) {
  const [state, setState] = useState<PdfViewerState>({
    status: "loading",
    message: "Loading…",
  });
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.5);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<pdfjs.PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<pdfjs.RenderTask | null>(null);

  // Resolve PDF path (convert if needed)
  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      if (isPdfFile(filePath)) {
        if (!cancelled) setState({ status: "ready", pdfPath: filePath });
        return;
      }

      setState({ status: "loading", message: "Converting to PDF…" });
      try {
        const pdfPath = await invoke<string>("convert_to_pdf", {
          sourcePath: filePath,
        });
        if (!cancelled) setState({ status: "ready", pdfPath });
      } catch (e) {
        if (!cancelled)
          setState({ status: "error", message: String(e) });
      }
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  // Load PDF document
  const pdfPath = state.status === "ready" ? state.pdfPath : null;
  useEffect(() => {
    if (!pdfPath) return;

    let cancelled = false;

    async function loadPdf() {
      const url = convertFileSrc(pdfPath!);
      try {
        const doc = await pdfjs.getDocument(url).promise;
        if (cancelled) {
          doc.destroy();
          return;
        }
        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        setPageNum(1);
      } catch (e) {
        if (!cancelled)
          setState({ status: "error", message: `Failed to load PDF: ${e}` });
      }
    }

    loadPdf();
    return () => {
      cancelled = true;
      pdfDocRef.current?.destroy();
      pdfDocRef.current = null;
    };
  }, [pdfPath]);

  // Render current page
  const renderPage = useCallback(async () => {
    const doc = pdfDocRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas || numPages === 0) return;

    // Cancel previous render
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    try {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = viewport.width * dpr;
      canvas.height = viewport.height * dpr;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const task = page.render({ canvas, canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      await task.promise;
    } catch (e) {
      // Ignore cancel errors
      if (e instanceof Error && e.message.includes("cancel")) return;
    }
  }, [pageNum, scale, numPages]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

  if (state.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
        <Spinner className="size-5" />
        <span className="text-sm">{state.message}</span>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md space-y-2 text-center">
          <p className="text-sm font-medium text-destructive">
            Failed to open document
          </p>
          <p className="whitespace-pre-wrap text-xs text-muted-foreground">
            {state.message}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex h-9 shrink-0 items-center justify-center gap-2 border-b px-3">
        <button
          onClick={() => setPageNum((p) => Math.max(1, p - 1))}
          disabled={pageNum <= 1}
          className="rounded p-1 hover:bg-muted disabled:opacity-30"
        >
          <IconChevronLeft className="size-4" />
        </button>
        <span className="min-w-[6rem] text-center text-xs text-muted-foreground">
          {pageNum} / {numPages}
        </span>
        <button
          onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
          disabled={pageNum >= numPages}
          className="rounded p-1 hover:bg-muted disabled:opacity-30"
        >
          <IconChevronRight className="size-4" />
        </button>

        <div className="mx-2 h-4 w-px bg-border" />

        <button
          onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}
          disabled={scale <= 0.5}
          className="rounded p-1 hover:bg-muted disabled:opacity-30"
        >
          <IconZoomOut className="size-4" />
        </button>
        <span className="min-w-[3rem] text-center text-xs text-muted-foreground">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={() => setScale((s) => Math.min(4, s + 0.25))}
          disabled={scale >= 4}
          className="rounded p-1 hover:bg-muted disabled:opacity-30"
        >
          <IconZoomIn className="size-4" />
        </button>
      </div>

      {/* Canvas */}
      <div className="flex flex-1 items-start justify-center overflow-auto bg-muted/20 p-4">
        <canvas ref={canvasRef} className="shadow-lg" />
      </div>
    </div>
  );
}
