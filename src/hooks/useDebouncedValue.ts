import { useEffect, useState } from 'react';

/**
 * Retorna o valor após `delay` ms sem novas alterações.
 * Usado para evitar refetch a cada tecla/pick em inputs de data.
 */
export function useDebouncedValue<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
}

export default useDebouncedValue;
