/**
 * useDebouncedValue — devuelve un valor "debounced" que solo se actualiza
 * después de que el input deje de cambiar durante `delay` ms.
 *
 * Útil para inputs de búsqueda: evita recalcular filtros / hacer queries
 * en cada keystroke. Por defecto delay=200ms (suficiente para UX fluida
 * sin lag visible en listas grandes).
 *
 * Ejemplo:
 *   const [search, setSearch] = useState("");
 *   const debouncedSearch = useDebouncedValue(search, 200);
 *   const filtered = useMemo(
 *     () => list.filter((x) => x.name.includes(debouncedSearch)),
 *     [list, debouncedSearch]
 *   );
 */
import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
}
