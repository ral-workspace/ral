export interface IconDefinition {
  fontCharacter?: string;
  fontColor?: string;
  fontId?: string;
  iconPath?: string;
}

export interface IconThemeFont {
  id: string;
  src: { path: string; format: string }[];
}

export interface IconThemeManifest {
  fonts?: IconThemeFont[];
  iconDefinitions: Record<string, IconDefinition>;
  file?: string;
  folder?: string;
  folderExpanded?: string;
  rootFolder?: string;
  rootFolderExpanded?: string;
  fileExtensions: Record<string, string>;
  fileNames: Record<string, string>;
  folderNames?: Record<string, string>;
  folderNamesExpanded?: Record<string, string>;
  languageIds?: Record<string, string>;
  light?: {
    fileExtensions?: Record<string, string>;
    fileNames?: Record<string, string>;
    folderNames?: Record<string, string>;
    folderNamesExpanded?: Record<string, string>;
    languageIds?: Record<string, string>;
  };
  _themeDir: string;
  _manifestDir: string;
}

export interface IconThemeInfo {
  id: string;
  label: string;
  path: string;
}
