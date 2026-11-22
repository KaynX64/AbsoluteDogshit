import type { ReactNode } from 'react';
import type { MedicineMaster } from './FormularySelect';
import { doseUnits, supplyUnits, type MedicationDraft } from './prescribingTypes';

function Field({ label, id, children, wide = false }: { label: string; id: string; children: ReactNode; wide?: boolean }) {
  return <label htmlFor={id} className={wide ? 'rx-v2-field rx-v2-wide' : 'rx-v2-field'}><span>{label}</span>{children}</label>;
}

export default function MedicationEditor({ item, medicines, query, setQuery, update, disabled }: {
  item: MedicationDraft; medicines: MedicineMaster[]; query: string; setQuery: (value: string) => void;
  update: (value: MedicationDraft) => void; disabled: boolean;
}) {
  const patch = (value: Partial<MedicationDraft>) => update({ ...item, ...value });
  const manual = !item.catalog_medicine_id;
  const visibleMedicines = medicines.filter(medicine => `${medicine.name} ${medicine.generic_name}`.toLowerCase().includes(query.toLowerCase()));
  const choose = (id: string) => {
    const medicine = medicines.find(it => it.medicine_id === Number(id));
    patch({ catalog_medicine_id: medicine?.medicine_id ?? null, generic_name: medicine?.generic_name ?? '',
      brand_name: '',
      strength: medicine?.strength ?? '', form: medicine?.form ?? '', generic_confirmed: false,
      quantity_unit: item.fulfillment === 'clinic' ? medicine?.unit || 'pcs' : item.quantity_unit });
  };
  const input = (key: keyof MedicationDraft, id: string, maximum = 100, readOnly = false) =>
    <input id={id} value={String(item[key] ?? '')} disabled={disabled} readOnly={readOnly} maxLength={maximum}
      onChange={event => patch({ [key]: event.target.value })} />;
  return <fieldset className="rx-v2-editor" disabled={disabled}>
    <legend className="vd-sr-only">Medicine details</legend>
    <div className="rx-v2-lookup">
      <Field label="Fulfillment" id="rx-fulfillment"><select id="rx-fulfillment" value={item.fulfillment}
        onChange={event => patch({ fulfillment: event.target.value as MedicationDraft['fulfillment'],
          quantity_unit: event.target.value === 'clinic' ? medicines.find(it => it.medicine_id === item.catalog_medicine_id)?.unit || 'pcs' : 'tablet' })}>
        <option value="clinic">Clinic dispensing</option><option value="external">External pharmacy prescription</option></select></Field>
      <Field label="Search catalog" id="rx-catalog-search"><input id="rx-catalog-search" value={query}
        placeholder="Generic or name" onChange={event => setQuery(event.target.value)} /></Field>
      <Field label="Catalog medicine" id="rx-catalog"><select id="rx-catalog" value={item.catalog_medicine_id || ''} onChange={event => choose(event.target.value)}>
        <option value="">{item.fulfillment === 'external' ? 'Manual external entry' : 'Choose a medicine'}</option>
        {medicines.filter(it => it.medicine_id === item.catalog_medicine_id || visibleMedicines.includes(it))
          .filter(it => item.fulfillment === 'external' || Number(it.available_stock) > 0 || it.medicine_id === item.catalog_medicine_id)
          .map(it => <option key={it.medicine_id} value={it.medicine_id}>{it.generic_name} · {it.name} ({it.available_stock ?? 0} {it.unit || 'pcs'})</option>)}
      </select></Field>
    </div>
    <div className="rx-v2-grid">
      <Field label="Generic name" id="rx-generic">{input('generic_name', 'rx-generic', 200, !manual)}</Field>
      <Field label="Brand — optional" id="rx-brand">{input('brand_name', 'rx-brand', 200)}</Field>
      <Field label="Strength / concentration" id="rx-strength">{input('strength', 'rx-strength', 100, !manual)}</Field>
      <Field label="Dosage form" id="rx-form">{input('form', 'rx-form', 50, !manual)}</Field>
      <Field label="Dose per administration" id="rx-dose">{input('dose_amount', 'rx-dose', 32)}</Field>
      <Field label="Dose unit" id="rx-dose-unit"><input id="rx-dose-unit" list="rx-dose-units" value={item.dose_unit} maxLength={50}
        onChange={event => patch({ dose_unit: event.target.value })} /><datalist id="rx-dose-units">{doseUnits.map(unit => <option key={unit} value={unit} />)}</datalist></Field>
      <Field label="Route" id="rx-route"><input id="rx-route" list="rx-routes" maxLength={50} value={item.route} onChange={event => patch({ route: event.target.value })} />
        <datalist id="rx-routes">{['Oral', 'Topical', 'Inhaled', 'Ophthalmic', 'Otic', 'Intranasal', 'Sublingual', 'Rectal'].map(value => <option key={value} value={value} />)}</datalist></Field>
      <Field label="Schedule" id="rx-schedule"><select id="rx-schedule" value={item.schedule.kind}
        onChange={event => patch({ review_on: event.target.value === 'fixed' ? '' : item.review_on,
          schedule: { ...item.schedule, kind: event.target.value as MedicationDraft['schedule']['kind'] } })}>
        <option value="fixed">Fixed</option><option value="prn">As needed</option><option value="custom">Custom directions</option></select></Field>
      <Field label={item.schedule.kind === 'fixed' ? 'Frequency' : 'Review date'} id={item.schedule.kind === 'fixed' ? 'rx-frequency' : 'rx-review-on'}>
        {item.schedule.kind === 'fixed' ? <input id="rx-frequency" list="rx-frequencies" value={item.schedule.frequency} maxLength={100}
          onChange={event => patch({ schedule: { ...item.schedule, frequency: event.target.value } })} />
          : <input id="rx-review-on" type="date" value={item.review_on} onChange={event => patch({ review_on: event.target.value })} />}
        <datalist id="rx-frequencies">{['Once daily', 'Twice daily', 'Three times daily', 'Every 6 hours', 'Every 8 hours', 'Every 12 hours'].map(value => <option key={value} value={value} />)}</datalist>
      </Field>
      <Field label="Duration (days)" id="rx-duration"><input id="rx-duration" type="number" min="1" step="1" value={item.duration_days ?? ''}
        onChange={event => patch({ duration_days: event.target.value })} /></Field>
      <Field label="Total quantity" id="rx-quantity"><input id="rx-quantity" type="number" min="0.001" step={item.fulfillment === 'clinic' ? '1' : '0.001'} value={item.quantity}
        onChange={event => patch({ quantity: event.target.value })} /></Field>
      <Field label="Supply unit" id="rx-quantity-unit">{item.fulfillment === 'clinic' ? input('quantity_unit', 'rx-quantity-unit', 50, true)
        : <select id="rx-quantity-unit" value={item.quantity_unit} onChange={event => patch({ quantity_unit: event.target.value })}>
          {[...new Set([...supplyUnits, item.quantity_unit])].map(value => <option key={value} value={value}>{value}</option>)}</select>}</Field>
      <Field label="Pack size / container" id="rx-pack-size">{input('pack_size', 'rx-pack-size', 100)}</Field>
      {item.schedule.kind === 'prn' && <>
        <Field label="As-needed reason" id="rx-prn-reason"><input id="rx-prn-reason" value={item.schedule.prn_reason} maxLength={200}
          onChange={event => patch({ schedule: { ...item.schedule, prn_reason: event.target.value } })} /></Field>
        <Field label="Clinician-specified limits" id="rx-prn-limits" wide><input id="rx-prn-limits" value={item.schedule.prn_limits} maxLength={300}
          onChange={event => patch({ schedule: { ...item.schedule, prn_limits: event.target.value } })} /></Field>
      </>}
    </div>
    {manual && item.fulfillment === 'external' && <label className="rx-v2-confirm"><input type="checkbox" checked={item.generic_confirmed}
      onChange={event => patch({ generic_confirmed: event.target.checked })} /> I confirm the generic name; this identity is manually entered and unverified.</label>}
  </fieldset>;
}
