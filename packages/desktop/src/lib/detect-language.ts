import type { LanguageSupport } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import { java } from "@codemirror/lang-java";
import { cpp } from "@codemirror/lang-cpp";
import { php } from "@codemirror/lang-php";
import { sql } from "@codemirror/lang-sql";
import { go } from "@codemirror/lang-go";

type LanguageFactory = () => LanguageSupport;

const EXTENSION_MAP: Record<string, LanguageFactory> = {
  ts: () => javascript({ typescript: true, jsx: false }),
  tsx: () => javascript({ typescript: true, jsx: true }),
  js: () => javascript(),
  jsx: () => javascript({ jsx: true }),
  mjs: () => javascript(),
  cjs: () => javascript(),
  json: () => json(),
  jsonc: () => json(),
  css: () => css(),
  scss: () => css(),
  less: () => css(),
  html: () => html(),
  htm: () => html(),
  xml: () => xml(),
  svg: () => xml(),
  md: () => markdown(),
  mdx: () => markdown(),
  rs: () => rust(),
  py: () => python(),
  yaml: () => yaml(),
  yml: () => yaml(),
  toml: () => yaml(),
  go: () => go(),
  java: () => java(),
  c: () => cpp(),
  cpp: () => cpp(),
  h: () => cpp(),
  hpp: () => cpp(),
  php: () => php(),
  sql: () => sql(),
};

const FILENAME_MAP: Record<string, LanguageFactory> = {
  Dockerfile: () => yaml(),
};

export function getLanguageExtension(filePath: string): LanguageSupport | null {
  const filename = filePath.split("/").pop() ?? "";
  const nameWithoutExt = filename.split(".")[0];
  const byName = FILENAME_MAP[nameWithoutExt];
  if (byName) return byName();

  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const byExt = EXTENSION_MAP[ext];
  return byExt ? byExt() : null;
}
