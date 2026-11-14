// Drains the network listener and worker jobs before closing shared dependencies.

export async function drainServer({ io, stopWorkers, closeDependencies }) {
  const results = await Promise.allSettled([
    Promise.resolve().then(stopWorkers),
    new Promise((resolve, reject) => {
      io.close(error => {
        if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') reject(error);
        else resolve();
      }).catch(reject);
    }),
  ]);
  await closeDependencies();

  const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
  if (errors.length) throw new AggregateError(errors, 'Server shutdown could not drain all work.');
}
