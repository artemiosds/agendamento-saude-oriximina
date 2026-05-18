import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

interface VirtualListProps<T> {
  items: T[];
  /** Approximate row height in px. Real rows can be taller — virtualizer measures. */
  estimateSize?: number;
  /** Extra rows rendered above/below viewport. Lower on weak devices. */
  overscan?: number;
  /** Max viewport height. Defaults to 600px. */
  maxHeight?: number | string;
  className?: string;
  /** Optional stable key extractor. */
  getKey?: (item: T, index: number) => string | number;
  children: (item: T, index: number) => React.ReactNode;
}

/**
 * Tiny virtualization wrapper around @tanstack/react-virtual.
 *
 * Use for any list with > ~30 rows to keep DOM small on weak hardware.
 * Non-virtualized fallback for < 30 items so layout/CSS stays unchanged.
 */
export function VirtualList<T>({
  items,
  estimateSize = 72,
  overscan = 6,
  maxHeight = 600,
  className,
  getKey,
  children,
}: VirtualListProps<T>) {
  const parentRef = React.useRef<HTMLDivElement>(null);

  // Cheap fallback — no virtualization for tiny lists.
  if (items.length <= 30) {
    return (
      <div className={className}>
        {items.map((item, i) => (
          <React.Fragment key={getKey ? getKey(item, i) : i}>{children(item, i)}</React.Fragment>
        ))}
      </div>
    );
  }

  const virt = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  return (
    <div
      ref={parentRef}
      className={className}
      style={{ maxHeight, overflow: "auto", contain: "strict" }}
    >
      <div style={{ height: virt.getTotalSize(), position: "relative", width: "100%" }}>
        {virt.getVirtualItems().map((row) => {
          const item = items[row.index];
          return (
            <div
              key={getKey ? getKey(item, row.index) : row.key}
              data-index={row.index}
              ref={virt.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${row.start}px)`,
              }}
            >
              {children(item, row.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default VirtualList;
