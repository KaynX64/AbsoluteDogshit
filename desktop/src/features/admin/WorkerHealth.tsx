import { T, btnGhost } from '../../theme';

type Worker = {
  name: string;
  running: boolean;
  outcome: 'success' | 'failed' | 'degraded' | 'skipped' | null;
  lastSuccessAt: string | null;
  durationMs: number | null;
  failures: number;
  metrics?: { oldestPendingAt?: string | null; failed?: number; recovered?: number };
};

export default function WorkerHealth({ workers, onRefresh }: { workers?: Worker[]; onRefresh: () => void }) {
  return (
    <section aria-labelledby="worker-health-title" style={{ marginBlock: 20 }}>
      <h2 id="worker-health-title">Background jobs</h2>
      <button type="button" style={btnGhost} onClick={onRefresh}>Refresh system health</button>
      {!workers?.length ? <p>Worker health is unavailable.</p> : (
        <div className="vd-table-wrap">
          <table className="tbl">
            <thead><tr><th>Job</th><th>Last outcome</th><th>Last successful run</th><th>Duration</th><th>Failed runs</th></tr></thead>
            <tbody>
              {workers.map(worker => (
                <tr key={worker.name}>
                  <th scope="row">
                    {worker.name}
                    {worker.metrics?.oldestPendingAt && <div style={{ color: T.textSub }}>
                      Oldest pending PDF {new Date(worker.metrics.oldestPendingAt).toLocaleString()}
                    </div>}
                  </th>
                  <td>{worker.running ? 'Running' : worker.outcome ?? 'Waiting'}</td>
                  <td>{worker.lastSuccessAt ? new Date(worker.lastSuccessAt).toLocaleString() : '—'}</td>
                  <td>{worker.durationMs === null ? '—' : worker.durationMs + ' ms'}</td>
                  <td>{worker.failures}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
