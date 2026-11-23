import { useEffect, useRef } from "react";

/** Only a change of filters/access scope resets pagination, never a page click. */
export function useTreatmentCyclesPageLoad({
  page,
  filterScope,
  setPage,
  loadData,
}: {
  page: number;
  filterScope: string;
  setPage: (page: number) => void;
  loadData: (silent: boolean) => Promise<void>;
}) {
  const previousScope = useRef(filterScope);
  const firstLoad = useRef(true);

  useEffect(() => {
    if (previousScope.current !== filterScope) {
      previousScope.current = filterScope;
      if (page !== 1) {
        setPage(1);
        return;
      }
    }

    // Keep the current list visible during pagination, filters and refreshes.
    const silent = !firstLoad.current;
    firstLoad.current = false;
    void loadData(silent);
  }, [page, filterScope, setPage, loadData]);
}
