import { create } from 'zustand';

import type { RangeSpec } from '../../shared/types';

export type ViewMode = 'split' | 'inline' | 'file';
export type Theme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'kaleido-theme';

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

interface UiState {
  range: RangeSpec | null;
  selectedPath: string | null;
  viewMode: ViewMode;
  theme: Theme;
  setRange: (range: RangeSpec) => void;
  setSelectedPath: (path: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setTheme: (theme: Theme) => void;
}

export const useUiStore = create<UiState>((set) => ({
  range: null,
  selectedPath: null,
  viewMode: 'split',
  theme: getInitialTheme(),
  setRange: (range) => set({ range, selectedPath: null }),
  setSelectedPath: (selectedPath) => set({ selectedPath }),
  setViewMode: (viewMode) => set({ viewMode }),
  setTheme: (theme) => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    set({ theme });
  },
}));
