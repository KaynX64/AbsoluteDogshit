import type { AnalyticsData } from './data';

export const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'clinical', label: 'Clinical Activity' },
  { id: 'campus', label: 'Campus Health' },
  { id: 'pharmacy', label: 'Pharmacy' },
] as const;

export type TabId = typeof tabs[number]['id'];

export const visibleTabs = (data: AnalyticsData) => tabs.filter(({ id }) => {
  switch (id) {
    case 'overview': return true;
    case 'clinical': return Boolean(data.operations || data.clinical?.topDiagnoses);
    case 'campus': return Boolean(data.operations || data.clinical?.surveillance);
    case 'pharmacy': return Boolean(data.pharmacy);
  }
});

export const hasReportData = (data: AnalyticsData) =>
  Boolean(data.operations || data.clinical || data.pharmacy || data.headcount);
