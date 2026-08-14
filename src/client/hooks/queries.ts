import { useQuery } from '@tanstack/react-query';

import type { DiffFileMeta, FileContentResponse, RangeSpec } from '../../shared/types';
import { api } from '../services/api';

const TS_FILE_PATTERN = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

export function useMeta() {
  return useQuery({ queryKey: ['meta'], queryFn: api.getMeta, staleTime: Infinity });
}

export function useRanges(isEnabled = true) {
  return useQuery({
    queryKey: ['ranges'],
    queryFn: api.getRanges,
    enabled: isEnabled,
    staleTime: 30_000,
  });
}

/** ルート配下の全ファイル (Files タブ / Quick Open で共有) */
export function useAllFiles(isEnabled = true) {
  return useQuery({
    queryKey: ['files'],
    queryFn: api.getFiles,
    enabled: isEnabled,
    staleTime: 30_000,
  });
}

/** Docs タブ用の一覧 (gitignore されたものも含み、更新日時付き) */
export function useDocFiles(isEnabled = true) {
  return useQuery({
    queryKey: ['docs'],
    queryFn: api.getDocs,
    enabled: isEnabled,
    staleTime: 30_000,
  });
}

export function useDiff(range: RangeSpec | null) {
  return useQuery({
    queryKey: ['diff', range],
    queryFn: () => api.getDiff(range!),
    enabled: range !== null,
  });
}

export function useFileContent(range: RangeSpec | null, file: DiffFileMeta | null) {
  return useQuery({
    queryKey: ['file', range, file?.path, file?.contentHash],
    queryFn: () => api.getFile(range!, file!),
    enabled: range !== null && file !== null && !file.isBinary,
    staleTime: 60_000,
  });
}

/**
 * ESLint はディスク上のファイルに対して実行されるため、
 * working tree を見ている範囲 (working / staged / '.' / browse) のときのみ有効。
 */
export function useLint(range: RangeSpec | null, files: DiffFileMeta[]) {
  const isWorkingTreeRange =
    range !== null &&
    (range.target === 'working' ||
      range.target === 'staged' ||
      range.target === '.' ||
      range.target === 'browse');
  const paths = files.filter((f) => TS_FILE_PATTERN.test(f.path) && f.status !== 'deleted').map((f) => f.path);
  return useQuery({
    queryKey: ['lint', paths, files.map((f) => f.contentHash).join(',')],
    queryFn: () => api.getLint(paths),
    enabled: isWorkingTreeRange && paths.length > 0,
    staleTime: 30_000,
  });
}

export function useTsDiagnostics(
  file: DiffFileMeta | null,
  contents: FileContentResponse | undefined,
) {
  const modified = contents?.modified ?? null;
  const isSupported = file !== null && TS_FILE_PATTERN.test(file.path);
  return useQuery({
    queryKey: ['ts-diag', file?.path, file?.contentHash],
    queryFn: () =>
      api.getTsDiagnostics(
        file!.path,
        modified!.ref === 'working' ? undefined : modified!.content,
      ),
    enabled: isSupported && modified !== null && !contents?.isTooLarge,
    staleTime: 30_000,
  });
}
