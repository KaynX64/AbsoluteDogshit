import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../../../config/api';
import { DataTable } from '../Charts';
import { authHeaders, count, type Department } from '../data';

export default function DepartmentExplorer({ onAccessDenied }: { onAccessDenied: () => void }) {
  const [rows, setRows] = useState<Department[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const pending = useRef<AbortController | null>(null);

  useEffect(() => () => pending.current?.abort(), []);

  async function load() {
    if (pending.current) return;
    const request = new AbortController();
    pending.current = request;
    setLoading(true);
    setError(false);
    try {
      const response = await fetch(`${API_BASE_URL}/api/analytics/by-department`, {
        headers: authHeaders(), signal: request.signal,
      });
      if (request.signal.aborted) return;
      if (response.status === 401 || response.status === 403) {
        onAccessDenied();
        return;
      }
      if (!response.ok) throw new Error('Department request failed');
      const departments: Department[] = await response.json();
      if (!request.signal.aborted) setRows(departments);
    } catch {
      if (!request.signal.aborted) setError(true);
    } finally {
      pending.current = null;
      if (!request.signal.aborted) setLoading(false);
    }
  }

  return <details className="an-values an-panel" onToggle={event => {
    if (event.currentTarget.open && rows === null && !error) void load();
  }}>
    <summary>View all departments</summary>
    {loading && <p role="status">Loading departments…</p>}
    {error && <div className="an-error"><span role="alert">Could not load departments.</span>
      <button type="button" onClick={() => void load()}>Retry</button></div>}
    {rows && <DataTable caption="All departments" headers={[{ label: 'Department or program' }, { label: 'Completed visits', numeric: true }]}
      rows={rows.map(row => ({ key: row.department, cells: [row.department, count(row.consultations_count)] }))}
      empty="No completed visits by department." />}
  </details>;
}
