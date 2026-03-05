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

const DOCUMENT_EXTENSIONS = new Set(["pdf", "pptx", "ppt", "xlsx", "xls", "docx", "doc"]);

export function isDocumentFile(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return DOCUMENT_EXTENSIONS.has(ext);
}

export function isPdfFile(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(".pdf");
}

export function isDbYamlFile(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(".db.yaml");
}
