import { useState } from 'react';
import { BarChart, DataTable, Panel, Timeline } from './Charts';
import { count, dayLabel, formatClosure, type AnalyticsData, type Medicine } from './data';

const pageSize = 25;
const numeric = (label: string) => ({ label, numeric: true });
const text = (label: string) => ({ label });

export function Overview({ data, jump, print }: { data: AnalyticsData; jump?: (tab: 'campus' | 'pharmacy') => void; print?: boolean }) {
  const metrics = [
    ['Appointments recorded', count(data.totalConsultations), 'All-time appointment records'],
    ['Active enrolled students', count(data.totalStudents), 'Current active student accounts'],
    ['Open SOS alerts', count(data.emergencyMetrics.active), 'Triggered, acknowledged or dispatched'],
    ['Average time to close an SOS', formatClosure(data.emergencyMetrics), 'All-time timed closures'],
  ];
  return <>
    <dl className="an-kpis">{metrics.map(([label, value, detail]) => <div key={label}>
      <dt>{label}</dt><dd>{value}</dd><dd className="an-kpi-detail">{detail}</dd>
    </div>)}</dl>
    {jump && <div className="an-actions-grid">
      <button type="button" onClick={() => jump('campus')}><span>Respiratory surveillance</span>
        <strong>{count(data.fluStats.cases_past_7_days)} in the last 7 days <span aria-hidden="true">→</span></strong></button>
      <button type="button" onClick={() => jump('pharmacy')}><span>Pharmacy reorder priorities</span>
        <strong>{data.pharmacy ? `${data.pharmacy.reorderPriorities.length} shown` : 'Unavailable'} <span aria-hidden="true">→</span></strong></button>
    </div>}
    {!print && <div className="an-pair">
      <Timeline title="Daily encounters" days={data.timeSeries} compact />
      <Timeline title="Daily SOS alerts" days={data.emergencyTimeSeries} compact />
    </div>}
  </>;
}

