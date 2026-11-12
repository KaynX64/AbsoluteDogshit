import type { ReactNode } from 'react';
import { count, dayLabel, type Count, type Day } from './data';

export function Panel({ title, description, headingId, children }: { title: string; description?: string; headingId?: string; children: ReactNode }) {
  return <section className="an-panel"><h2 id={headingId} tabIndex={headingId ? -1 : undefined}>{title}</h2>{description && <p className="an-muted">{description}</p>}{children}</section>;
}

export function DataTable({ caption, headers, rows, empty }: {
  caption: string;
  headers: { label: string; numeric?: boolean }[];
  rows: { key: string | number; cells: ReactNode[] }[];
  empty?: string;
}) {
  if (!rows.length) return <p className="an-empty">{empty ?? 'No records to display.'}</p>;
  return (
    <div className="an-table-wrap" role="region" aria-label={caption} tabIndex={0}>
      <table className="an-table">
        <caption className="an-sr">{caption}</caption>
        <thead><tr>{headers.map(({ label, numeric }) => <th key={label} scope="col" className={numeric ? 'an-number' : undefined}>{label}</th>)}</tr></thead>
        <tbody>{rows.map(({ key, cells }) => <tr key={key}>{cells.map((cell, index) => index === 0
          ? <th key={index} scope="row">{cell}</th>
          : <td key={index} className={headers[index].numeric ? 'an-number' : undefined}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function ExactValues({ print, children }: { print?: boolean; children: ReactNode }) {
  return print ? children : <details className="an-values"><summary>View data</summary>{children}</details>;
}

export function Timeline({ title, days, print, compact }: { title: string; days: Day[]; print?: boolean; compact?: boolean }) {
  const max = Math.max(1, ...days.map(day => Number(day.count)));
  const ceiling = max <= 4 ? max : Math.ceil(max / 4) * 4;
  const end = days.length - 1;
  const x = (i: number) => 45 + i * (550 / Math.max(end, 1));
  const y = (n: number) => 142 - n / ceiling * 116;
  const total = days.reduce((sum, day) => sum + Number(day.count), 0);
  const ticks = ceiling <= 4 ? Array.from({ length: ceiling + 1 }, (_, i) => i)
    : [0, ceiling / 4, ceiling / 2, ceiling * 3 / 4, ceiling];

  return (
    <Panel title={title} description={days.length ? `${dayLabel(days[0].date)} – ${dayLabel(days[end].date)} · Today is partial` : undefined}>
      {days.length === 0 ? <p className="an-empty">No daily data available.</p> : <>
        <figure className={compact ? 'an-trend an-compact' : 'an-trend'}>
          <svg viewBox="0 0 620 173" aria-hidden="true" focusable="false">
            {ticks.map(tick => <g key={tick}><line x1="45" x2="595" y1={y(tick)} y2={y(tick)} /><text x="38" y={y(tick) + 4} textAnchor="end">{count(tick)}</text></g>)}
            <line className="an-partial" x1={x(end)} x2={x(end)} y1="26" y2="142" />
            <polyline points={days.map((day, i) => `${x(i)},${y(Number(day.count))}`).join(' ')} />
            {days.map((day, i) => <circle key={day.date} cx={x(i)} cy={y(Number(day.count))} r={i === end ? 5 : 3.2} />)}
            <text x="45" y="163">{days[0].label}</text><text x="595" y="163" textAnchor="end">{days[end].label}*</text>
          </svg>
          <figcaption>{total ? <><strong>{count(total)}</strong> across the displayed days</> : 'Zero recorded in this period'}</figcaption>
        </figure>
        <ExactValues print={print}>
          <DataTable caption={title} headers={[{ label: 'Reporting day' }, { label: 'Count', numeric: true }]}
            rows={days.map((day, i) => ({ key: day.date, cells: [dayLabel(day.date) + (day.partial ?? (i === end) ? ' (partial)' : ''), count(day.count)] }))} />
        </ExactValues>
      </>}
    </Panel>
  );
}

export function BarChart({ title, description, rows, print }: {
  title: string; description: string; rows: { key: string; label: string; value: Count }[]; print?: boolean;
}) {
  const max = Math.max(1, ...rows.map(row => Number(row.value)));
  return <Panel title={title} description={description}>
    {rows.length === 0 ? <p className="an-empty">No records to display.</p> : <>
      <p className="an-muted an-bar-summary">{rows[0].label} leads with {count(rows[0].value)}.</p>
      <ul className="an-bars" aria-hidden="true">
        {rows.map(row => <li key={row.key}>
          <span>{row.label}</span><strong>{count(row.value)}</strong>
          <span className="an-bar-track"><span style={{ width: `${Number(row.value) / max * 100}%` }} /></span>
        </li>)}
      </ul>
      <ExactValues print={print}><DataTable caption={title} headers={[{ label: 'Category' }, { label: 'Count', numeric: true }]}
        rows={rows.map(row => ({ key: row.key, cells: [row.label, count(row.value)] }))} /></ExactValues>
    </>}
  </Panel>;
}
