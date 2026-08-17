import { create } from 'zustand';

import type { RangeSpec } from '../../shared/types';

export interface RevealTarget {
  path: string;
  line: number;
  column: number;
}

export type ViewMode = 'split' | 'inline' | 'file';
/** 実際に適用される配色 */
export type Theme = 'light' | 'dark';
/** 設定として保持する配色。system は OS の設定に追従する */
export type ThemePreference = 'system' | 'light' | 'dark';
/** サイドバーの表示内容: 比較対象のファイル / ルート配下の全ファイル / 読み物 (md・html) */
export type SidebarTab = 'changes' | 'files' | 'docs';
/** プレビュー可能なファイルの見せ方 */
export type PreviewMode = 'source' | 'split' | 'preview';
/** Docs の並び順 */
export type DocsSort = 'mtime' | 'name';

const DOCS_SORT_STORAGE_KEY = 'kaleido-docs-sort';

function getInitialDocsSort(): DocsSort {
  return localStorage.getItem(DOCS_SORT_STORAGE_KEY) === 'name' ? 'name' : 'mtime';
}

const THEME_STORAGE_KEY = 'kaleido-theme';

export const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)';

function getInitialThemePreference(): ThemePreference {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'system';
}

export function resolveTheme(preference: ThemePreference): Theme {
  if (preference !== 'system') return preference;
  return matchMedia(SYSTEM_DARK_QUERY).matches ? 'dark' : 'light';
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
  /** Docs の並び順 (既定は更新日時の新しい順) */
  docsSort: DocsSort;
  /** 設定として保持している値 */
  themePreference: ThemePreference;
  /** 実際に適用する配色 (system のときは OS の設定から解決したもの) */
  theme: Theme;
  isSettingsOpen: boolean;
  setRange: (range: RangeSpec) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  setOpenedFrom: (tab: SidebarTab | null) => void;
  setPreviewMode: (mode: PreviewMode | null) => void;
  setDocsSort: (sort: DocsSort) => void;
  setSelectedPath: (path: string | null) => void;
  setBrowsePath: (path: string | null) => void;
  setPendingReveal: (target: RevealTarget | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setThemePreference: (preference: ThemePreference) => void;
  /** OS 側の配色が変わったときに呼ぶ (system のときだけ効く) */
  syncSystemTheme: () => void;
  setSettingsOpen: (isOpen: boolean) => void;
}

const initialThemePreference = getInitialThemePreference();

export const useUiStore = create<UiState>((set, get) => ({
  range: null,
  selectedPath: null,
  browsePath: null,
  pendingReveal: null,
  viewMode: 'split',
  sidebarTab: 'changes',
  openedFrom: null,
  previewMode: null,
  docsSort: getInitialDocsSort(),
  themePreference: initialThemePreference,
  theme: resolveTheme(initialThemePreference),
  isSettingsOpen: false,
  setRange: (range) => set({ range, selectedPath: null, browsePath: null }),
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
  setOpenedFrom: (openedFrom) => set({ openedFrom }),
  setPreviewMode: (previewMode) => set({ previewMode }),
  setDocsSort: (docsSort) => {
    localStorage.setItem(DOCS_SORT_STORAGE_KEY, docsSort);
    set({ docsSort });
  },
  setSelectedPath: (selectedPath) => set({ selectedPath, browsePath: null }),
  setBrowsePath: (browsePath) => set({ browsePath }),
  setPendingReveal: (pendingReveal) => set({ pendingReveal }),
  setViewMode: (viewMode) => set({ viewMode }),
  setThemePreference: (themePreference) => {
    localStorage.setItem(THEME_STORAGE_KEY, themePreference);
    set({ themePreference, theme: resolveTheme(themePreference) });
  },
  syncSystemTheme: () => {
    if (get().themePreference !== 'system') return;
    set({ theme: resolveTheme('system') });
  },
  setSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),
}));
