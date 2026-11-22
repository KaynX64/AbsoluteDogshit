import { DataTable, Panel, Timeline } from '../Charts';
import { count, type AnalyticsData } from '../data';

const numeric = (label: string) => ({ label, numeric: true });
const text = (label: string) => ({ label });
export function Campus({ data, print }: { data: AnalyticsData; print?: boolean }) {
  const clinical = data.clinical?.surveillance;
  const recent = Number(clinical?.fluStats.cases_past_7_days ?? 0);
  const previous = Number(clinical?.fluStats.cases_prev_7_days ?? 0);
  const difference = recent - previous;
  const risk = clinical?.highRiskGroups;
  return <div className="an-stack">
    {data.operations && <Timeline title="Daily SOS alerts" days={data.operations.emergencyTimeSeries} print={print} />}
    {risk && <div className="an-pair">
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
    </div>}
  </div>;
}
