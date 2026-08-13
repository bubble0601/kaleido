import { useCallback, useEffect, useState } from 'react';

const WIDTH_KEY = 'kaleido-sidebar-width';
const COLLAPSED_KEY = 'kaleido-sidebar-collapsed';
const MIN_WIDTH = 160;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 288;
/** これより狭くドラッグしたら折り畳む (VSCode 風) */
const COLLAPSE_THRESHOLD = 100;

export function useSidebarResize() {
  const [width, setWidth] = useState(() => {
    const stored = parseInt(localStorage.getItem(WIDTH_KEY) ?? '', 10);
    return Number.isFinite(stored) ? Math.min(Math.max(stored, MIN_WIDTH), MAX_WIDTH) : DEFAULT_WIDTH;
  });
  const [isCollapsed, setIsCollapsed] = useState(
    () => localStorage.getItem(COLLAPSED_KEY) === '1',
  );

  useEffect(() => {
    localStorage.setItem(WIDTH_KEY, String(width));
    localStorage.setItem(COLLAPSED_KEY, isCollapsed ? '1' : '0');
  }, [width, isCollapsed]);

  const toggle = useCallback(() => setIsCollapsed((prev) => !prev), []);

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = isCollapsed ? 0 : width;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMove = (ev: MouseEvent) => {
        const next = startWidth + (ev.clientX - startX);
        if (next < COLLAPSE_THRESHOLD) {
          setIsCollapsed(true);
        } else {
          setIsCollapsed(false);
          setWidth(Math.min(Math.max(next, MIN_WIDTH), MAX_WIDTH));
        }
      };
      const onUp = () => {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', onMove);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp, { once: true });
    },
    [isCollapsed, width],
  );

  return { width, isCollapsed, toggle, startResize };
}
