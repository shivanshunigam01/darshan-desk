import { useEffect, useRef } from 'react';

export function useDebouncedAutosave({ enabled, deps, onSave, delayMs = 1800 }) {
  const first = useRef(true);
  const saving = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (first.current) {
      first.current = false;
      return;
    }
    const handle = setTimeout(async () => {
      if (saving.current) return;
      saving.current = true;
      try {
        await onSave({ silent: true });
      } finally {
        saving.current = false;
      }
    }, delayMs);
    return () => clearTimeout(handle);
  }, deps);
}