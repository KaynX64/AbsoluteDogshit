import { useEffect, useRef, useState } from 'react';
import { T, inputStyle } from '../../theme';

export interface MedicineMaster {
  medicine_id: number;
  name: string;
  generic_name: string;
  form: string;
  strength: string;
  unit?: string;
  available_stock?: number;
}

/* ── Custom themed dropdown showing live stock levels ─────────── */
export default function FormularySelect({
  medicines,
  value,
  onChange,
  disabled,
}: {
  medicines: MedicineMaster[];
  value: number;
  onChange: (id: number) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selected = medicines.find((m) => m.medicine_id === value);
  const stockedMedicines = medicines.filter((medicine) => Number(medicine.available_stock) > 0);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <button
        id="rx-formulary"
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        style={{
          ...inputStyle,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          textAlign: 'left',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: selected ? T.text : T.textMuted,
          }}
        >
          {selected
            ? selected.name
            : 'Select medicine…'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {selected && selected.available_stock !== undefined && (
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: T.radius.pill,
                background: selected.available_stock <= 0 ? T.dangerSoft : T.successSoft,
                color: selected.available_stock <= 0 ? T.danger : T.success,
              }}
            >
              {selected.available_stock <= 0
                ? 'Out of stock'
                : `${selected.available_stock} ${selected.unit || 'pcs'}`}
            </span>
          )}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke={T.textSub}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              width: 14,
              height: 14,
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 140ms ease',
            }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>
      {open && !disabled && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 50,
            maxHeight: 260,
            overflowY: 'auto',
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: T.radius.md,
            boxShadow: T.shadow.lg,
            padding: 4,
          }}
        >
          {medicines.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 12.5, color: T.textMuted, fontStyle: 'italic' }}>
              Loading formulary…
            </div>
          ) : stockedMedicines.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 12.5, color: T.textMuted, fontStyle: 'italic' }}>
              No medicines currently in stock.
            </div>
          ) : (
            stockedMedicines.map((m) => {
              const isSelected = m.medicine_id === value;
              return (
                <button
                  key={m.medicine_id}
                  type="button"
                  onClick={() => {
                    onChange(m.medicine_id);
                    setOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    width: '100%',
                    textAlign: 'left',
                    padding: '9px 12px',
                    borderRadius: T.radius.sm,
                    border: 'none',
                    background: isSelected ? T.primaryTint : 'transparent',
                    color: isSelected ? T.primary : T.text,
                    fontSize: 12.5,
                    fontWeight: isSelected ? 700 : 500,
                    cursor: 'pointer',
                    fontFamily: T.font,
                    transition: 'background 100ms ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = T.sage100;
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.name} ({m.generic_name}) · {m.strength} [{m.form}]
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: T.radius.pill,
                      background: T.successSoft,
                      color: T.success,
                      flexShrink: 0,
                      marginLeft: 8,
                    }}
                  >
                    {m.available_stock} {m.unit || 'pcs'}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

