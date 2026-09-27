/** Monotonic request identity used to ignore results that no longer match the UI. */
export interface RequestGeneration {
  next: () => number;
  isCurrent: (requestId: number) => boolean;
  invalidate: () => void;
}

export function createRequestGeneration(): RequestGeneration {
  let generation = 0;

  return {
    next: () => ++generation,
    isCurrent: (requestId: number) => requestId === generation,
    invalidate: () => {
      generation += 1;
    },
  };
}

export function isRequestCurrent(
  generation: RequestGeneration,
  requestId: number,
  requestScope: string,
  currentScope: string,
) {
  return generation.isCurrent(requestId) && requestScope === currentScope;
}
