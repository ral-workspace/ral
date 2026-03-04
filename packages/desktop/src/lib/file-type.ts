const IMAGE_EXTENSIONS = new Set([
  "jpg", "jpeg", "jpe",
  "png",
  "bmp",
  "gif",
  "ico",
  "webp",
  "avif",
  "svg",
]);

export function isImageFile(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(ext);
}
