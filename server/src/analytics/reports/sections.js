// Builds shared surveillance and pharmacy table sections for analytics exports.

export function workflowSections({ surveillance, pharmacy }) {
  const sections = [];
  if (surveillance) {
    const { fluStats, highRiskGroups: risk } = surveillance;
    sections.push({
      title: 'Respiratory Surveillance',
      columns: ['Keyword-based encounter count', 'Encounters'],
      rows: [
        ['Last 7 days', fluStats.cases_past_7_days],
        ['Previous 7 days', fluStats.cases_prev_7_days],
      ],
    }, {
      title: 'Health-risk Groups',
      columns: ['Recorded risk (groups can overlap)', 'Profiles'],
      rows: [
        ['Profiles monitored', risk.total_students_monitored],
        ['Asthma', risk.asthma_count],
        ['Hypertension', risk.hypertension_count],
        ['Diabetes', risk.diabetes_count],
        ['Severe allergies', risk.severe_allergies_count],
      ],
    });
  }
  if (pharmacy) {
    const medicineName = ({ name, strength, form, unit }) => [name, strength, form, unit].filter(Boolean).join(' ');
    if (pharmacy.dispensing) sections.push({
      title: 'Formulary Dispensing',
      subtitle: `Last ${pharmacy.windowDays} days. Availability reflects current usable stock.`,
      columns: ['Medicine', 'Prescribed', 'Dispensed', 'Returned', 'Net', 'Availability'],
      rows: pharmacy.dispensing.map(row => [
        medicineName(row), Number(row.quantity_prescribed), Number(row.quantity_dispensed),
        Number(row.quantity_returned), Number(row.net_dispensed), row.availability === 'IN_STOCK' ? 'In stock' : 'Out of stock',
      ]),
    });
    if (pharmacy.reorderPriorities) {
      sections.push({
        title: 'Reorder Priorities',
        columns: ['Medicine', 'On hand', 'Reorder buffer', 'Suggested order'],
        rows: pharmacy.reorderPriorities.map(row => [
          medicineName(row), Number(row.total_stock_on_hand), Number(row.reorder_level), Number(row.suggested_reorder_qty),
        ]),
      });
    }
  }
  return sections;
}
