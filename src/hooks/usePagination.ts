import { useMemo, useState, useCallback } from 'react';

const PAGE_SIZE = 30;

export function usePagination<T>(items: T[], pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(0);

  // Reset page when items change significantly
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  const currentPage = Math.min(page, totalPages - 1);

  const paginatedItems = useMemo(
    () => items.slice(0, (currentPage + 1) * pageSize),
    [items, currentPage, pageSize],
  );

  const hasMore = (currentPage + 1) * pageSize < items.length;

  const loadMore = useCallback(() => {
    setPage((p) => p + 1);
  }, []);

  const resetPage = useCallback(() => {
    setPage(0);
  }, []);

  return { paginatedItems, hasMore, loadMore, resetPage, totalItems: items.length, showing: paginatedItems.length };
}
