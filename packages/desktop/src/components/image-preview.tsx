import { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

interface ImagePreviewProps {
  filePath: string;
}

export function ImagePreview({ filePath }: ImagePreviewProps) {
  const [dimensions, setDimensions] = useState<{
    w: number;
    h: number;
  } | null>(null);
  const src = convertFileSrc(filePath);

  return (
    <div
      className="flex h-full flex-col items-center justify-center overflow-auto p-4"
      style={{
        backgroundImage:
          "linear-gradient(45deg, hsl(0 0% 20%) 25%, transparent 25%), " +
          "linear-gradient(-45deg, hsl(0 0% 20%) 25%, transparent 25%), " +
          "linear-gradient(45deg, transparent 75%, hsl(0 0% 20%) 75%), " +
          "linear-gradient(-45deg, transparent 75%, hsl(0 0% 20%) 75%)",
        backgroundSize: "20px 20px",
        backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0",
        backgroundColor: "hsl(0 0% 15%)",
      }}
    >
      <img
        src={src}
        alt={filePath.split("/").pop() ?? ""}
        className="max-h-full max-w-full object-contain"
        onLoad={(e) => {
          const img = e.currentTarget;
          setDimensions({ w: img.naturalWidth, h: img.naturalHeight });
        }}
      />
      {dimensions && (
        <div className="mt-2 text-xs text-muted-foreground">
          {dimensions.w} × {dimensions.h}
        </div>
      )}
    </div>
  );
}
