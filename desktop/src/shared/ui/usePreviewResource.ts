import { useEffect, useRef } from 'react';

export function usePreviewResource() {
  const pending = useRef<AbortController | null>(null);
  const url = useRef<string | null>(null);

  function clear() {
    pending.current?.abort();
    pending.current = null;
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
  }

  useEffect(() => clear, []);

  function begin() {
    pending.current?.abort();
    pending.current = new AbortController();
    return pending.current.signal;
  }

  function publish(blob: Blob, signal: AbortSignal) {
    if (signal.aborted) return null;
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = URL.createObjectURL(blob);
    return url.current;
  }

  return { begin, publish, clear };
}
