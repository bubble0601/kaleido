import type {
  Comment,
  CommentCreateRequest,
  DiffFileMeta,
  DiffResponse,
  FileContentResponse,
  HoverRequest,
  HoverResponse,
  MetaResponse,
  RangeSpec,
  RangesResponse,
  DefinitionLocation,
  Diagnostic,
  LintResponse,
  ViewedState,
} from '../../shared/types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // JSONでないエラーレスポンスはそのまま
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

function rangeParams(range: RangeSpec): URLSearchParams {
  const params = new URLSearchParams({ target: range.target, base: range.base });
  if (range.baseMode) params.set('baseMode', range.baseMode);
  return params;
}

export const api = {
  getMeta: () => request<MetaResponse>('/api/meta'),

  getRanges: () => request<RangesResponse>('/api/ranges'),

  getRepoFiles: () => request<{ paths: string[] }>('/api/files'),

  saveFile: (path: string, content: string) =>
    request<{ ok: boolean }>('/api/file/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    }),

  getDiff: (range: RangeSpec) => request<DiffResponse>(`/api/diff?${rangeParams(range)}`),

  getFile: (range: RangeSpec, file: DiffFileMeta) => {
    const params = rangeParams(range);
    params.set('path', file.path);
    params.set('status', file.status);
    if (file.oldPath) params.set('oldPath', file.oldPath);
    return request<FileContentResponse>(`/api/file?${params}`);
  },

  hover: (body: HoverRequest, signal?: AbortSignal) =>
    request<HoverResponse | null>('/api/lang/hover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    }),

  getDefinition: (
    body: { path: string; line: number; column: number; content?: string },
    signal?: AbortSignal,
  ) =>
    request<DefinitionLocation[]>('/api/lang/definition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    }),

  getReferences: (
    body: { path: string; line: number; column: number; content?: string },
    signal?: AbortSignal,
  ) =>
    request<DefinitionLocation[]>('/api/lang/references', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    }),

  getTsDiagnostics: (path: string, content?: string) =>
    request<Diagnostic[]>('/api/lang/diagnostics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    }),

  getLint: (paths: string[]) =>
    request<LintResponse>('/api/lint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths }),
    }),

  getComments: (range: RangeSpec) => request<Comment[]>(`/api/comments?${rangeParams(range)}`),

  createComment: (range: RangeSpec, body: CommentCreateRequest) =>
    request<Comment>(`/api/comments?${rangeParams(range)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  updateComment: (range: RangeSpec, id: string, body: { body: string }) =>
    request<Comment>(`/api/comments/${id}?${rangeParams(range)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  deleteComment: (range: RangeSpec, id: string) =>
    request<{ ok: boolean }>(`/api/comments/${id}?${rangeParams(range)}`, { method: 'DELETE' }),

  clearComments: (range: RangeSpec) =>
    request<{ comments: Comment[] }>(`/api/comments?${rangeParams(range)}`, { method: 'DELETE' }),

  restoreComments: (range: RangeSpec, comments: Comment[]) =>
    request<{ ok: boolean }>(`/api/comments/restore?${rangeParams(range)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comments }),
    }),

  getViewed: () => request<ViewedState>('/api/viewed'),

  setViewed: (path: string, hash: string, isViewed: boolean) =>
    request<{ ok: boolean }>('/api/viewed', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, hash, viewed: isViewed }),
    }),
};
