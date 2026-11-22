// Drains the network listener and worker jobs before closing shared dependencies.

export async function drainServer({ io, stopWorkers, closeDependencies }) {
  const results = await Promise.allSettled([
    Promise.resolve().then(stopWorkers),
    new Promise(/* Wait for Socket.IO and its HTTP listener to finish closing. */ (resolve, reject) => {
      io.close(/* Treat an already stopped listener as closed and propagate other close errors. */ error => {
        if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') reject(error);
        else resolve();
      }).catch(reject);
    }),
  ]);
  await closeDependencies();

  // Select the drain operations that failed.
  const errors = results.filter(result => result.status === 'rejected').map(/* Extract each failure reason for shutdown reporting. */ result => result.reason);
  if (errors.length) throw new AggregateError(errors, 'Server shutdown could not drain all work.');
}
