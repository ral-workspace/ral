import { create } from "zustand";

interface LayoutState {
  showSidebar: boolean;
  showBottomPanel: boolean;
  showSidePanel: boolean;
  sidebarView: string;
  fileTreeRefreshKey: number;
  toggleSidebar: () => void;
  toggleBottomPanel: () => void;
  toggleSidePanel: () => void;
  setShowBottomPanel: (show: boolean) => void;
  setSidebarView: (view: string) => void;
  bumpFileTreeRefresh: () => void;
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
}));
