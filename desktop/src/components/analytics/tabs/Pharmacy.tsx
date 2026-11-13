import { DataTable, Panel } from '../Charts';
import { count, dayLabel, type AnalyticsData, type Medicine } from '../data';

const numeric = (label: string) => ({ label, numeric: true });
const text = (label: string) => ({ label });
const medicineLabel = (medicine: Medicine) => <>{medicine.name}<small>{medicine.strength} {medicine.form} · {medicine.unit}</small></>;

export function Pharmacy({ data, print }: { data: AnalyticsData; print?: boolean }) {
  const pharmacy = data.pharmacy;
  if (!pharmacy) return null;
  const inventory = pharmacy.inventory;
  return <div className="an-stack">
    <div className={inventory && pharmacy.dispensing ? 'an-pair' : undefined}>
      {pharmacy.dispensing && <Panel title="Formulary dispensing" description={`Last ${pharmacy.windowDays} days · Net is dispensed minus returned`}>
        <DataTable caption="Formulary dispensing" headers={[text('Medicine'), numeric('Prescribed'), numeric('Dispensed'), numeric('Returned'), numeric('Net'), text('Availability')]}
          empty="No active formulary medicines."
          rows={pharmacy.dispensing.map(row => ({ key: row.medicine_id, cells: [
            medicineLabel(row), count(row.quantity_prescribed), count(row.quantity_dispensed), count(row.quantity_returned), count(row.net_dispensed),
            row.availability === 'IN_STOCK' ? 'In stock' : <span className="an-status">Out of stock</span>,
          ] }))} />
      </Panel>}
      {inventory && <Panel title="Reorder priorities" headingId={print ? undefined : 'an-reorder'} description="Current usable stock, lowest first">
        <DataTable caption="Reorder priorities" headers={[text('Medicine'), text('Stock status'), numeric('On hand'), numeric('Suggested order')]}
          empty="No active medicines at or below their reorder buffers."
          rows={inventory.reorderPriorities.map(row => ({ key: row.medicine_id, cells: [
            medicineLabel(row), <span className="an-status">{row.stock_status === 'OUT_OF_STOCK' ? 'Out of stock' : 'At or below buffer'}</span>,
            `${count(row.total_stock_on_hand)} ${row.unit}`, Number(row.suggested_reorder_qty) > 0 ? `+${count(row.suggested_reorder_qty)} ${row.unit}` : 'Set a buffer',
          ] }))} />
      </Panel>}
    </div>
    {inventory && <Panel title="Batch expiry and stock watch" description="Batches flagged for low quantity or expiry within 90 days.">
      <DataTable caption="Pharmacy batch watch" headers={[text('Medicine'), text('Lot'), numeric('On hand'), text('Expiry'), text('Expiry status')]}
        empty="No batches flagged for low quantity or expiry."
        rows={inventory.lowStockMeds.map(row => ({ key: row.batch_id, cells: [
          row.name, row.batch_no, count(row.quantity_on_hand), dayLabel(row.expiry_date),
          Number(row.days_until_expiry) <= 90
            ? <span className="an-status">{Number(row.days_until_expiry) < 0 ? 'Expired' : Number(row.days_until_expiry) === 0 ? 'Expires today' : `Expires in ${count(row.days_until_expiry)} days`}</span>
            : 'Outside expiry window',
        ] }))} />
    </Panel>}
  </div>;
}
