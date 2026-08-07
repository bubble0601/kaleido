import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

/** サーバーの files-changed イベントで全サーバー状態を再取得する */
export function useSse() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const source = new EventSource('/api/events');
    const onFilesChanged = () => {
      void queryClient.invalidateQueries();
    };
    source.addEventListener('files-changed', onFilesChanged);
    return () => {
      source.removeEventListener('files-changed', onFilesChanged);
      source.close();
    };
  }, [queryClient]);
}
