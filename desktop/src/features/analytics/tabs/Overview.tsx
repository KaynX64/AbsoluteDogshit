import { BarChart, Timeline } from '../Charts';
import { count, formatClosure, type AnalyticsData } from '../data';

export function Overview({ data, jump, print }: { data: AnalyticsData; jump?: (tab: 'campus' | 'pharmacy') => void; print?: boolean }) {
  const operations = data.operations;
  const surveillance = data.clinical?.surveillance;
  const inventory = data.pharmacy?.inventory;
  const metrics = operations ? [
    ['Appointments recorded', count(operations.totalConsultations), 'All-time appointment records'],
    ['Active enrolled students', count(operations.totalStudents), 'Current active student accounts'],
    ['Open SOS alerts', count(operations.emergencyMetrics.active), 'Triggered, acknowledged or dispatched'],
    ['Average time to close an SOS', formatClosure(operations.emergencyMetrics), 'All-time timed closures'],
  ] : [];
  return <>
    {operations && <dl className="an-kpis">{metrics.map(([label, value, detail]) => <div key={label}>
      <dt>{label}</dt><dd>{value}</dd><dd className="an-kpi-detail">{detail}</dd>
    </div>)}</dl>}
    {jump && (surveillance || inventory) && <div className="an-actions-grid">
      {surveillance && <button type="button" onClick={() => jump('campus')}><span>Respiratory surveillance</span>
        <strong>{count(surveillance.fluStats.cases_past_7_days)} in the last 7 days <span aria-hidden="true">→</span></strong></button>}
      {inventory && <button type="button" onClick={() => jump('pharmacy')}><span>Pharmacy reorder priorities</span>
        <strong>{inventory.reorderPriorities.length} shown <span aria-hidden="true">→</span></strong></button>}
    </div>}
    {operations && !print && <div className="an-pair">
      <Timeline title="Daily encounters" days={operations.timeSeries} compact />
      <Timeline title="Daily SOS alerts" days={operations.emergencyTimeSeries} compact />
    </div>}
    {data.headcount && <BarChart title="Active accounts by role" description="Current role assignments. One account may hold several roles." print={print}
      rows={data.headcount.roleDistribution.map(row => ({ key: row.role_code, label: row.role_name, value: row.count }))} />}
    {!data.headcount && !operations && !data.clinical && !data.pharmacy && <p className="an-empty">Ask a Super Admin to grant an analytics section.</p>}
  </>;
}
