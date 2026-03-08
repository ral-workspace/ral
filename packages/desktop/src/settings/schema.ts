export interface EditorSettings {
  "editor.fontFamily": string;
  "editor.fontSize": number;
  "editor.fontWeight": string;
  "editor.lineHeight": number;
  "editor.letterSpacing": number;
  "editor.wordWrap": "off" | "on";
  "editor.tabSize": number;
  "editor.darkTheme": string;
  "editor.lightTheme": string;
  "editor.bracketMatching": boolean;
  "editor.lineNumbers": "on" | "off" | "relative";
  "editor.renderLineHighlight": "none" | "gutter" | "line" | "all";
}

export interface TerminalSettings {
  "terminal.fontSize": number;
  "terminal.fontFamily": string;
  "terminal.lineHeight": number;
  "terminal.cursorBlink": boolean;
}

export interface UISettings {
  "ui.colorTheme": "dark" | "light" | "system";
  "ui.iconTheme": string;
}

export interface HistorySettings {
  "history.enabled": boolean;
  "history.maxEntries": number;
  "history.maxFileSize": number;
}

export type Settings = EditorSettings & TerminalSettings & UISettings & HistorySettings;

// VS Code macOS defaults
export const DEFAULT_SETTINGS: Settings = {
  "editor.fontFamily": "Menlo, Monaco, 'Courier New', monospace",
  "editor.fontSize": 12,
  "editor.fontWeight": "normal",
  "editor.lineHeight": 0, // 0 = auto (fontSize × 1.5)
  "editor.letterSpacing": 0,
  "editor.wordWrap": "off",
  "editor.tabSize": 4,
  "editor.darkTheme": "oneDark",
  "editor.lightTheme": "ayuLight",
  "editor.bracketMatching": true,
  "editor.lineNumbers": "on",
  "editor.renderLineHighlight": "line",

  "terminal.fontSize": 12,
  "terminal.fontFamily": "Menlo, Monaco, 'Courier New', monospace",
  "terminal.lineHeight": 1,
  "terminal.cursorBlink": true,

  "ui.colorTheme": "dark",
  "ui.iconTheme": "material-icon-theme",

  "history.enabled": true,
  "history.maxEntries": 50,
  "history.maxFileSize": 5,
};

// --- Settings metadata for UI rendering ---

/** Section = sidebar nav item (Editor, Terminal, UI) */
export type SettingSection = "Editor" | "Terminal" | "UI" | "Plugins";

/** Category = card group within a section (e.g. "Font", "Display") */
export interface SettingMeta {
  label: string;
  description: string;
  section: SettingSection;
  category: string;
  type: "boolean" | "number" | "string" | "select";
  options?: string[];
  min?: number;
  max?: number;
}

