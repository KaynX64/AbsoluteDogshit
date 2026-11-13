import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../../config/api';

type HistoryPage = { records: any[]; nextCursor: string | null };
type HistoryState = HistoryPage & { patientId?: number; loading: boolean; error: boolean };
const emptyPage: HistoryPage = { records: [], nextCursor: null };

async function fetchHistoryPage(patientId: number, before: string | null, signal: AbortSignal): Promise<HistoryPage> {
  const params = new URLSearchParams({ limit: '25' });
  if (before) params.set('before', before);
  const token = localStorage.getItem('valetudo_token');
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/appointments/patient/${patientId}/history?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
    if (response.status >= 500) throw new Error('History service unavailable');
  } catch (error) {
    if (!before && !signal.aborted && window.electronAPI?.offlineGetEmrHistory) {
      return { records: await window.electronAPI.offlineGetEmrHistory(patientId), nextCursor: null };
    }
    throw error;
  }
  if (!response.ok) throw new Error('History request failed');
  const page = await response.json();
  if (Array.isArray(page)) return { records: page, nextCursor: null };
  if (!Array.isArray(page?.records) || (page.nextCursor !== null && typeof page.nextCursor !== 'string')) {
    throw new Error('Invalid history response');
  }
  return page;
}

export function usePatientHistory(patientId?: number) {
  const request = useRef<AbortController | null>(null);
  const [state, setState] = useState<HistoryState>({ ...emptyPage, loading: false, error: false });

  const load = useCallback(async (before: string | null = null) => {
    if (patientId === undefined) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState((current) => ({ ...(before ? current : emptyPage), patientId, loading: true, error: false }));
    try {
      const page = await fetchHistoryPage(patientId, before, controller.signal);
      if (controller.signal.aborted) return;
      setState((current) => ({
        ...page,
        records: before ? [...current.records, ...page.records] : page.records,
        patientId,
        loading: false,
        error: false,
      }));
    } catch {
      if (!controller.signal.aborted) setState((current) => ({ ...current, loading: false, error: true }));
    }
  }, [patientId]);

  useEffect(() => {
    void load();
    return () => request.current?.abort();
  }, [load]);

  const current = state.patientId === patientId ? state : { ...emptyPage, loading: true, error: false };
  return { ...current, loadMore: () => void load(current.nextCursor) };
}
