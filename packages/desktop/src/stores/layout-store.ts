import { create } from "zustand";

interface LayoutState {
  showSidebar: boolean;
  showBottomPanel: boolean;
  showSidePanel: boolean;
  sidebarView: string;
  fileTreeRefreshKey: number;
  expandedPaths: Set<string>;
  toggleSidebar: () => void;
  toggleBottomPanel: () => void;
  toggleSidePanel: () => void;
  setShowBottomPanel: (show: boolean) => void;
  setSidebarView: (view: string) => void;
  bumpFileTreeRefresh: () => void;
  toggleExpanded: (path: string) => void;
  setExpanded: (path: string, expanded: boolean) => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  showSidebar: true,
  showBottomPanel: false,
  showSidePanel: false,
  sidebarView: "explorer",
  fileTreeRefreshKey: 0,
  toggleSidebar: () => set((s) => ({ showSidebar: !s.showSidebar })),
  toggleBottomPanel: () => set((s) => ({ showBottomPanel: !s.showBottomPanel })),
  toggleSidePanel: () => set((s) => ({ showSidePanel: !s.showSidePanel })),
  setShowBottomPanel: (show) => set({ showBottomPanel: show }),
  setSidebarView: (view) => set({ sidebarView: view, showSidebar: true }),
  bumpFileTreeRefresh: () => set((s) => ({ fileTreeRefreshKey: s.fileTreeRefreshKey + 1 })),
  expandedPaths: new Set<string>(),
  toggleExpanded: (path) =>
    set((s) => {
      const next = new Set(s.expandedPaths);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return { expandedPaths: next };
    }),
  setExpanded: (path, expanded) =>
    set((s) => {
      if (expanded === s.expandedPaths.has(path)) return s;
      const next = new Set(s.expandedPaths);
      if (expanded) next.add(path);
      else next.delete(path);
      return { expandedPaths: next };
    }),
}));