export const SETTINGS_METADATA: Record<keyof Settings, SettingMeta> = {
  "editor.fontFamily": {
    label: "Font Family",
    description: "Controls the font family for the editor.",
    section: "Editor",
    category: "Font",
    type: "string",
  },
  "editor.fontSize": {
    label: "Font Size",
    description: "Controls the font size in pixels.",
    section: "Editor",
    category: "Font",
    type: "number",
    min: 6,
    max: 100,
  },
  "editor.fontWeight": {
    label: "Font Weight",
    description: "Controls the font weight.",
    section: "Editor",
    category: "Font",
    type: "select",
    options: ["normal", "bold", "100", "200", "300", "400", "500", "600", "700", "800", "900"],
  },
  "editor.lineHeight": {
    label: "Line Height",
    description: "Controls the line height. 0 uses automatic value (fontSize × 1.5).",
    section: "Editor",
    category: "Font",
    type: "number",
    min: 0,
    max: 150,
  },
  "editor.letterSpacing": {
    label: "Letter Spacing",
    description: "Controls the letter spacing in pixels.",
    section: "Editor",
    category: "Font",
    type: "number",
    min: -5,
    max: 20,
  },
  "editor.wordWrap": {
    label: "Word Wrap",
    description: "Controls how lines should wrap.",
    section: "Editor",
    category: "Display",
    type: "select",
    options: ["off", "on"],
  },
  "editor.tabSize": {
    label: "Tab Size",
    description: "The number of spaces a tab is equal to.",
    section: "Editor",
    category: "Display",
    type: "number",
    min: 1,
    max: 8,
  },
  "editor.darkTheme": {
    label: "Dark Theme",
    description: "Editor color theme used in dark mode.",
    section: "Editor",
    category: "Appearance",
    type: "select",
    options: ["oneDark", "dracula", "cobalt", "coolGlow", "espresso"],
  },
  "editor.lightTheme": {
    label: "Light Theme",
    description: "Editor color theme used in light mode.",
    section: "Editor",
    category: "Appearance",
    type: "select",
    options: ["ayuLight", "solarizedLight", "rosePineDawn", "tomorrow"],
  },
  "editor.bracketMatching": {
    label: "Bracket Matching",
    description: "Highlight matching brackets.",
    section: "Editor",
    category: "Display",
    type: "boolean",
  },
  "editor.lineNumbers": {
    label: "Line Numbers",
    description: "Controls the display of line numbers.",
    section: "Editor",
    category: "Display",
    type: "select",
    options: ["on", "off", "relative"],
  },
  "editor.renderLineHighlight": {
    label: "Render Line Highlight",
    description: "Controls how the current line is highlighted.",
    section: "Editor",
    category: "Display",
    type: "select",
    options: ["none", "gutter", "line", "all"],
  },
  "terminal.fontSize": {
    label: "Font Size",
    description: "Controls the font size in pixels for the terminal.",
    section: "Terminal",
    category: "Font",
    type: "number",
    min: 6,
    max: 100,
  },
  "terminal.fontFamily": {
    label: "Font Family",
    description: "Controls the font family for the terminal.",
    section: "Terminal",
    category: "Font",
    type: "string",
  },
  "terminal.lineHeight": {
    label: "Line Height",
    description: "Controls the line height for the terminal.",
    section: "Terminal",
    category: "Font",
    type: "number",
    min: 1,
    max: 3,
  },
  "terminal.cursorBlink": {
    label: "Cursor Blink",
    description: "Controls whether the terminal cursor blinks.",
    section: "Terminal",
    category: "Behavior",
    type: "boolean",
  },
  "ui.colorTheme": {
    label: "Color Theme",
    description: "Specifies the color theme for the application.",
    section: "UI",
    category: "Theme",
    type: "select",
    options: ["dark", "light", "system"],
  },
  "ui.iconTheme": {
    label: "Icon Theme",
    description: "File icon theme for the explorer and tabs.",
    section: "UI",
    category: "Theme",
    type: "string",
  },
  "history.enabled": {
    label: "Enable Local History",
    description: "Save file snapshots on save. Allows restoring previous versions.",
    section: "Editor",
    category: "History",
    type: "boolean",
  },
  "history.maxEntries": {
    label: "Max History Entries",
    description: "Maximum number of history entries to keep per file.",
    section: "Editor",
    category: "History",
    type: "number",
    min: 5,
    max: 200,
  },
  "history.maxFileSize": {
    label: "Max File Size (MB)",
    description: "Files larger than this size will not have history saved.",
    section: "Editor",
    category: "History",
    type: "number",
    min: 1,
    max: 50,
  },
};

export const SETTING_SECTIONS: SettingSection[] = ["Editor", "Terminal", "UI", "Plugins"];

/** Resolve lineHeight to px. 0 = auto (fontSize × 1.5). */
export function resolveEditorLineHeight(settings: Settings): number {
  const lh = settings["editor.lineHeight"];
  return lh === 0 ? Math.round(settings["editor.fontSize"] * 1.5) : lh;
}
