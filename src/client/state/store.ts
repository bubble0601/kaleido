import { create } from 'zustand';

import type { RangeSpec } from '../../shared/types';

export type ViewMode = 'split' | 'inline' | 'file';

interface UiState {
  range: RangeSpec | null;
  selectedPath: string | null;
  viewMode: ViewMode;
  setRange: (range: RangeSpec) => void;
  setSelectedPath: (path: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
}

export const useUiStore = create<UiState>((set) => ({
  range: null,
  selectedPath: null,
  viewMode: 'split',
  setRange: (range) => set({ range, selectedPath: null }),
  setSelectedPath: (selectedPath) => set({ selectedPath }),
  setViewMode: (viewMode) => set({ viewMode }),
}));
