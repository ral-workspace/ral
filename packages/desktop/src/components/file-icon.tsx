import { useTheme } from "next-themes";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useIconThemeStore } from "../stores/icon-theme-store";
import type { IconThemeManifest } from "../types/icon-theme";

// Extension → languageId mapping
const EXT_TO_LANGUAGE_ID: Record<string, string> = {
  // typescript-basics
  ts: "typescript", cts: "typescript", mts: "typescript",
  tsx: "typescriptreact",
  // javascript
  js: "javascript", es6: "javascript", mjs: "javascript", cjs: "javascript", pac: "javascript",
  jsx: "javascriptreact",
  // web
  html: "html", htm: "html", shtml: "html", xhtml: "html",
  css: "css",
  scss: "scss",
  less: "less",
  json: "json", webmanifest: "json", jsonld: "json", geojson: "json",
  jsonc: "jsonc",
  jsonl: "jsonl",
  // markup
  md: "markdown", mkd: "markdown", mdwn: "markdown", mdown: "markdown", markdown: "markdown",
  xml: "xml", xsd: "xml", svg: "xml", xaml: "xml",
  xsl: "xsl", xslt: "xsl",
  yaml: "yaml", yml: "yaml",
  toml: "toml",
  // systems
  c: "c", i: "c",
  cpp: "cpp", cc: "cpp", cxx: "cpp", hpp: "cpp", hh: "cpp", hxx: "cpp", h: "cpp",
  cs: "csharp", csx: "csharp",
  rs: "rust",
  go: "go",
  java: "java", jav: "java",
  swift: "swift",
  m: "objective-c",
  mm: "objective-cpp",
  // scripting
  py: "python", pyw: "python", pyi: "python",
  rb: "ruby", rbx: "ruby", gemspec: "ruby", rake: "ruby", erb: "ruby",
  php: "php",
  lua: "lua",
  pl: "perl", pm: "perl",
  r: "r",
  jl: "julia",
  // shell
  sh: "shellscript", bash: "shellscript", zsh: "shellscript", fish: "shellscript", ksh: "shellscript",
  ps1: "powershell", psm1: "powershell", psd1: "powershell",
  bat: "bat", cmd: "bat",
  // functional
  hs: "haskell",
  fs: "fsharp", fsi: "fsharp", fsx: "fsharp",
  clj: "clojure", cljs: "clojure", cljc: "clojure",
  ex: "elixir", exs: "elixir",
  erl: "erlang",
  elm: "elm",
  // jvm
  scala: "scala",
  groovy: "groovy", gradle: "groovy",
  kt: "kotlin", kts: "kotlin",
  // config / data
  ini: "ini",
  sql: "sql", dsql: "sql",
  dockerfile: "dockerfile",
  diff: "diff", patch: "diff",
  // other
  dart: "dart",
  vb: "vb", vbs: "vb", bas: "vb",
  coffee: "coffeescript",
  tex: "latex", ltx: "latex",
  pug: "jade", jade: "jade",
  handlebars: "handlebars", hbs: "handlebars",
  razor: "razor", cshtml: "razor",
  vue: "vue",
  svelte: "svelte",
  graphql: "graphql",
  proto: "proto",
  nim: "nim",
  nix: "nix",
  hx: "haxe",
  v: "v",
  zig: "zig",
};

// Filename → languageId mapping (for files without extensions)
const FILENAME_TO_LANGUAGE_ID: Record<string, string> = {
  makefile: "makefile",
  gnumakefile: "makefile",
  dockerfile: "dockerfile",
  containerfile: "dockerfile",
  gemfile: "ruby",
  rakefile: "ruby",
  guardfile: "ruby",
  vagrantfile: "ruby",
  jakefile: "javascript",
  jenkinsfile: "groovy",
};

interface FileIconProps {
  fileName: string;
  className?: string;
}

interface FolderIconProps {
  folderName: string;
  expanded: boolean;
  isRoot?: boolean;
  className?: string;
}

