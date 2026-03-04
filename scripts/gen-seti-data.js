const fs = require("fs");
const data = JSON.parse(
  fs.readFileSync(
    "reference/extensions/theme-seti/icons/vs-seti-icon-theme.json",
    "utf8"
  )
);

// Extension -> languageId mapping (what VS Code resolves internally)
const extToLang = {
  js: "javascript", mjs: "javascript", cjs: "javascript",
  ts: "typescript", mts: "typescript", cts: "typescript",
  tsx: "typescriptreact", jsx: "javascriptreact",
  json: "json", jsonc: "jsonc",
  css: "css", scss: "scss", less: "less", sass: "sass",
  html: "html", htm: "html",
  md: "markdown", markdown: "markdown",
  rs: "rust",
  py: "python", pyw: "python",
  go: "go",
  java: "java",
  yaml: "yaml", yml: "yaml",
  xml: "xml", xsl: "xml", xsd: "xml",
  sql: "sql",
  sh: "shellscript", bash: "shellscript", zsh: "shellscript",
  rb: "ruby", erb: "ruby",
  php: "php",
  swift: "swift",
  kt: "kotlin", kts: "kotlin",
  c: "c",
  cpp: "cpp", cc: "cpp", cxx: "cpp",
  lua: "lua",
  r: "r",
  dart: "dart",
  vue: "vue",
  svelte: "svelte",
  bat: "bat",
  ps1: "powershell",
  clj: "clojure", cljs: "clojure", cljc: "clojure",
  ex: "elixir", exs: "elixir",
  erl: "erlang",
  fs: "fsharp", fsx: "fsharp",
  hs: "haskell",
  jl: "julia",
  nim: "nim",
  pl: "perl", pm: "perl",
  scala: "scala",
  zig: "zig",
};

// Merge languageIds into fileExtensions
const mergedFileExtensions = { ...data.fileExtensions };
const mergedLightFileExtensions = { ...(data.light?.fileExtensions || {}) };

for (const [ext, lang] of Object.entries(extToLang)) {
  if (!mergedFileExtensions[ext] && data.languageIds[lang]) {
    mergedFileExtensions[ext] = data.languageIds[lang];
  }
  if (!mergedLightFileExtensions[ext] && data.light?.languageIds?.[lang]) {
    mergedLightFileExtensions[ext] = data.light.languageIds[lang];
  }
}

// Add dotfiles that VS Code resolves via languageIds but have no extension
const dotfileToIcon = {
  ".gitignore": "_git",
  ".gitattributes": "_git",
  ".gitmodules": "_git",
  ".editorconfig": "_config",
  ".env": "_config",
  ".env.local": "_config",
  ".env.development": "_config",
  ".env.production": "_config",
  ".eslintrc": "_eslint",
  ".eslintignore": "_eslint",
  ".prettierrc": "_prettier",
  ".prettierignore": "_prettier",
  ".npmrc": "_npm",
  ".npmignore": "_npm",
  ".dockerignore": "_docker",
  ".babelrc": "_babel",
};

const mergedFileNames = { ...data.fileNames };
const mergedLightFileNames = { ...(data.light?.fileNames || {}) };

for (const [name, iconId] of Object.entries(dotfileToIcon)) {
  if (!mergedFileNames[name]) {
    mergedFileNames[name] = iconId;
  }
  const lightId = iconId + "_light";
  if (!mergedLightFileNames[name] && data.iconDefinitions[lightId]) {
    mergedLightFileNames[name] = lightId;
  }
}

// Extract icon definitions
const iconDefs = {};
for (const [key, val] of Object.entries(data.iconDefinitions)) {
  iconDefs[key] = { fontCharacter: val.fontCharacter };
  if (val.fontColor) iconDefs[key].fontColor = val.fontColor;
}

const output = `// Auto-generated from VS Code's vs-seti-icon-theme.json (MIT license)
// Source: https://github.com/jesseweed/seti-ui
// languageIds mappings have been merged into fileExtensions for direct extension lookup

export const iconDefinitions: Record<string, { fontCharacter: string; fontColor?: string }> = ${JSON.stringify(iconDefs, null, 2)};

export const fileExtensions: Record<string, string> = ${JSON.stringify(mergedFileExtensions, null, 2)};

export const fileNames: Record<string, string> = ${JSON.stringify(mergedFileNames, null, 2)};

export const lightFileExtensions: Record<string, string> = ${JSON.stringify(mergedLightFileExtensions, null, 2)};

export const lightFileNames: Record<string, string> = ${JSON.stringify(mergedLightFileNames, null, 2)};

export const DEFAULT_ICON = "_default";
export const DEFAULT_LIGHT_ICON = "_default_light";
`;

fs.writeFileSync("packages/desktop/src/lib/seti-icon-data.ts", output);

console.log(
  "Merged extensions:",
  Object.keys(mergedFileExtensions).length,
  "(was",
  Object.keys(data.fileExtensions).length,
  ")"
);
console.log("Verify: js ->", mergedFileExtensions["js"]);
console.log("Verify: ts ->", mergedFileExtensions["ts"]);
console.log("Verify: json ->", mergedFileExtensions["json"]);
console.log("Verify: rs ->", mergedFileExtensions["rs"]);
console.log("Verify: py ->", mergedFileExtensions["py"]);
console.log("Verify: md ->", mergedFileExtensions["md"]);
console.log("Verify: css ->", mergedFileExtensions["css"]);
