export interface OpenTab {
  id: string;
  name: string;
  pinned: boolean;
  type: "file" | "settings" | "browser" | "diff" | "preview" | "database";
}

export const SETTINGS_TAB_ID = "helm:settings";
export const BROWSER_TAB_PREFIX = "helm:browser:";
export const DIFF_TAB_PREFIX = "helm:diff:";
export const PREVIEW_TAB_PREFIX = "helm:preview:";
export const DATABASE_TAB_PREFIX = "helm:database:";
