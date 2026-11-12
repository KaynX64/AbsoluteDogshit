export function startScheduler(jobs) {
  let stopped = false;
  const timers = jobs.map(({ name, intervalMs, run, runImmediately = false }) => {
    let inFlight;
    const tick = () => {
      if (stopped || inFlight) return;

      inFlight = Promise.resolve()
        .then(run)
        .catch(error => console.error(`[${name} Error]:`, error?.message ?? String(error)))
        .finally(() => { inFlight = undefined; });
    };
    const timer = setInterval(tick, intervalMs);
    if (runImmediately) tick();
    return { timer, pending: () => inFlight };
  });

  return async function stop() {
    stopped = true;
    for (const { timer } of timers) clearInterval(timer);
    await Promise.all(timers.map(({ pending }) => pending()));
  };
}
