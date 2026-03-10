export interface OpenTab {
  id: string;
  name: string;
  pinned: boolean;
  type: "file" | "settings" | "browser" | "diff" | "preview" | "database" | "markdown" | "workflows";
}

export interface EditorGroup {
  id: string;
  openTabs: OpenTab[];
  activeTabId: string | null;
}

export type SplitNode =
  | { type: "leaf"; groupId: string }
  | { type: "branch"; direction: "horizontal" | "vertical"; children: SplitNode[] };

export const SETTINGS_TAB_ID = "ral:settings";
export const BROWSER_TAB_PREFIX = "ral:browser:";
export const DIFF_TAB_PREFIX = "ral:diff:";
export const PREVIEW_TAB_PREFIX = "ral:preview:";
export const DATABASE_TAB_PREFIX = "ral:database:";
export const MARKDOWN_TAB_PREFIX = "ral:markdown:";
export const WORKFLOWS_TAB_ID = "ral:workflows";
