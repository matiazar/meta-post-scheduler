'use client';

import { useCallback, useEffect, useState } from 'react';

interface State<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/**
 * Carga datos de la API al montar y permite recargarlos. `load` tiene que ser una
 * funcion estable (de modulo o con useCallback), si no se recarga en cada render.
 */
export function useApiData<T>(load: () => Promise<T>) {
  const [state, setState] = useState<State<T>>({
    data: null,
    error: null,
    loading: true,
  });

  const refresh = useCallback(async () => {
    try {
      const data = await load();
      setState({ data, error: null, loading: false });
    } catch (error) {
      setState((current) => ({
        ...current,
        error:
          error instanceof Error
            ? error.message
            : 'No se pudieron cargar los datos',
        loading: false,
      }));
    }
  }, [load]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...state, refresh };
}
