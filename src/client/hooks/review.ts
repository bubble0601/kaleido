import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { CommentCreateRequest, DiffFileMeta, RangeSpec } from '../../shared/types';
import { api } from '../services/api';

export function useComments(range: RangeSpec | null) {
  const queryClient = useQueryClient();
  const queryKey = ['comments', range];

  const query = useQuery({
    queryKey,
    queryFn: () => api.getComments(range!),
    enabled: range !== null,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['comments'] });

  const create = useMutation({
    mutationFn: (body: CommentCreateRequest) => api.createComment(range!, body),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: (params: { id: string; body: string }) =>
      api.updateComment(range!, params.id, { body: params.body }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteComment(range!, id),
    onSuccess: invalidate,
  });

  return { query, create, update, remove };
}

export function useViewed() {
  const queryClient = useQueryClient();

  const query = useQuery({ queryKey: ['viewed'], queryFn: api.getViewed });

  const toggle = useMutation({
    mutationFn: (params: { file: DiffFileMeta; isViewed: boolean }) =>
      api.setViewed(params.file.path, params.file.contentHash, params.isViewed),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['viewed'] }),
  });

  return { query, toggle };
}

/** 保存された hash が現在の diff 内容と一致するファイルだけを viewed とみなす */
export function computeViewedPaths(
  files: DiffFileMeta[],
  entries: Record<string, { hash: string }> | undefined,
): Set<string> {
  const result = new Set<string>();
  if (!entries) return result;
  for (const file of files) {
    if (entries[file.path]?.hash === file.contentHash) {
      result.add(file.path);
    }
  }
  return result;
}
