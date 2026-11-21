import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { defaultRangeExtractor, useVirtualizer, type Range } from "@tanstack/react-virtual";

type Props<T> = {
  items: readonly T[];
  estimateSize: number;
  threshold: number;
  label: string;
  grid?: boolean;
  renderItem: (item: T, index: number, onOverlayChange: (id: string, open: boolean) => void) => ReactNode;
};

const getColumns = () => window.matchMedia?.("(min-width: 1280px)")?.matches ? 3
  : window.matchMedia?.("(min-width: 768px)")?.matches ? 2 : 1;

export function OperationalVirtualList<T extends { id: string }>({
  items, estimateSize, threshold, label, grid = false, renderItem,
}: Props<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const [columns, setColumns] = useState(1);
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [focusedItem, setFocusedItem] = useState<string | null>(null);
  const virtual = items.length > threshold && viewport !== null;
  const layout = grid ? "grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" : "space-y-2";

  const measureOffset = useCallback(() => {
    const list = listRef.current;
    if (!list || !viewport) return;
    setScrollMargin(list.getBoundingClientRect().top - viewport.getBoundingClientRect().top - viewport.clientTop + viewport.scrollTop);
  }, [viewport]);

  useLayoutEffect(() => {
    setViewport(listRef.current?.closest("main") ?? null);
  }, []);

  useLayoutEffect(() => {
    measureOffset();
  });

  useLayoutEffect(() => {
    function resize() {
      if (grid) setColumns(getColumns());
      measureOffset();
    }
    resize();
    window.addEventListener("resize", resize);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measureOffset);
    if (viewport) observer?.observe(viewport);
    if (listRef.current?.parentElement) observer?.observe(listRef.current.parentElement);
    return () => {
      window.removeEventListener("resize", resize);
      observer?.disconnect();
    };
  }, [grid, measureOffset, viewport]);

  const rowKeys = useMemo(() => Array.from({ length: Math.ceil(items.length / columns) }, (_, row) =>
    JSON.stringify(items.slice(row * columns, (row + 1) * columns).map(item => item.id))
  ), [items, columns]);

  const getItemKey = useCallback((index: number) => rowKeys[index], [rowKeys]);
  const rangeExtractor = useCallback((range: Range) => {
    const visible = defaultRangeExtractor(range);
    const retained = [openItem, focusedItem].filter(Boolean).map(
      id => items.findIndex(item => item.id === id),
    );
    for (const index of retained) {
      const row = Math.floor(index / columns);
      if (row >= 0 && !visible.includes(row)) visible.push(row);
    }
    return visible.sort((a, b) => a - b);
  }, [items, columns, openItem, focusedItem]);

  const virtualizer = useVirtualizer({
    enabled: virtual,
    count: rowKeys.length,
    getScrollElement: () => viewport,
    getItemKey,
    estimateSize: () => estimateSize,
    overscan: 5,
    gap: grid ? 12 : 8,
    scrollMargin,
    rangeExtractor,
  });

  const handleOverlayChange = useCallback((id: string, open: boolean) => {
    setOpenItem(current => open ? id : current === id ? null : current);
  }, []);

  function renderCard(item: T, index: number) {
    return <div key={item.id} onFocusCapture={() => setFocusedItem(item.id)}
      onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocusedItem(current => current === item.id ? null : current);
        }
      }}>
      {renderItem(item, index, handleOverlayChange)}
    </div>;
  }

  return (
    <div ref={listRef} aria-label={label} role="region" style={{ overflowAnchor: virtual ? "none" : undefined }}>
      {virtual ? (
        <div style={{ position: "relative", height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map(row => (
            <div key={row.key} ref={virtualizer.measureElement} data-index={row.index}
              className={grid ? layout : undefined}
              style={{ position: "absolute", width: "100%", top: row.start - scrollMargin }}>
              {items.slice(row.index * columns, (row.index + 1) * columns).map(
                (item, column) => renderCard(item, row.index * columns + column),
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className={layout}>
          {items.map((item, index) => renderCard(item, index))}
        </div>
      )}
    </div>
  );
}
