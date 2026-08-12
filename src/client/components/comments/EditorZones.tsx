import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type ICodeEditor = import('monaco-editor/editor/editor.api.js').editor.ICodeEditor;
type IViewZone = import('monaco-editor/editor/editor.api.js').editor.IViewZone;

export interface ZoneItem {
  key: string;
  afterLineNumber: number;
  element: React.ReactNode;
}

interface MountedZone {
  zoneId: string;
  zone: IViewZone;
  domNode: HTMLDivElement;
  inner: HTMLDivElement;
  observer: ResizeObserver;
}

/**
 * Monaco の ViewZone に React 要素を describe する汎用マネージャ。
 * - zone の高さは中身の実測値に追従させる (ResizeObserver → layoutZone)
 * - zone はスクロール可能なコンテンツ幅いっぱいに広がるため、中身は
 *   エディタの可視幅に固定し、横スクロールにも追従させる (translateX 相殺)
 */
export function EditorZones({ editor, items }: { editor: ICodeEditor | null; items: ZoneItem[] }) {
  const mountedRef = useRef(new Map<string, MountedZone>());
  const [portalTargets, setPortalTargets] = useState<Map<string, HTMLDivElement>>(new Map());

  const itemsSignature = items.map((i) => `${i.key}@${i.afterLineNumber}`).join('|');

  useEffect(() => {
    if (!editor) return;
    const mounted = mountedRef.current;

    editor.changeViewZones((accessor) => {
      for (const [key, entry] of mounted) {
        if (!items.some((i) => i.key === key && i.afterLineNumber === entry.zone.afterLineNumber)) {
          accessor.removeZone(entry.zoneId);
          entry.observer.disconnect();
          mounted.delete(key);
        }
      }
      for (const item of items) {
        if (mounted.has(item.key)) continue;
        const domNode = document.createElement('div');
        domNode.style.pointerEvents = 'auto';
        domNode.style.zIndex = '10';
        const inner = document.createElement('div');
        domNode.appendChild(inner);

        const zone: IViewZone = {
          afterLineNumber: item.afterLineNumber,
          heightInPx: 80,
          domNode,
          suppressMouseDown: false,
        };
        const zoneId = accessor.addZone(zone);

        const observer = new ResizeObserver(() => {
          const height = inner.offsetHeight;
          if (height > 0 && height !== zone.heightInPx) {
            zone.heightInPx = height;
            editor.changeViewZones((a) => a.layoutZone(zoneId));
          }
        });
        observer.observe(inner);

        mounted.set(item.key, { zoneId, zone, domNode, inner, observer });
      }
    });

    setPortalTargets(new Map([...mounted].map(([key, entry]) => [key, entry.inner])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, itemsSignature]);

  // 可視幅の固定と横スクロール相殺
  useEffect(() => {
    if (!editor) return;
    const applyLayout = () => {
      const layout = editor.getLayoutInfo();
      const visibleWidth = Math.max(
        0,
        layout.width - layout.contentLeft - layout.verticalScrollbarWidth,
      );
      const scrollLeft = editor.getScrollLeft();
      for (const entry of mountedRef.current.values()) {
        entry.inner.style.width = `${visibleWidth}px`;
        entry.inner.style.transform = `translateX(${scrollLeft}px)`;
      }
    };
    applyLayout();
    const layoutListener = editor.onDidLayoutChange(applyLayout);
    const scrollListener = editor.onDidScrollChange((e) => {
      if (e.scrollLeftChanged) applyLayout();
    });
    return () => {
      layoutListener.dispose();
      scrollListener.dispose();
    };
  }, [editor, itemsSignature]);


  useEffect(() => {
    return () => {
      const mounted = mountedRef.current;
      editor?.changeViewZones((accessor) => {
        for (const entry of mounted.values()) {
          accessor.removeZone(entry.zoneId);
          entry.observer.disconnect();
        }
      });
      mounted.clear();
    };
  }, [editor]);

  return (
    <>
      {items.map((item) => {
        const target = portalTargets.get(item.key);
        return target ? createPortal(item.element, target, item.key) : null;
      })}
    </>
  );
}