function resolveIconPath(
  iconPath: string,
  manifest: IconThemeManifest,
): string {
  // iconPath is relative to the manifest file's directory (_manifestDir).
  // e.g. iconPath = "./../icons/file.svg", _manifestDir = "/.../.ral/icon-themes/material-icon-theme/dist"
  // → resolve to _manifestDir + "/../icons/file.svg" → normalize → "/.../.ral/icon-themes/material-icon-theme/icons/file.svg"
  const manifestDir = manifest._manifestDir;
  const cleaned = iconPath.replace(/^\.\//, "");

  // Combine manifestDir segments with iconPath segments and normalize
  const base = manifestDir.split("/");
  const rel = cleaned.split("/");

  for (const part of rel) {
    if (part === "..") {
      base.pop();
    } else if (part !== ".") {
      base.push(part);
    }
  }

  return base.join("/");
}

function resolveFileIconId(
  name: string,
  isLight: boolean,
  manifest: IconThemeManifest,
): string {
  const lower = name.toLowerCase();

  const fileNames = isLight
    ? { ...manifest.fileNames, ...manifest.light?.fileNames }
    : manifest.fileNames;
  const fileExts = isLight
    ? { ...manifest.fileExtensions, ...manifest.light?.fileExtensions }
    : manifest.fileExtensions;
  const langIds = isLight
    ? { ...manifest.languageIds, ...manifest.light?.languageIds }
    : manifest.languageIds;

  // 1. Exact file name match
  if (fileNames[lower]) return fileNames[lower];

  // 2. Extension match (compound first, then simple)
  const dotIdx = lower.indexOf(".");
  if (dotIdx !== -1) {
    const compoundExt = lower.slice(dotIdx + 1);
    if (fileExts[compoundExt]) return fileExts[compoundExt];

    const simpleExt = lower.slice(lower.lastIndexOf(".") + 1);
    if (simpleExt !== compoundExt && fileExts[simpleExt])
      return fileExts[simpleExt];
  }

  // 3. languageIds fallback — resolve extension/filename to languageId first
  if (langIds) {
    // Try filename → languageId (e.g. "Makefile" → "makefile")
    const langByName = FILENAME_TO_LANGUAGE_ID[lower];
    if (langByName && langIds[langByName]) return langIds[langByName];

    // Try extension → languageId (e.g. "ts" → "typescript")
    const ext = lower.slice(lower.lastIndexOf(".") + 1);
    const langByExt = EXT_TO_LANGUAGE_ID[ext];
    if (langByExt && langIds[langByExt]) return langIds[langByExt];
  }

  // 4. Default file icon
  return manifest.file ?? "_default";
}

function resolveFolderIconId(
  name: string,
  expanded: boolean,
  isRoot: boolean,
  isLight: boolean,
  manifest: IconThemeManifest,
): string | null {
  const lower = name.toLowerCase();

  if (isRoot) {
    if (expanded && manifest.rootFolderExpanded) return manifest.rootFolderExpanded;
    if (!expanded && manifest.rootFolder) return manifest.rootFolder;
  }

  const folderMap = expanded
    ? isLight
      ? { ...manifest.folderNamesExpanded, ...manifest.light?.folderNamesExpanded }
      : manifest.folderNamesExpanded
    : isLight
      ? { ...manifest.folderNames, ...manifest.light?.folderNames }
      : manifest.folderNames;

  if (folderMap?.[lower]) return folderMap[lower];

  // Default folder icon
  if (expanded && manifest.folderExpanded) return manifest.folderExpanded;
  if (!expanded && manifest.folder) return manifest.folder;

  return null; // No folder icon in this theme
}

function renderIcon(
  iconId: string,
  manifest: IconThemeManifest,
  className?: string,
) {
  const def = manifest.iconDefinitions[iconId];
  if (!def) return null;

  // SVG-based icon (Material Icon Theme)
  if (def.iconPath) {
    const absPath = resolveIconPath(def.iconPath, manifest);
    const src = convertFileSrc(absPath);
    return (
      <img
        src={src}
        className={className}
        alt=""
        draggable={false}
        style={{ display: "inline-block" }}
      />
    );
  }

  // Font-based icon (Seti, etc.)
  if (def.fontCharacter) {
    const fontId = def.fontId ?? manifest.fonts?.[0]?.id ?? "seti";
    const char = String.fromCodePoint(
      parseInt(def.fontCharacter.replace("\\", ""), 16),
    );
    return (
      <span
        className={className}
        style={{
          fontFamily: fontId,
          color: def.fontColor,
          lineHeight: 1,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {char}
      </span>
    );
  }

  return null;
}

export function FileIcon({ fileName, className }: FileIconProps) {
  const { resolvedTheme } = useTheme();
  const manifest = useIconThemeStore((s) => s.manifest);

  if (!manifest) return null;

  const isLight = resolvedTheme === "light";
  const iconId = resolveFileIconId(fileName, isLight, manifest);
  return renderIcon(iconId, manifest, className);
}

export function FolderIcon({
  folderName,
  expanded,
  isRoot = false,
  className,
}: FolderIconProps) {
  const { resolvedTheme } = useTheme();
  const manifest = useIconThemeStore((s) => s.manifest);

  if (!manifest) return null;

  const isLight = resolvedTheme === "light";
  const iconId = resolveFolderIconId(folderName, expanded, isRoot, isLight, manifest);
  if (!iconId) return null;

  return renderIcon(iconId, manifest, className);
}
