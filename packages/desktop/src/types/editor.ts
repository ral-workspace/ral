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

export const SETTINGS_TAB_ID = "helm:settings";
export const BROWSER_TAB_PREFIX = "helm:browser:";
export const DIFF_TAB_PREFIX = "helm:diff:";
export const PREVIEW_TAB_PREFIX = "helm:preview:";
export const DATABASE_TAB_PREFIX = "helm:database:";
export const MARKDOWN_TAB_PREFIX = "helm:markdown:";
export const WORKFLOWS_TAB_ID = "helm:workflows";
