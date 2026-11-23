import { AsyncLocalStorage } from 'node:async_hooks';

const context = new AsyncLocalStorage();
export const loadControlsEnabled = () => process.env.MIXED_LOAD_CONTROLS !== 'false';

export function createAdmission() {
  let active = 0;
  let ordinary = 0;
  const waiting = { ordinary: [], sos: [] };
  const available = sos => active < 28 && (sos || ordinary < 24);
  const reject = res => res.set('Retry-After', '1').status(503).json({ error: 'The API is busy. Please retry shortly.', code: 'API_BUSY' });

  function admit(sos, res, next) {
    active++;
    if (!sos) ordinary++;
    const state = { sos, ended: false, aborted: false, released: false, pending: 0 };
    state.release = () => {
      if (!state.ended || state.pending || state.released) return;
      state.released = true;
      active--;
      if (!sos) ordinary--;
      if (available(true) && waiting.sos.length) waiting.sos[0].run();
      else if (available(false)) waiting.ordinary[0]?.run();
    };
    res.once('finish', () => { state.ended = true; state.release(); });
    res.once('close', () => { state.ended = true; state.aborted = !res.writableFinished; state.release(); });
    context.run(state, next);
  }

  return (req, res, next) => {
    if (req.path === '/ping') return next();
    const sos = req.method === 'POST' && /^\/emergency\/sos(?:\/requests)?\/?$/i.test(req.path);
    if (available(sos)) return admit(sos, res, next);
    const queue = sos ? waiting.sos : waiting.ordinary;
    if (queue.length >= (sos ? 32 : 12)) return reject(res);

    const request = { run: () => cancel() && admit(sos, res, next) };
    function cancel() {
      const index = queue.indexOf(request);
      if (index < 0) return false;
      queue.splice(index, 1);
      clearTimeout(timeout);
      res.off('close', cancel);
      return true;
    }
    const timeout = setTimeout(() => { if (cancel()) reject(res); }, sos ? 1_000 : 100).unref();
    res.once('close', cancel);
    queue.push(request);
  };
}

export const isSosRequest = () => context.getStore()?.sos === true;

// Retain the request slot until asynchronous queries and borrowed connections settle.
export function beginDatabaseWork() {
  const state = context.getStore();
  if (!state) return () => {};
  if (state.aborted && state.released) throw Object.assign(new Error('The client disconnected.'), { code: 'CLIENT_DISCONNECTED' });
  state.pending++;
  return () => { state.pending--; state.release(); };
}
