import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToDesktopEvents, useDesktopSocket } from '../../platform/realtime/desktopRealtime';
import { RecordPageCache } from './RecordPageCache';
import { qualificationApi as api, QualificationError } from './qualificationApi';

type Snapshot = { overview: any; items: any[]; reviewers: any[]; cursor: number | null };
type DetailState = { id: number | null; row: any; loading: boolean; error: string };
const emptyDetail: DetailState = { id: null, row: null, loading: false, error: '' };
const denied = (error: any) => error instanceof QualificationError && [401, 403].includes(error.status);

/** Page-owned cache only: no qualification records or drafts enter browser storage. */
export function useQualificationRecords(selected: number | null) {
  const [cache] = useState(() => new RecordPageCache<any>());
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [refreshing, setRefreshing] = useState(false), [error, setError] = useState('');
  const [detail, setDetail] = useState<DetailState>(emptyDetail);
  const active = useRef(false), current = useRef(snapshot), selection = useRef(selected);
  const sequence = useRef(0), refreshFlight = useRef<Promise<void> | null>(null);
  const socket = useDesktopSocket();
  current.current = snapshot; selection.current = selected;

  const clearProtected = useCallback(() => {
    cache.clear(); setSnapshot(null); setDetail(emptyDetail);
  }, [cache]);
  const readOverview = useCallback(async (force = false) => {
    const data: Snapshot = await cache.read('overview', async signal => {
      const overview = await api('/me', 'GET', undefined, signal);
      const [queue, reviewers] = await Promise.all([
        overview.actor.admin || overview.actor.reviewer ? api('/applications', 'GET', undefined, signal) : { applications: [], nextCursor: null },
        overview.actor.admin ? api('/reviewers', 'GET', undefined, signal) : [],
      ]);
      return { overview, items: queue.applications, cursor: queue.nextCursor, reviewers };
    }, force);
    if (!active.current) return;
    const previous = current.current?.overview.actor;
    if (previous && ((previous.admin && !data.overview.actor.admin) || (previous.reviewer && !data.overview.actor.reviewer))) {
      cache.clear(); setDetail(emptyDetail);
    }
    current.current = data; setSnapshot(data);
  }, [cache]);

  const readDetail = useCallback(async (id: number, force = false) => {
    const key = 'detail:' + id, version = ++sequence.current;
    const saved = cache.peek(key);
    setDetail(previous => ({ id, row: previous.id === id ? previous.row : saved || null, loading: true, error: '' }));
    try {
      const row = await cache.read(key, signal => api(`/applications/${id}`, 'GET', undefined, signal), force);
      if (active.current && selection.current === id && sequence.current === version) setDetail({ id, row, loading: false, error: '' });
    } catch (err: any) {
      if (err.name === 'AbortError' || !active.current || sequence.current !== version) return;
      if (denied(err)) { clearProtected(); void readOverview(true).catch(() => {}); }
      else setDetail(previous => ({ ...previous, loading: false, error: err.message }));
    }
  }, [cache, clearProtected, readOverview]);

  const refresh = useCallback((force = false): Promise<void> => {
    if (refreshFlight.current) return refreshFlight.current;
    setRefreshing(true); setError('');
    const flight = (async () => {
      try {
        await readOverview(force);
        if (active.current && selection.current) await readDetail(selection.current, force);
      } catch (err: any) {
        if (!active.current || err.name === 'AbortError') return;
        if (denied(err)) clearProtected();
        setError(err.message);
      } finally {
        if (refreshFlight.current === flight) {
          refreshFlight.current = null;
          if (active.current) setRefreshing(false);
        }
      }
    })();
    refreshFlight.current = flight;
    return flight;
  }, [readOverview, readDetail, clearProtected]);

  useEffect(() => {
    active.current = true;
    void refresh();
    let timer: ReturnType<typeof setTimeout>;
    const focus = () => { clearTimeout(timer); timer = setTimeout(() => void refresh(true), 200); };
    const invalidate = () => { cache.invalidate(); focus(); };
    const unsubscribe = subscribeToDesktopEvents(socket, on => {
      on('qualification:updated', invalidate); on('responder:status_changed', invalidate); on('reconnect', invalidate);
    });
    window.addEventListener('focus', focus);
    return () => {
      active.current = false; clearTimeout(timer); cache.clear(); refreshFlight.current = null;
      unsubscribe(); window.removeEventListener('focus', focus);
    };
  }, [cache, socket, refresh]);

  useEffect(() => {
    if (!selected) { setDetail(emptyDetail); return; }
    void readDetail(selected);
    return () => { cache.cancel('detail:' + selected); sequence.current++; };
  }, [cache, selected, readDetail]);

  const more = async () => {
    if (!snapshot?.cursor) return;
    const page = await cache.read('page:' + snapshot.cursor, signal => api('/applications?before=' + snapshot.cursor, 'GET', undefined, signal));
    if (!active.current) return;
    setSnapshot(previous => {
      if (!previous) return previous;
      const next = { ...previous, cursor: page.nextCursor, items: [...previous.items,
        ...page.applications.filter((row: any) => !previous.items.some(old => old.application_id === row.application_id))] };
      cache.put('overview', next); current.current = next; return next;
    });
  };
  return { ...snapshot, refreshing, error, detail: detail.id === selected ? detail.row : cache.peek('detail:' + selected) || null,
    detailLoading: detail.id === selected ? detail.loading : Boolean(selected), detailError: detail.id === selected ? detail.error : '',
    refresh, more, invalidate: () => cache.invalidate(), peekDetail: (id: number) => cache.peek('detail:' + id) };
}
