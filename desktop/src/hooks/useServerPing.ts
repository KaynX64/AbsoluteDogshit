// desktop/src/hooks/useServerPing.ts
//
// Continuously pings the backend and returns live latency telemetry.
// Also fires `window.dispatchEvent('server-ping', ...)` on every sample
// so other components (e.g. the top-bar Online pill) can react.

import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../config/api';

export interface PingSample {
  ms: number;      // round-trip latency in ms; -1 when the request failed
  ok: boolean;
  at: number;      // epoch ms
}

export interface ServerPingStats {
  samples: PingSample[];
  current: PingSample | null;
  avg: number;
  min: number;
  max: number;
  jitter: number;       // mean absolute deviation, in ms
  packetLoss: number;   // 0–100
  paused: boolean;
  setPaused: (v: boolean) => void;
  pingNow: () => void;
}

export function useServerPing(
  intervalMs = 5000,
  maxSamples = 40
): ServerPingStats {
  const [samples, setSamples] = useState<PingSample[]>([]);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef(false);

  const pingOnce = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    const started = performance.now();
    let ok = false;
    try {
      const res = await fetch(`${API_BASE_URL}/api/ping`, {
        cache: 'no-store',
        // Abort hung requests so a stalled server doesn't
        // freeze the interval at "99999ms".
        signal: AbortSignal.timeout(4000),
      });
      ok = res.ok;
    } catch {
      ok = false;
    }

    const ms = Math.round(performance.now() - started);
    const sample: PingSample = { ms: ok ? ms : -1, ok, at: Date.now() };

    setSamples((prev) => {
      const next = [...prev, sample];
      return next.length > maxSamples ? next.slice(next.length - maxSamples) : next;
    });

    window.dispatchEvent(new CustomEvent('server-ping', { detail: sample }));
    inFlightRef.current = false;
  };

  useEffect(() => {
    if (paused) return;
    pingOnce();
    timerRef.current = setInterval(pingOnce, intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, intervalMs]);

  const okSamples = samples.filter((s) => s.ok);
  const current = samples.length > 0 ? samples[samples.length - 1] : null;
  const avg =
    okSamples.length > 0
      ? Math.round(okSamples.reduce((a, s) => a + s.ms, 0) / okSamples.length)
      : 0;
  const min = okSamples.length > 0 ? Math.min(...okSamples.map((s) => s.ms)) : 0;
  const max = okSamples.length > 0 ? Math.max(...okSamples.map((s) => s.ms)) : 0;
  const jitter =
    okSamples.length > 1
      ? Math.round(
          okSamples.reduce((acc, s) => acc + Math.abs(s.ms - avg), 0) / okSamples.length
        )
      : 0;
  const packetLoss =
    samples.length > 0
      ? Math.round(((samples.length - okSamples.length) / samples.length) * 100)
      : 0;

  return { samples, current, avg, min, max, jitter, packetLoss, paused, setPaused, pingNow: pingOnce };
}