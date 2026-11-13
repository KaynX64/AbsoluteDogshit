import { useState } from 'react';
import DepartmentExplorer from './DepartmentExplorer';
import { BarChart, DataTable, Panel, Timeline } from '../Charts';
import { count, type AnalyticsData, type Diagnosis } from '../data';

const pageSize = 25;
const numeric = (label: string) => ({ label, numeric: true });
const text = (label: string) => ({ label });
function DiagnosisExplorer({ diagnoses }: { diagnoses: Diagnosis[] }) {
  const [search, setSearch] = useState('');
  const [order, setOrder] = useState('count');
  const [page, setPage] = useState(0);
  const filtered = diagnoses.filter(row => row.diagnosis.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  filtered.sort((a, b) => order === 'name' ? a.diagnosis.localeCompare(b.diagnosis)
    : (order === 'fewest' ? Number(a.count) - Number(b.count) : Number(b.count) - Number(a.count)) || a.diagnosis.localeCompare(b.diagnosis));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visiblePage = Math.min(page, pages - 1);
  const offset = visiblePage * pageSize;
  return <Panel title="Diagnosis records by category">
    <div className="an-filters">
      <label>Search diagnoses<input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} /></label>
      <label>Sort by<select value={order} onChange={event => { setOrder(event.target.value); setPage(0); }}>
        <option value="count">Most encounters</option><option value="fewest">Fewest encounters</option><option value="name">Name A–Z</option>
      </select></label>
    </div>
    <p className="an-muted" role="status">{filtered.length
      ? `${count(offset + 1)}–${count(Math.min(offset + pageSize, filtered.length))} of ${count(filtered.length)} categories`
      : '0 matching categories'}</p>
    <DataTable caption="Diagnosis counts" headers={[text('Diagnosis'), numeric('Encounters')]} empty={search ? 'No diagnoses match your search.' : 'No diagnoses recorded.'}
      rows={filtered.slice(offset, offset + pageSize).map(row => ({ key: row.diagnosis, cells: [row.diagnosis, count(row.count)] }))} />
    {pages > 1 && <div className="an-pagination">
      <button type="button" disabled={visiblePage === 0} onClick={() => setPage(visiblePage - 1)}>Previous</button>
      <span>Page {visiblePage + 1} of {pages}</span>
      <button type="button" disabled={visiblePage + 1 >= pages} onClick={() => setPage(visiblePage + 1)}>Next</button>
    </div>}
  </Panel>;
}

export function Clinical({ data, print, onAccessDenied }: { data: AnalyticsData; print?: boolean; onAccessDenied?: () => void }) {
  const diagnoses = data.clinical?.topDiagnoses;
  const top = diagnoses?.slice(0, 10);
  return <div className="an-stack">
    {data.operations && <Timeline title="Daily encounters" days={data.operations.timeSeries} print={print} />}
    <div className="an-pair">
      {top && <BarChart title="Top clinical diagnoses" description="Up to 10 diagnoses by all-time encounter count" print={print}
        rows={top.map(row => ({ key: row.diagnosis, label: row.diagnosis, value: row.count }))} />}
      {data.operations && <BarChart title="Completed visits by department" description="Up to six departments and programs · all time" print={print}
        rows={data.operations.deptBreakdown.map(row => ({ key: row.department, label: row.department, value: row.consultations_count }))} />}
    </div>
    {!print && data.operations && onAccessDenied && <DepartmentExplorer onAccessDenied={onAccessDenied} />}
    {!print && diagnoses && <DiagnosisExplorer diagnoses={diagnoses} />}
  </div>;
}
