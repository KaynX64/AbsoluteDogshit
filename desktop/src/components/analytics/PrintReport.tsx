import { createPortal } from 'react-dom';
import { Overview } from './tabs/Overview';
import { Clinical } from './tabs/Clinical';
import { Campus } from './tabs/Campus';
import { Pharmacy } from './tabs/Pharmacy';
import { visibleTabs } from './tabs';
import { timestamp, type AnalyticsData } from './data';

export default function PrintReport({ data, fetchedAt }: { data: AnalyticsData; fetchedAt: Date }) {
  return createPortal(
    <article className="an-dashboard an-print">
      <header><h1>HealthLink analytics</h1><p>PSU Lingayen Infirmary · Fetched {timestamp(fetchedAt)}</p></header>
      {visibleTabs(data).map(({ id, label }) => <section key={id}>
        <h2>{label}</h2>
        {id === 'overview' && <Overview data={data} print />}
        {id === 'clinical' && <Clinical data={data} print />}
        {id === 'campus' && <Campus data={data} print />}
        {id === 'pharmacy' && <Pharmacy data={data} print />}
      </section>)}
    </article>,
    document.body,
  );
}
