import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';

/** サーバー状態をすべて取り直す */
export function useRefreshAll(): () => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    await queryClient.invalidateQueries();
  }, [queryClient]);
}

/**
 * タブが再び表示されたときに取り直す。
 * 見ていない間に git 操作やリモートの更新が入っていることがあるため。
 */
export function useRefreshOnVisible(): void {
  const refreshAll = useRefreshAll();
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refreshAll();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [refreshAll]);
}
