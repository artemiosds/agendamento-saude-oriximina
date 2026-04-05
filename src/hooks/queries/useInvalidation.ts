import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { queryKeys } from './queryKeys';

type EntityName = keyof typeof queryKeys;

/**
 * Hook that provides easy cache invalidation for any entity.
 * Call after any Supabase mutation to keep TanStack Query in sync.
 */
export function useInvalidation() {
  const queryClient = useQueryClient();

  const invalidate = useCallback(
    (...entities: EntityName[]) => {
      entities.forEach((entity) => {
        const keyGroup = queryKeys[entity];
        if ('all' in keyGroup) {
          queryClient.invalidateQueries({ queryKey: keyGroup.all });
        }
        // Also invalidate sub-keys
        Object.values(keyGroup).forEach((key) => {
          if (Array.isArray(key)) {
            queryClient.invalidateQueries({ queryKey: key });
          }
        });
      });
    },
    [queryClient],
  );

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries();
  }, [queryClient]);

  return { invalidate, invalidateAll };
}
