import { create } from 'zustand';

import type { RangeSpec } from '../../shared/types';

export interface RevealTarget {
  path: string;
  line: number;
  column: number;
}

export type ViewMode = 'split' | 'inline' | 'file';
export type Theme = 'light' | 'dark';
/** サイドバーの表示内容: 比較対象のファイル / ルート配下の全ファイル / 読み物 (md・html) */
export type SidebarTab = 'changes' | 'files' | 'docs';
/** プレビュー可能なファイルの見せ方 */
export type PreviewMode = 'source' | 'split' | 'preview';

const THEME_STORAGE_KEY = 'kaleido-theme';

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

interface UiState {
  range: RangeSpec | null;
  selectedPath: string | null;
  /** diff 外のファイルを開いているときのパス (Quick Open から) */
  browsePath: string | null;
  /** ファイルを開いた後にスクロールする位置 (Go to Definition から) */
  pendingReveal: RevealTarget | null;
  viewMode: ViewMode;
  sidebarTab: SidebarTab;
  /** 直近でファイルを開いた経路。プレビューの既定モードを決めるのに使う (タブ以外からなら null) */
  openedFrom: SidebarTab | null;
  /** null のときは開いた経路に応じた既定を使う (ファイルを切り替えると null に戻る) */
  previewMode: PreviewMode | null;
  theme: Theme;
  setRange: (range: RangeSpec) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  setOpenedFrom: (tab: SidebarTab | null) => void;
  setPreviewMode: (mode: PreviewMode | null) => void;
  setSelectedPath: (path: string | null) => void;
  setBrowsePath: (path: string | null) => void;
  setPendingReveal: (target: RevealTarget | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setTheme: (theme: Theme) => void;
}

export const useUiStore = create<UiState>((set) => ({
  range: null,
  selectedPath: null,
  browsePath: null,
  pendingReveal: null,
  viewMode: 'split',
  sidebarTab: 'changes',
  openedFrom: null,
  previewMode: null,
  theme: getInitialTheme(),
  setRange: (range) => set({ range, selectedPath: null, browsePath: null }),
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
  setOpenedFrom: (openedFrom) => set({ openedFrom }),
  setPreviewMode: (previewMode) => set({ previewMode }),
  setSelectedPath: (selectedPath) => set({ selectedPath, browsePath: null }),
  setBrowsePath: (browsePath) => set({ browsePath }),
  setPendingReveal: (pendingReveal) => set({ pendingReveal }),
  setViewMode: (viewMode) => set({ viewMode }),
  setTheme: (theme) => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    set({ theme });
  },
}));
