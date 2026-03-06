import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface SearchMatch {
  file_path: string;
  line_number: number;
  line_content: string;
  match_start: number;
  match_end: number;
}

export interface FileGroup {
  filePath: string;
  matches: SearchMatch[];
  expanded: boolean;
}

interface SearchState {
  query: string;
  isRegex: boolean;
  isCaseSensitive: boolean;
  isWholeWord: boolean;
  includePattern: string;
  excludePattern: string;
  showFilters: boolean;
  results: SearchMatch[];
  groupedResults: FileGroup[];
  fileNameResults: string[];
  isSearching: boolean;
  totalMatches: number;
  totalFiles: number;

  setQuery: (q: string) => void;
  toggleRegex: () => void;
  toggleCaseSensitive: () => void;
  toggleWholeWord: () => void;
  setIncludePattern: (p: string) => void;
  setExcludePattern: (p: string) => void;
  toggleFilters: () => void;
  toggleFileExpanded: (filePath: string) => void;
  performSearch: (rootPath: string) => Promise<void>;
  clearResults: () => void;
}

function groupByFile(matches: SearchMatch[]): FileGroup[] {
  const map = new Map<string, SearchMatch[]>();
  for (const m of matches) {
    const existing = map.get(m.file_path);
    if (existing) {
      existing.push(m);
    } else {
      map.set(m.file_path, [m]);
    }
  }
  return Array.from(map.entries()).map(([filePath, matches]) => ({
    filePath,
    matches,
    expanded: true,
  }));
}

export const useSearchStore = create<SearchState>((set, get) => ({
  query: "",
  isRegex: false,
  isCaseSensitive: false,
  isWholeWord: false,
  includePattern: "",
  excludePattern: "",
  showFilters: false,
  results: [],
  groupedResults: [],
  fileNameResults: [],
  isSearching: false,
  totalMatches: 0,
  totalFiles: 0,

  setQuery: (q) => set({ query: q }),
  toggleRegex: () => set((s) => ({ isRegex: !s.isRegex })),
  toggleCaseSensitive: () => set((s) => ({ isCaseSensitive: !s.isCaseSensitive })),
  toggleWholeWord: () => set((s) => ({ isWholeWord: !s.isWholeWord })),
  setIncludePattern: (p) => set({ includePattern: p }),
  setExcludePattern: (p) => set({ excludePattern: p }),
  toggleFilters: () => set((s) => ({ showFilters: !s.showFilters })),

  toggleFileExpanded: (filePath) =>
    set((s) => ({
      groupedResults: s.groupedResults.map((g) =>
        g.filePath === filePath ? { ...g, expanded: !g.expanded } : g,
      ),
    })),

  performSearch: async (rootPath) => {
    const { query, isRegex, isCaseSensitive, isWholeWord, includePattern, excludePattern } = get();
    if (!query.trim()) {
      set({ results: [], groupedResults: [], fileNameResults: [], totalMatches: 0, totalFiles: 0 });
      return;
    }

    set({ isSearching: true });
    try {
      const [results, fileNames] = await Promise.all([
        invoke<SearchMatch[]>("search_text", {
          rootPath,
          query,
          options: {
            case_insensitive: !isCaseSensitive,
            is_regex: isRegex,
            whole_word: isWholeWord,
            max_results: 5000,
            include_pattern: includePattern || null,
            exclude_pattern: excludePattern || null,
          },
        }),
        invoke<string[]>("search_files", {
          rootPath,
          query,
          maxResults: 20,
        }),
      ]);

      const grouped = groupByFile(results);
      // Exclude files that already appear in content results
      const contentFilePaths = new Set(grouped.map((g) => g.filePath));
      const filteredFileNames = fileNames.filter(
        (f) => !contentFilePaths.has(`${rootPath}/${f}`),
      );

      set({
        results,
        groupedResults: grouped,
        fileNameResults: filteredFileNames,
        totalMatches: results.length,
        totalFiles: grouped.length,
      });
    } catch (e) {
      console.error("[search] failed:", e);
      set({ results: [], groupedResults: [], fileNameResults: [], totalMatches: 0, totalFiles: 0 });
    } finally {
      set({ isSearching: false });
    }
  },

  clearResults: () =>
    set({
      query: "",
      results: [],
      groupedResults: [],
      fileNameResults: [],
      totalMatches: 0,
      totalFiles: 0,
    }),
}));