function DiagnosisExplorer({ diagnoses }: { diagnoses: AnalyticsData['topDiagnoses'] }) {
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

export function Clinical({ data, print }: { data: AnalyticsData; print?: boolean }) {
  const top = [...data.topDiagnoses].sort((a, b) => Number(b.count) - Number(a.count) || a.diagnosis.localeCompare(b.diagnosis)).slice(0, 10);
  return <div className="an-stack">
    <Timeline title="Daily encounters" days={data.timeSeries} print={print} />
    <div className="an-pair">
      <BarChart title="Top clinical diagnoses" description="Up to 10 diagnoses by all-time encounter count" print={print}
        rows={top.map(row => ({ key: row.diagnosis, label: row.diagnosis, value: row.count }))} />
      <BarChart title="Completed visits by department" description="Up to six departments and programs · all time" print={print}
        rows={data.deptBreakdown.map(row => ({ key: row.department, label: row.department, value: row.consultations_count }))} />
    </div>
    {!print && <DiagnosisExplorer diagnoses={data.topDiagnoses} />}
  </div>;
}

export function Campus({ data, print }: { data: AnalyticsData; print?: boolean }) {
  const recent = Number(data.fluStats.cases_past_7_days);
  const previous = Number(data.fluStats.cases_prev_7_days);
  const difference = recent - previous;
  const risk = data.highRiskGroups;
  return <div className="an-stack">
    <Timeline title="Daily SOS alerts" days={data.emergencyTimeSeries} print={print} />
    <div className="an-pair">
      <Panel title="Respiratory surveillance" headingId={print ? undefined : 'an-respiratory'} description="Counts encounters with respiratory keywords in their recorded diagnosis.">
        <dl className="an-comparison">
          <div><dt>Last 7 days</dt><dd>{count(recent)}</dd></div>
          <div><dt>Previous 7 days</dt><dd>{count(previous)}</dd></div>
        </dl>
        <p className="an-muted">{difference === 0 ? 'Same count across both periods.' : `${count(Math.abs(difference))} ${difference > 0 ? 'more' : 'fewer'} encounters than the previous period.`}</p>
      </Panel>
      <Panel title="Health-risk watchlist" description={`${count(risk.total_students_monitored)} health profiles monitored. A person may appear in multiple categories.`}>
        <DataTable caption="Health-risk groups" headers={[text('Recorded risk'), numeric('Profiles')]}
          rows={[
            { key: 'asthma', cells: ['Asthma', count(risk.asthma_count)] },
            { key: 'hypertension', cells: ['Hypertension', count(risk.hypertension_count)] },
            { key: 'diabetes', cells: ['Diabetes', count(risk.diabetes_count)] },
            { key: 'allergy', cells: ['Severe allergies', count(risk.severe_allergies_count)] },
          ]} />
      </Panel>
    </div>
    <BarChart title="Active accounts by role" description="Current role assignments. One account may hold several roles." print={print}
      rows={data.roleDistribution.map(row => ({ key: row.role_code, label: row.role_name, value: row.count }))} />
  </div>;
}

const medicineLabel = (medicine: Medicine) => <>{medicine.name}<small>{medicine.strength} {medicine.form} · {medicine.unit}</small></>;

export function Pharmacy({ data, print }: { data: AnalyticsData; print?: boolean }) {
  const pharmacy = data.pharmacy;
  return <div className="an-stack">
    {pharmacy ? <div className="an-pair">
      <Panel title="Formulary dispensing" description={`Last ${pharmacy.windowDays} days · Net is dispensed minus returned`}>
        <DataTable caption="Formulary dispensing" headers={[text('Medicine'), numeric('Prescribed'), numeric('Dispensed'), numeric('Returned'), numeric('Net')]}
          empty="No active formulary medicines."
          rows={pharmacy.dispensing.map(row => ({ key: row.medicine_id, cells: [
            medicineLabel(row), count(row.quantity_prescribed), count(row.quantity_dispensed), count(row.quantity_returned), count(row.net_dispensed),
          ] }))} />
      </Panel>
      <Panel title="Reorder priorities" headingId={print ? undefined : 'an-reorder'} description="Current usable stock, lowest first">
        <DataTable caption="Reorder priorities" headers={[text('Medicine'), text('Stock status'), numeric('On hand'), numeric('Suggested order')]}
          empty={pharmacy.dispensing.length ? 'All medicines are above their reorder buffers.' : 'No active formulary medicines.'}
          rows={pharmacy.reorderPriorities.map(row => ({ key: row.medicine_id, cells: [
            medicineLabel(row), <span className="an-status">{row.stock_status === 'OUT_OF_STOCK' ? 'Out of stock' : 'At or below buffer'}</span>,
            `${count(row.total_stock_on_hand)} ${row.unit}`, Number(row.suggested_reorder_qty) > 0 ? `+${count(row.suggested_reorder_qty)} ${row.unit}` : 'Set a buffer',
          ] }))} />
      </Panel>
    </div> : <Panel title="Pharmacy activity" headingId={print ? undefined : 'an-reorder'}><p className="an-empty">Dispensing and reorder details require an updated server.</p></Panel>}
    <Panel title="Batch expiry and stock watch" description="Batches flagged for low quantity or expiry within 90 days.">
      <DataTable caption="Pharmacy batch watch" headers={[text('Medicine'), text('Lot'), numeric('On hand'), text('Expiry'), text('Expiry status')]}
        empty="No batches flagged for low quantity or expiry."
        rows={data.lowStockMeds.map(row => ({ key: row.batch_id, cells: [
          row.name, row.batch_no, count(row.quantity_on_hand), dayLabel(row.expiry_date),
          Number(row.days_until_expiry) <= 90
            ? <span className="an-status">{Number(row.days_until_expiry) < 0 ? 'Expired' : Number(row.days_until_expiry) === 0 ? 'Expires today' : `Expires in ${count(row.days_until_expiry)} days`}</span>
            : 'Outside expiry window',
        ] }))} />
    </Panel>
  </div>;
}
