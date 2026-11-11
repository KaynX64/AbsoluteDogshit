// desktop/src/components/InventoryManager.tsx
import React, { useCallback, useState, useEffect, useRef } from 'react';
import { subscribeToDesktopEvents, useDesktopSocket } from '../services/desktopRealtime';
import { T, btnPrimary, btnGhost, calloutDanger, calloutInfo, calloutSuccess, inputStyle } from '../theme';
import { API_BASE_URL } from '../config/api';
import Icon from './Icon';
import './InventoryManager.css';

interface MedicineMaster {
  medicine_id: number;
  name: string;
  generic_name: string;
  form: string;
  strength: string;
  unit?: string;
  reorder_level?: number;
  available_stock?: number;
}

type InvTab = 'catalog' | 'stockin' | 'adjust' | 'alerts' | 'logs' | 'addmed';

interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => Promise<void>;
}

type InventoryNotice = { tone: 'info' | 'success' | 'error'; text: string };
type InventoryRead = 'batches' | 'medicines' | 'reorder-suggestions' | 'expiring-soon' | 'logs';

const tabs = [
  { id: 'catalog', label: 'Catalog & dispense', icon: 'medication' },
  { id: 'stockin', label: 'Stock-in', icon: 'download' },
  { id: 'adjust', label: 'Adjust & dispose', icon: 'swap_horiz' },
  { id: 'alerts', label: 'Alerts & reorder', icon: 'warning' },
  { id: 'logs', label: 'Consumption logs', icon: 'history' },
  { id: 'addmed', label: 'Formulary master', icon: 'inventory_2' },
] as const;

const noticeStyles = { info: calloutInfo, success: calloutSuccess, error: calloutDanger };
const noticeIcons = { info: 'info', success: 'check_circle', error: 'error' } as const;
const tabResources: Record<InvTab, InventoryRead[]> = {
  catalog: ['batches'],
  stockin: ['medicines'],
  adjust: ['batches'],
  alerts: ['batches', 'reorder-suggestions', 'expiring-soon'],
  logs: ['logs'],
  addmed: ['medicines'],
};

function getExpiryStatus(expiryDate: string) {
  const daysUntil = (new Date(expiryDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24);
  if (daysUntil < 0) return { label: 'Expired', bg: T.dangerSoft, color: T.danger };
  if (daysUntil <= 90) return { label: 'Expiring soon', bg: T.warningSoft, color: T.warning };
  return { label: 'Good', bg: T.successSoft, color: T.success };
}

export default function InventoryManager({ initialTab = 'catalog' }: { initialTab?: InvTab } = {}) {
  const [activeTab, setActiveTab] = useState<InvTab>(initialTab);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dialogOpen = confirmDialog !== null;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [readStatus, setReadStatus] = useState<Partial<Record<InventoryRead, 'ready' | 'error'>>>({});
  const readRequests = useRef<Partial<Record<InventoryRead, AbortController>>>({});

  /* ── Catalog & Deduction ─────────────────────────────────── */
  const [batchId, setBatchId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('Prescription issuance');
  const [notice, setNotice] = useState<InventoryNotice | null>(null);
  const [batches, setBatches] = useState<any[]>([]);
  const [medicines, setMedicines] = useState<MedicineMaster[]>([]);

  const [barcodeQuery, setBarcodeQuery] = useState('');
  const barcodeInputRef = useRef<HTMLInputElement | null>(null);

  const [logTypeFilter, setLogTypeFilter] = useState<'all' | 'dispense' | 'receive' | 'dispose'>('all');
  const [logSearchQuery, setLogSearchQuery] = useState('');

  /* ── Stock-in ────────────────────────────────────────────── */
  const [stockInMedId, setStockInMedId] = useState<number | ''>('');
  const [stockInBatchNo, setStockInBatchNo] = useState('');
  const [stockInMfgDate, setStockInMfgDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [stockInExpDate, setStockInExpDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 2);
    return d.toISOString().split('T')[0];
  });
  const [stockInSupplier, setStockInSupplier] = useState('Unilab Philippines');
  const [stockInQty, setStockInQty] = useState('100');

  /* ── Adjust / dispose ────────────────────────────────────── */
  const [adjustBatchId, setAdjustBatchId] = useState<number | ''>('');
  const [adjustQty, setAdjustQty] = useState('1');
  const [adjustType, setAdjustType] = useState<'dispose' | 'adjust' | 'recall' | 'return'>('dispose');
  const [adjustReason, setAdjustReason] = useState('Expired batch quarantine');

  /* ── Alerts / reorder ────────────────────────────────────── */
  const [reorderSuggestions, setReorderSuggestions] = useState<any[]>([]);
  const [expiringLots, setExpiringLots] = useState<any[]>([]);

  /* ── Logs ────────────────────────────────────────────────── */
  const [inventoryLogs, setInventoryLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(initialTab === 'logs');

  /* ── New medicine ────────────────────────────────────────── */
  const [newMedName, setNewMedName] = useState('');
  const [newMedGeneric, setNewMedGeneric] = useState('');
  const [newMedForm, setNewMedForm] = useState('Tablet');
  const [newMedStrength, setNewMedStrength] = useState('500mg');
  const [newMedUnit, setNewMedUnit] = useState('pcs');
  const [newMedReorder, setNewMedReorder] = useState('30');
  const [medSearchFilter, setMedSearchFilter] = useState('');

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    if (!dialogOpen) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const trigger = document.activeElement;
    dialog.showModal();
    dialog.querySelector('button')?.focus();
    return () => {
      dialog.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) {
        trigger.focus();
        if (document.activeElement !== trigger) document.getElementById('inventory-title')?.focus();
      }
    };
  }, [dialogOpen]);

  const selectedBatch = batches.find((batch) => String(batch.batch_id) === batchId);
  const filteredMedicines = medicines.filter((medicine) =>
    medicine.name.toLowerCase().includes(medSearchFilter.toLowerCase()) ||
    medicine.generic_name.toLowerCase().includes(medSearchFilter.toLowerCase())
  );

  const lowStockLots = (batches || [])
    .filter((b) => {
      if (!b || !b.expiry_date) return false;
      const isUnexpired = getExpiryStatus(b.expiry_date).label !== 'Expired';
      const threshold = b.reorder_level ?? 20;
      return isUnexpired && b.quantity_on_hand <= threshold;
    })
    .sort((a, b) => a.quantity_on_hand - b.quantity_on_hand);

  /* ── Fetchers ────────────────────────────────────────────── */
  const readInventory = async <Data,>(resource: InventoryRead, onLoaded: (data: Data) => void) => {
    readRequests.current[resource]?.abort();
    const request = new AbortController();
    readRequests.current[resource] = request;
    if (resource === 'logs') setLoadingLogs(true);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/inventory/${resource}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: request.signal,
      });
      if (!res.ok) throw new Error(`Inventory request failed (${res.status})`);
      const data: Data = await res.json();
      if (request.signal.aborted) return false;
      onLoaded(data);
      setReadStatus((status) => ({ ...status, [resource]: 'ready' }));
      return true;
    } catch {
      if (!request.signal.aborted) setReadStatus((status) => ({ ...status, [resource]: 'error' }));
      return false;
    } finally {
      if (!request.signal.aborted && resource === 'logs') setLoadingLogs(false);
    }
  };

  const fetchBatches = () => readInventory<any[]>('batches', setBatches);

  const fetchMedicines = () => readInventory<MedicineMaster[]>('medicines', (data) => {
    setMedicines(data);
    setStockInMedId((selected) =>
      data.some((medicine) => medicine.medicine_id === selected) ? selected : data[0]?.medicine_id ?? ''
    );
  });

  const fetchReorderAndAlerts = () => Promise.all([
    readInventory<any[]>('reorder-suggestions', setReorderSuggestions),
    readInventory<any[]>('expiring-soon', setExpiringLots),
  ]);

  const fetchLogs = () => readInventory<any[]>('logs', setInventoryLogs);

  const emptyText = (resource: InventoryRead, ready: string) => {
    if (readStatus[resource] === 'ready') return ready;
    return readStatus[resource] === 'error' ? 'Unable to load this inventory data.' : 'Loading inventory data…';
  };

  const socket = useDesktopSocket();
  useEffect(() => {
    fetchBatches();
    fetchMedicines();
    fetchReorderAndAlerts();
    if (initialTab === 'logs') fetchLogs();

    const unsubscribe = subscribeToDesktopEvents(socket, (on) => {
      on('inventory:updated', async () => {
        const results = await Promise.all([fetchBatches(), fetchMedicines(), fetchReorderAndAlerts(), fetchLogs()]);
        if (results.flat().every(Boolean)) {
          setNotice((current) => current ?? { tone: 'info', text: 'Inventory synchronized with the latest changes.' });
        }
      });

      on('reconnect', () => {
        fetchBatches();
        fetchMedicines();
        fetchReorderAndAlerts();
        fetchLogs();
      });
    });

    return () => {
      unsubscribe();
      Object.values(readRequests.current).forEach((request) => request.abort());
    };
  }, [socket]);

  // ── USB HID Hardware Barcode Scanner Listener ──────────────
  const processScannedCode = useCallback((code: string, isHardwareHID = false) => {
    const trimmed = code.trim();
    if (!trimmed) return;

    const match = batches.find((b) =>
      b.batch_no.toLowerCase() === trimmed.toLowerCase() ||
      b.batch_id.toString() === trimmed ||
      (b.name && b.name.toLowerCase() === trimmed.toLowerCase())
    );

    if (match) {
      const isExpired = getExpiryStatus(match.expiry_date).label === 'Expired';
      if (activeTab === 'catalog' && isExpired) {
        setNotice({
          tone: 'error',
          text: `Cannot select lot "${match.batch_no}" (${match.name}): expired on ${new Date(match.expiry_date).toISOString().split('T')[0]}. Use Adjust & Dispose to remove this lot.`,
        });
        setBarcodeQuery('');
        return;
      }
      if (!isExpired) setBatchId(match.batch_id.toString());
      setAdjustBatchId(match.batch_id);
      setNotice({
        tone: 'success',
        text: `${isHardwareHID ? 'USB HID Scanner' : 'Barcode search'}: Selected ${match.name} (Lot ${match.batch_no}) · ${match.quantity_on_hand} ${match.unit || 'pcs'} on hand`,
      });
      setBarcodeQuery('');
    } else {
      setNotice({ tone: 'error', text: `Barcode / Lot "${trimmed}" not found in active clinic inventory.` });
    }
  }, [activeTab, batches]);

  useEffect(() => {
    let buffer = '';
    let lastKeyTime = 0;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      const isControl = target?.closest('input, textarea, select, button, a, [contenteditable], [role="dialog"]');
      if (dialogOpen || submittingRef.current || e.defaultPrevented || e.isComposing || e.ctrlKey || e.altKey || e.metaKey ||
          (isControl && target !== barcodeInputRef.current)) {
        buffer = '';
        return;
      }

      const now = Date.now();
      const timeDiff = now - lastKeyTime;
      lastKeyTime = now;

      if (e.key === 'Enter') {
        if (buffer.length >= 2 && timeDiff <= 150) {
          const scanned = buffer.trim();
          buffer = '';
          if (scanned) {
            e.preventDefault();
            processScannedCode(scanned, true);
          }
        } else {
          buffer = '';
        }
        return;
      }

      if (e.key.length === 1) {
        if (timeDiff > 60) {
          buffer = e.key;
        } else {
          buffer += e.key;
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [dialogOpen, processScannedCode]);

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    processScannedCode(barcodeQuery, false);
  };

  const filteredLogs = inventoryLogs.filter((l) => {
    const matchesType = logTypeFilter === 'all'
      ? true
      : logTypeFilter === 'dispose'
      ? ['dispose', 'adjust', 'recall', 'return'].includes(l.transaction_type)
      : l.transaction_type === logTypeFilter;
    const query = logSearchQuery.trim().toLowerCase();
    const matchesSearch = !query
      || (l.medicine_name && l.medicine_name.toLowerCase().includes(query))
      || (l.batch_no && l.batch_no.toLowerCase().includes(query))
      || (l.performed_by_name && l.performed_by_name.toLowerCase().includes(query))
      || (l.reason && l.reason.toLowerCase().includes(query));
    return matchesType && matchesSearch;
  });

  const submitInventoryChange = async (
    path: string,
    request: Pick<RequestInit, 'method' | 'body'>,
    messages: { pending: string; failed: string },
  ) => {
    if (submittingRef.current) return false;
    submittingRef.current = true;
    setIsSubmitting(true);
    setNotice({ tone: 'info', text: messages.pending });
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/inventory/${path}`, {
        ...request,
        headers: request.body
          ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
          : { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      setNotice(res.ok
        ? { tone: 'success', text: data.message || 'Inventory updated.' }
        : { tone: 'error', text: data.error || messages.failed });
      return res.ok;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setNotice({ tone: 'error', text: `Network error: ${detail}` });
      return false;
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleDeductStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current || !selectedBatch) return;
    if (getExpiryStatus(selectedBatch.expiry_date).label === 'Expired') {
      setNotice({
        tone: 'error',
        text: `Cannot dispense expired medication: lot "${selectedBatch.batch_no}" is expired. Use Adjust & Dispose to remove this lot.`,
      });
      return;
    }
    const saved = await submitInventoryChange('deduct', {
      method: 'POST',
      body: JSON.stringify({ batch_id: Number(batchId), quantity_deducted: Number(quantity), reason }),
    }, { pending: 'Recording dispensation…', failed: 'Failed to deduct stock.' });
    if (saved) {
      fetchBatches();
      fetchReorderAndAlerts();
      setBatchId('');
      setQuantity('1');
    }
  };

  const handleReceiveStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (stockInMedId === '') return;
    const saved = await submitInventoryChange('receive', {
      method: 'POST',
      body: JSON.stringify({
        medicine_id: Number(stockInMedId),
        batch_no: stockInBatchNo.trim(),
        manufacture_date: stockInMfgDate,
        expiry_date: stockInExpDate,
        supplier: stockInSupplier.trim(),
        quantity_received: Number(stockInQty),
      }),
    }, { pending: 'Logging shipment receipt…', failed: 'Failed to record shipment intake.' });
    if (saved) {
      setStockInBatchNo('');
      setStockInQty('100');
      fetchBatches();
      fetchReorderAndAlerts();
    }
  };

  const executeAdjustStock = async () => {
    const saved = await submitInventoryChange('adjust', {
      method: 'POST',
      body: JSON.stringify({
        batch_id: Number(adjustBatchId),
        quantity_removed: Number(adjustQty),
        transaction_type: adjustType,
        reason: adjustReason,
      }),
    }, { pending: 'Processing inventory adjustment…', failed: 'Failed to adjust inventory.' });
    if (saved) {
      fetchBatches();
      fetchReorderAndAlerts();
      setAdjustBatchId('');
      setAdjustQty('1');
    }
  };

  const handleAdjustStock = (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    if (!adjustBatchId) {
      setNotice({ tone: 'error', text: 'Please select a batch to adjust.' });
      return;
    }

    const targetBatch = batches.find((b) => b.batch_id === Number(adjustBatchId));
    const targetName = targetBatch ? `${targetBatch.name} (${targetBatch.batch_no})` : `Batch #${adjustBatchId}`;

    setConfirmDialog({
      title: 'Confirm Removal',
      message: `Are you sure you want to mark ${adjustQty} unit(s) as '${adjustType.toUpperCase()}' for:\n\n${targetName}\n\nReason: "${adjustReason}"\n\nThis will permanently deduct the quantity from available stock.`,
      confirmLabel: 'Confirm Removal',
      isDestructive: true,
      onConfirm: executeAdjustStock,
    });
  };

  const executeCreateMedicine = async () => {
    const saved = await submitInventoryChange('medicines', {
      method: 'POST',
      body: JSON.stringify({
        name: newMedName.trim(),
        generic_name: newMedGeneric.trim(),
        form: newMedForm,
        strength: newMedStrength.trim(),
        unit: newMedUnit,
        reorder_level: Number(newMedReorder),
      }),
    }, { pending: 'Registering new formulary medicine…', failed: 'Failed to add medicine.' });
    if (saved) {
      setNewMedName('');
      setNewMedGeneric('');
      fetchMedicines();
    }
  };

  const handleCreateMedicine = (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;

    const existingMatch = medicines.find(
      (m) =>
        m.name.trim().toLowerCase() === newMedName.trim().toLowerCase() &&
        m.strength.trim().toLowerCase() === newMedStrength.trim().toLowerCase()
    );

    if (existingMatch) {
      setConfirmDialog({
        title: 'Duplicate Formulary Warning',
        message: `"${newMedName} (${newMedStrength})" already exists in the formulary catalog!\n\nAre you sure you want to create another separate entry for this medicine?`,
        confirmLabel: 'Add Duplicate',
        isDestructive: false,
        onConfirm: executeCreateMedicine,
      });
    } else {
      setConfirmDialog({
        title: 'Confirm Formulary Entry',
        message: `Add new medicine to formulary?\n\n• Name: ${newMedName.trim()}\n• Generic: ${newMedGeneric.trim()}\n• Form & Strength: ${newMedForm} · ${newMedStrength.trim()}\n• Buffer threshold: ${newMedReorder} ${newMedUnit}`,
        confirmLabel: 'Add to Formulary',
        isDestructive: false,
        onConfirm: executeCreateMedicine,
      });
    }
  };

  const handleDeleteMedicine = (medicineId: number, medName: string) => {
    if (submittingRef.current) return;
    setConfirmDialog({
      title: 'Delete Formulary Entry',
      message: `Remove "${medName}" from the active formulary and the Stock-in dropdown?\n\nAny remaining stock, including expired stock, must be cleared before the entry can be removed.`,
      confirmLabel: 'Delete',
      isDestructive: true,
      onConfirm: async () => {
        const saved = await submitInventoryChange(`medicines/${medicineId}`, { method: 'DELETE' }, {
          pending: `Removing "${medName}"…`,
          failed: 'Failed to delete medicine.',
        });
        if (saved) {
          fetchMedicines();
          fetchBatches();
        }
      },
    });
  };

  const fieldLabel: React.CSSProperties = {
    display: 'block', fontSize: 11.5, fontWeight: 700,
    color: T.textSub, marginBottom: 6,
  };

  return (
    <section className="inventory-workspace" aria-labelledby="inventory-title">
      <div className="vd-page-head inventory-heading">
        <div className="vd-page-head-eyebrow">Clinic operations</div>
        <h3 id="inventory-title" className="vd-page-head-title" tabIndex={-1}>
          <Icon name="medication" size={20} tone="primary" /> Medicine & first-aid inventory
        </h3>
        <p className="vd-page-head-sub">
          Track medicine lots, record stock movements, and review expiry alerts.
        </p>
      </div>

      <nav className="inventory-nav" aria-label="Inventory sections">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className="inventory-nav-button"
              aria-current={isActive ? 'true' : undefined}
              onClick={() => {
                setActiveTab(tab.id);
                if (!submittingRef.current) setNotice(null);
                if (tab.id === 'logs') fetchLogs();
                if (tab.id === 'alerts') fetchReorderAndAlerts();
              }}
            >
              <Icon name={tab.icon} size={18} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {notice && (
        <div className="inventory-notice" role={notice.tone === 'error' ? 'alert' : 'status'} style={noticeStyles[notice.tone]()}>
          <Icon name={noticeIcons[notice.tone]} size={18} />
          <span>{notice.text}</span>
        </div>
      )}
      {tabResources[activeTab].some((resource) => readStatus[resource] === 'error') && (
        <div className="inventory-notice" role="alert" style={calloutDanger()}>
          <Icon name="error" size={18} />
          <span>Some inventory data could not be loaded. Displayed results may be out of date.</span>
        </div>
      )}

      {/* ── CATALOG & DISPENSE ──────────────────────────── */}
      {activeTab === 'catalog' && (
        <div>
          <form className="inventory-lookup" onSubmit={handleBarcodeSubmit}>
            <div>
              <label htmlFor="inventory-barcode" style={fieldLabel}>Barcode or batch lookup</label>
              <input
                id="inventory-barcode"
                ref={barcodeInputRef}
                type="text"
                placeholder="Scan a code or enter a lot number, batch ID, or medicine name"
                value={barcodeQuery}
                onChange={(e) => setBarcodeQuery(e.target.value)}
                style={inputStyle}
                disabled={isSubmitting}
              />
            </div>
            <button type="submit" style={btnPrimary} disabled={isSubmitting}>
              <Icon name="search" size={16} />
              Find lot
            </button>
          </form>

          <div className="inventory-split inventory-catalog">
            <div>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', marginBottom: 12,
              }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: T.text }}>
                  First-expiry-first-out batches (FEFO)
                </span>
                <small style={{ color: T.textSub, fontSize: 11.5 }}>
                  Select a lot to dispense manually
                </small>
              </div>

              <div className="inventory-table" style={{ maxHeight: 420 }} tabIndex={0} role="region" aria-label="Dispensable batches">
                <table className="tbl" style={{ fontSize: 12.5 }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                    <tr>
                      <th scope="col" style={{ width: 44 }}><span className="inventory-sr-only">Select lot</span></th>
                      <th>Medicine</th>
                      <th>Lot / batch</th>
                      <th style={{ textAlign: 'right' }}>Stock</th>
                      <th>Expires</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.filter((b) => getExpiryStatus(b.expiry_date).label !== 'Expired').length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: '36px 16px', textAlign: 'center', color: T.textMuted }}>
                          {emptyText('batches', 'No unexpired lots available for dispensation.')}
                        </td>
                      </tr>
                    ) : (
                      batches
                        .filter((b) => getExpiryStatus(b.expiry_date).label !== 'Expired')
                        .map((b) => {
                          const status = getExpiryStatus(b.expiry_date);
                          const isSelected = batchId === b.batch_id.toString();
                          const selectBatch = () => {
                            if (submittingRef.current) return;
                            setBatchId(b.batch_id.toString());
                            setAdjustBatchId(b.batch_id);
                            setNotice({ tone: 'success', text: `Selected: ${b.name} (${b.batch_no})` });
                          };
                          return (
                            <tr
                              key={b.batch_id}
                              onClick={selectBatch}
                              style={{
                                cursor: 'pointer',
                                background: isSelected ? T.primaryTint : 'transparent',
                              }}
                            >
                              <td style={{ padding: '12px 14px' }}>
                                <input
                                  className="inventory-batch-radio"
                                  type="radio"
                                  name="inventory-batch"
                                  aria-label={`Select ${b.name} ${b.strength}, lot ${b.batch_no}`}
                                  checked={isSelected}
                                  disabled={isSubmitting}
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={selectBatch}
                                />
                              </td>
                              <td style={{ padding: '12px 14px' }}>
                                <div style={{ fontWeight: 700, color: T.text }}>{b.name}</div>
                                <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
                                  {b.generic_name} · {b.strength}
                                </div>
                              </td>
                              <td style={{
                                padding: '12px 14px', fontFamily: T.mono,
                                fontSize: 11.5, color: T.textSub,
                              }}>
                                {b.batch_no}
                              </td>
                              <td style={{
                                padding: '12px 14px', textAlign: 'right', fontWeight: 800,
                                color: b.quantity_on_hand < 20 ? T.danger : T.primary,
                              }}>
                                {b.quantity_on_hand}
                                <span style={{ fontSize: 10.5, color: T.textMuted, fontWeight: 600, marginLeft: 4 }}>
                                  {b.unit || 'pcs'}
                                </span>
                              </td>
                              <td style={{ padding: '12px 14px', fontSize: 11.5, color: T.textSub }}>
                                {new Date(b.expiry_date).toISOString().split('T')[0]}
                              </td>
                              <td style={{ padding: '12px 14px' }}>
                                <span style={{
                                  padding: '3px 10px', borderRadius: T.radius.pill,
                                  background: status.bg, color: status.color,
                                  fontSize: 10.5, fontWeight: 800, letterSpacing: 0.3,
                                }}>
                                  {status.label}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="inventory-panel">
              <h4 style={{
                margin: '0 0 14px 0', fontSize: 14, fontWeight: 800, color: T.primary,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <Icon name="remove" size={14} /> Dispense stock
              </h4>
              <form onSubmit={handleDeductStock}>
                <div style={{ marginBottom: 14 }}>
                  <div style={fieldLabel}>Selected batch</div>
                  <div className="inventory-selected-batch">
                    {selectedBatch ? (
                      <>
                        <strong>{selectedBatch.name} · {selectedBatch.strength}</strong>
                        <span>Lot {selectedBatch.batch_no} · {selectedBatch.quantity_on_hand} {selectedBatch.unit || 'pcs'} on hand</span>
                      </>
                    ) : 'Scan a lot or select a batch from the table.'}
                  </div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label htmlFor="inventory-dispense-quantity" style={fieldLabel}>Quantity</label>
                  <input
                    id="inventory-dispense-quantity"
                    style={inputStyle}
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    disabled={isSubmitting}
                    required
                  />
                </div>
                <div style={{ marginBottom: 18 }}>
                  <label htmlFor="inventory-dispense-reason" style={fieldLabel}>Reason / remarks</label>
                  <input
                    id="inventory-dispense-reason"
                    style={inputStyle}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    disabled={isSubmitting}
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={!selectedBatch || isSubmitting}
                  style={{ ...btnPrimary, width: '100%' }}
                >
                  Confirm dispensation
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── STOCK-IN ────────────────────────────────────── */}
      {activeTab === 'stockin' && (
        <div className="inventory-panel inventory-standalone">
          <h4 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: T.primary }}>
            <Icon name="download" size={14} /> Log incoming medication shipment
          </h4>
          <p style={{ margin: '0 0 20px', fontSize: 12.5, color: T.textSub }}>
            Receiving an existing medicine and lot adds stock to that lot and keeps its recorded dates.
          </p>

          <form onSubmit={handleReceiveStock} className="inventory-field-grid">
            <div className="inventory-field-wide">
              <label htmlFor="inventory-medicine" style={fieldLabel}>Medicine master</label>
              <select id="inventory-medicine" disabled={isSubmitting} style={inputStyle} value={stockInMedId} onChange={(e) => setStockInMedId(Number(e.target.value))} required>
                {medicines.length === 0 && <option value="">{emptyText('medicines', 'No formulary medicines available')}</option>}
                {medicines.map((m) => (
                  <option key={m.medicine_id} value={m.medicine_id}>
                    {m.name} ({m.generic_name}) — {m.strength} [{m.form}]
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="inventory-stock-lot" style={fieldLabel}>Lot / batch number</label>
              <input
                id="inventory-stock-lot"
                disabled={isSubmitting}
                style={inputStyle}
                placeholder="e.g. BATCH-BIO-2026C"
                value={stockInBatchNo}
                onChange={(e) => setStockInBatchNo(e.target.value)}
                required
              />
            </div>

            <div>
              <label htmlFor="inventory-stock-quantity" style={fieldLabel}>Quantity received</label>
              <input
                id="inventory-stock-quantity"
                disabled={isSubmitting}
                style={inputStyle}
                type="number"
                min="1"
                value={stockInQty}
                onChange={(e) => setStockInQty(e.target.value)}
                required
              />
            </div>

            <div>
              <label htmlFor="inventory-manufacture-date" style={fieldLabel}>Manufacture date</label>
              <input
                id="inventory-manufacture-date"
                disabled={isSubmitting}
                style={inputStyle}
                type="date"
                value={stockInMfgDate}
                onChange={(e) => setStockInMfgDate(e.target.value)}
                required
              />
            </div>

            <div>
              <label htmlFor="inventory-expiry-date" style={fieldLabel}>Expiry date</label>
              <input
                id="inventory-expiry-date"
                disabled={isSubmitting}
                style={inputStyle}
                type="date"
                value={stockInExpDate}
                onChange={(e) => setStockInExpDate(e.target.value)}
                required
              />
            </div>

            <div className="inventory-field-wide">
              <label htmlFor="inventory-supplier" style={fieldLabel}>Supplier / distributor</label>
              <input
                id="inventory-supplier"
                disabled={isSubmitting}
                style={inputStyle}
                value={stockInSupplier}
                onChange={(e) => setStockInSupplier(e.target.value)}
                required
              />
            </div>

            <div className="inventory-field-wide inventory-form-actions">
              <button type="submit" style={btnPrimary} disabled={isSubmitting || stockInMedId === ''}>
                <Icon name="download" size={14} /> Record stock intake to central ledger
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── ADJUST & DISPOSE ────────────────────────────── */}
      {activeTab === 'adjust' && (
        <div className="inventory-panel inventory-standalone">
          <h4 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: T.danger }}>
            <Icon name="delete" size={14} /> Discard expired / damaged medicines
          </h4>
          <p style={{ margin: '0 0 20px', fontSize: 12.5, color: T.textSub }}>
            Removals are permanent and written to the activity log.
          </p>

          <form onSubmit={handleAdjustStock} className="inventory-form-stack">
            <div>
              <label htmlFor="inventory-adjust-lot" style={fieldLabel}>Batch lot</label>
              <select
                id="inventory-adjust-lot"
                disabled={isSubmitting}
                style={inputStyle}
                value={adjustBatchId}
                onChange={(e) => setAdjustBatchId(e.target.value ? Number(e.target.value) : '')}
                required
              >
                <option value="">Choose batch lot…</option>
                {batches
                  .filter((b) => b.quantity_on_hand > 0)
                  .map((b) => (
                    <option key={b.batch_id} value={b.batch_id}>
                      #{b.batch_id} · {b.name} ({b.batch_no}) · Stock: {b.quantity_on_hand} · Exp: {new Date(b.expiry_date).toISOString().split('T')[0]}
                    </option>
                  ))}
              </select>
            </div>

            <div className="inventory-field-grid">
              <div>
                <label htmlFor="inventory-adjust-quantity" style={fieldLabel}>Quantity to remove</label>
                <input
                  id="inventory-adjust-quantity"
                  disabled={isSubmitting}
                  style={inputStyle}
                  type="number"
                  min="1"
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  required
                />
              </div>
              <div>
                <label htmlFor="inventory-adjust-type" style={fieldLabel}>Adjustment type</label>
                <select id="inventory-adjust-type" disabled={isSubmitting} style={inputStyle} value={adjustType} onChange={(e) => setAdjustType(e.target.value as typeof adjustType)}>
                  <option value="dispose">Disposal (expired/spoiled)</option>
                  <option value="recall">Manufacturer recall</option>
                  <option value="return">Supplier return</option>
                  <option value="adjust">Audit discrepancy</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="inventory-adjust-reason" style={fieldLabel}>Official reason / protocol</label>
              <input
                id="inventory-adjust-reason"
                disabled={isSubmitting}
                style={inputStyle}
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="inventory-form-end"
              disabled={isSubmitting}
              style={{ ...btnPrimary, background: T.danger, color: T.textOnDanger }}
            >
              Confirm & remove from available stock
            </button>
          </form>
        </div>
      )}

      {/* ── ALERTS & REORDER ────────────────────────────── */}
      {activeTab === 'alerts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Top row: 2 columns for Reorder suggestions & Expiring stocks */}
          <div className="inventory-split inventory-alerts">
            <div>
              <h4 style={{
                margin: '0 0 12px', fontSize: 14, fontWeight: 800, color: T.warning,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <Icon name="trending_down" size={14} /> Automated reorder suggestions
              </h4>
              <div className="inventory-table" style={{ maxHeight: 360 }} tabIndex={0} role="region" aria-label="Reorder suggestions">
                <table className="tbl" style={{ fontSize: 12 }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                    <tr>
                      <th>Medicine</th>
                      <th style={{ textAlign: 'right' }}>Current stock</th>
                      <th style={{ textAlign: 'right' }}>Buffer</th>
                      <th style={{ textAlign: 'right' }}>Suggested order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reorderSuggestions.length === 0 && (
                      <tr><td colSpan={4}>{emptyText('reorder-suggestions', 'No reorder suggestions available.')}</td></tr>
                    )}
                    {reorderSuggestions.map((s) => (
                      <tr key={s.medicine_id}>
                        <td style={{ fontWeight: 700 }}>{s.name}</td>
                        <td style={{
                          textAlign: 'right', fontWeight: 700,
                          color: s.total_stock_on_hand <= s.reorder_level ? T.danger : T.success,
                        }}>
                          {s.total_stock_on_hand} {s.unit}
                        </td>
                        <td style={{ textAlign: 'right', color: T.textSub }}>
                          {s.reorder_level} {s.unit}
                        </td>
                        <td style={{
                          textAlign: 'right', fontWeight: 700,
                          color: s.suggested_reorder_qty > 0 ? T.warning : T.textMuted,
                        }}>
                          {s.suggested_reorder_qty > 0 ? `+${s.suggested_reorder_qty} ${s.unit}` : 'Adequate'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h4 style={{
                margin: '0 0 12px', fontSize: 14, fontWeight: 800, color: T.danger,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <Icon name="schedule" size={14} /> Expiry alerts
              </h4>
              <div className="inventory-table" style={{ maxHeight: 360 }} tabIndex={0} role="region" aria-label="Expiry alerts">
                {expiringLots.length === 0 ? (
                  <div style={{
                    padding: 24, textAlign: 'center',
                    color: T.textSub, fontSize: 12.5, fontWeight: 700,
                  }}>
                    {emptyText('expiring-soon', 'No expired lots or lots expiring within 90 days.')}
                  </div>
                ) : (
                  <table className="tbl" style={{ fontSize: 12 }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                      <tr>
                        <th>Medicine</th>
                        <th style={{ textAlign: 'right' }}>Stock on hand</th>
                        <th>Expiry date</th>
                        <th>Alert</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expiringLots.map((e) => (
                        <tr key={e.batch_id}>
                          <td>
                            <div style={{ fontWeight: 700 }}>{e.name}</div>
                            <div style={{ fontSize: 10.5, color: T.textMuted }}>{e.generic_name}</div>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: T.danger }}>
                            {e.quantity_on_hand}
                          </td>
                          <td style={{ fontSize: 11, color: T.textSub }}>{e.expiry_date}</td>
                          <td>
                            <span style={{
                              padding: '2px 8px', borderRadius: T.radius.pill,
                              background: e.alert_level === 'EXPIRED' ? T.dangerSoft : T.warningSoft,
                              color: e.alert_level === 'EXPIRED' ? T.danger : T.warning,
                              fontSize: 10, fontWeight: 800, letterSpacing: 0.3,
                            }}>
                              {e.alert_level}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* Low stock category: placed in the middle below them */}
          <div style={{ maxWidth: 1100, width: '100%', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h4 style={{
                margin: 0, fontSize: 14, fontWeight: 800, color: T.warning,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <Icon name="warning" size={14} /> Low stock lots
              </h4>
              {readStatus.batches === 'ready' && (
                <span style={{ fontSize: 11.5, color: T.textSub, fontWeight: 600 }}>
                  {lowStockLots.length} lot{lowStockLots.length === 1 ? '' : 's'} at or below reorder buffer
                </span>
              )}
            </div>

            <div className="inventory-table" style={{ maxHeight: 360 }} tabIndex={0} role="region" aria-label="Low stock lots">
              {lowStockLots.length === 0 ? (
                <div style={{
                  padding: 28, textAlign: 'center',
                  color: T.textSub, fontSize: 12.5, fontWeight: 700,
                }}>
                  {emptyText('batches', 'No active lots at or below their reorder buffer.')}
                </div>
              ) : (
                <table className="tbl" style={{ fontSize: 12 }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                    <tr>
                      <th>Medicine</th>
                      <th>Lot / batch</th>
                      <th style={{ textAlign: 'right' }}>Stock on hand</th>
                      <th style={{ textAlign: 'right' }}>Reorder buffer</th>
                      <th>Expiry date</th>
                      <th style={{ width: 150 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStockLots.map((lot) => {
                      const isCritical = lot.quantity_on_hand <= Math.max(5, Math.floor((lot.reorder_level || 20) / 2));
                      return (
                        <tr key={lot.batch_id}>
                          <td>
                            <div style={{ fontWeight: 700 }}>{lot.name}</div>
                            <div style={{ fontSize: 10.5, color: T.textMuted }}>{lot.generic_name} · {lot.strength}</div>
                          </td>
                          <td style={{ fontFamily: T.mono, fontSize: 11.5, color: T.textSub }}>
                            {lot.batch_no}
                          </td>
                          <td style={{
                            textAlign: 'right', fontWeight: 800,
                            color: isCritical ? T.danger : T.warning,
                          }}>
                            {lot.quantity_on_hand} <span style={{ fontSize: 10, color: T.textMuted }}>{lot.unit || 'pcs'}</span>
                          </td>
                          <td style={{ textAlign: 'right', color: T.textSub }}>
                            {lot.reorder_level || 20} {lot.unit || 'pcs'}
                          </td>
                          <td style={{ fontSize: 11, color: T.textSub }}>
                            {new Date(lot.expiry_date).toISOString().split('T')[0]}
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <span style={{
                              padding: '2px 8px', borderRadius: T.radius.pill,
                              background: isCritical ? T.dangerSoft : T.warningSoft,
                              color: isCritical ? T.danger : T.warning,
                              fontSize: 10, fontWeight: 800, letterSpacing: 0.3,
                            }}>
                              {isCritical ? 'CRITICAL BUFFER' : 'LOW STOCK'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── LOGS ────────────────────────────────────────── */}
      {activeTab === 'logs' && (
        <div>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12,
          }}>
            <div>
              <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: T.primary }}>
                <Icon name="article" size={14} /> Central inventory consumption log
              </h4>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: T.textSub }}>
                Showing <b>{filteredLogs.length}</b> of <b>{inventoryLogs.length}</b> recorded transactions
              </p>
            </div>
            <button type="button" onClick={fetchLogs} style={btnGhost} disabled={loadingLogs}>
              <Icon name="refresh" size={14} /> Refresh
            </button>
          </div>

          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            gap: 12, marginBottom: 16, flexWrap: 'wrap',
            background: T.sage50, padding: 12,
            borderRadius: T.radius.md, border: `1px solid ${T.borderSoft}`,
          }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {([
                { id: 'all',      label: `All actions (${inventoryLogs.length})` },
                { id: 'dispense', label: `Dispensed (${inventoryLogs.filter((l) => l.transaction_type === 'dispense').length})` },
                { id: 'receive',  label: `Received (${inventoryLogs.filter((l) => l.transaction_type === 'receive').length})` },
                { id: 'dispose',  label: `Disposals (${inventoryLogs.filter((l) => ['dispose', 'adjust', 'recall', 'return'].includes(l.transaction_type)).length})` },
              ] as const).map((chip) => {
                const isActive = logTypeFilter === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => setLogTypeFilter(chip.id)}
                    style={{
                      padding: '5px 12px', borderRadius: T.radius.pill,
                      fontSize: 11.5, fontWeight: 700,
                      border: `1px solid ${isActive ? T.primary : T.border}`,
                      background: isActive ? T.primary : T.surface,
                      color: isActive ? T.textOnPrimary : T.textSub,
                      cursor: 'pointer', fontFamily: T.font,
                    }}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>

            <input
              type="text"
              aria-label="Search logs by medicine, lot, staff, or reason"
              placeholder="Search drug, lot, staff…"
              value={logSearchQuery}
              onChange={(e) => setLogSearchQuery(e.target.value)}
              style={{ ...inputStyle, width: 240, padding: '8px 14px', fontSize: 12, borderRadius: T.radius.pill }}
            />
          </div>

          {loadingLogs ? (
            <div style={{ padding: 40, textAlign: 'center', color: T.textSub, fontSize: 13 }}>
              Loading activity logs…
            </div>
          ) : filteredLogs.length === 0 ? (
            <div style={{
              padding: 40, textAlign: 'center', color: T.textMuted, fontSize: 13,
              background: T.sage50, borderRadius: T.radius.md,
              border: `1px dashed ${T.border}`,
            }}>
              {emptyText('logs', 'No transaction records found matching the selected filter.')}
            </div>
          ) : (
            <div className="inventory-table" style={{ maxHeight: 480 }} tabIndex={0} role="region" aria-label="Consumption logs">
              <table className="tbl" style={{ fontSize: 12 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                  <tr>
                    <th style={{ width: 70 }}>Log ID</th>
                    <th>Date & time</th>
                    <th>Action</th>
                    <th>Medicine & lot</th>
                    <th style={{ textAlign: 'right' }}>Delta</th>
                    <th>Performed by</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((l) => {
                    const isInbound = l.transaction_type === 'receive' || l.transaction_type === 'return';
                    const isDispense = l.transaction_type === 'dispense';
                    return (
                      <tr key={l.log_id}>
                        <td style={{ fontFamily: T.mono, fontSize: 11.5, color: T.textSub, fontWeight: 700 }}>
                          #{l.log_id}
                        </td>
                        <td style={{ fontSize: 11.5, color: T.textSub }}>
                          {new Date(l.created_at).toLocaleString()}
                        </td>
                        <td>
                          <span style={{
                            padding: '3px 10px', borderRadius: T.radius.xs,
                            fontSize: 10, fontWeight: 800, letterSpacing: 0.3,
                            background: isInbound ? T.successSoft : isDispense ? T.infoSoft : T.dangerSoft,
                            color: isInbound ? T.success : isDispense ? T.info : T.danger,
                          }}>
                            {l.transaction_type.toUpperCase()}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 700, color: T.text }}>{l.medicine_name}</div>
                          <div style={{ fontSize: 10.5, color: T.textMuted, marginTop: 2 }}>
                            {l.generic_name} · {l.strength} · {l.batch_no}
                          </div>
                        </td>
                        <td style={{
                          textAlign: 'right', fontWeight: 800,
                          color: l.quantity_change > 0 ? T.success : T.danger,
                        }}>
                          {l.quantity_change > 0 ? `+${l.quantity_change}` : l.quantity_change}
                        </td>
                        <td>
                          <div style={{ fontWeight: 700, color: T.text }}>{l.performed_by_name}</div>
                          <div style={{ fontSize: 10.5, color: T.textMuted }}>{l.performed_by_email}</div>
                        </td>
                        <td style={{ color: T.textSub }}>
                          <div>{l.reason}</div>
                          {l.prescription_id && l.prescription_item_id && (
                            <div style={{ marginTop: 3, fontSize: 10.5, color: T.info, fontWeight: 700 }}>
                              Prescription #{l.prescription_id} · Item #{l.prescription_item_id}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── FORMULARY MASTER ────────────────────────────── */}
      {activeTab === 'addmed' && (
        <div className="inventory-split inventory-formulary">
          <div className="inventory-panel">
            <h4 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: T.primary }}>
              <Icon name="add" size={14} /> Register new drug
            </h4>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: T.textSub }}>
              Adds a new formulation definition to the master catalog.
            </p>

            <form onSubmit={handleCreateMedicine} className="inventory-form-stack">
              <div>
                <label htmlFor="inventory-brand" style={fieldLabel}>Brand / trade name</label>
                <input
                  id="inventory-brand"
                  disabled={isSubmitting}
                  style={inputStyle}
                  placeholder="e.g. Alaxan FR"
                  value={newMedName}
                  onChange={(e) => setNewMedName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label htmlFor="inventory-generic" style={fieldLabel}>Generic active ingredient</label>
                <input
                  id="inventory-generic"
                  disabled={isSubmitting}
                  style={inputStyle}
                  placeholder="e.g. Ibuprofen + Paracetamol"
                  value={newMedGeneric}
                  onChange={(e) => setNewMedGeneric(e.target.value)}
                  required
                />
              </div>
              <div className="inventory-field-grid">
                <div>
                  <label htmlFor="inventory-dosage-form" style={fieldLabel}>Dosage form</label>
                  <select id="inventory-dosage-form" disabled={isSubmitting} style={inputStyle} value={newMedForm} onChange={(e) => setNewMedForm(e.target.value)}>
                    <option value="Tablet">Tablet</option>
                    <option value="Capsule">Capsule</option>
                    <option value="Syrup">Syrup</option>
                    <option value="Suspension">Suspension</option>
                    <option value="Inhaler">Inhaler</option>
                    <option value="Ointment">Ointment</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="inventory-strength" style={fieldLabel}>Strength</label>
                  <input
                    id="inventory-strength"
                    disabled={isSubmitting}
                    style={inputStyle}
                    placeholder="e.g. 500mg"
                    value={newMedStrength}
                    onChange={(e) => setNewMedStrength(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="inventory-field-grid">
                <div>
                  <label htmlFor="inventory-unit" style={fieldLabel}>Unit</label>
                  <input
                    id="inventory-unit"
                    disabled={isSubmitting}
                    style={inputStyle}
                    placeholder="pcs, bottle"
                    value={newMedUnit}
                    onChange={(e) => setNewMedUnit(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="inventory-buffer" style={fieldLabel}>Buffer threshold</label>
                  <input
                    id="inventory-buffer"
                    disabled={isSubmitting}
                    style={inputStyle}
                    type="number"
                    min="1"
                    value={newMedReorder}
                    onChange={(e) => setNewMedReorder(e.target.value)}
                    required
                  />
                </div>
              </div>
              <button type="submit" style={btnPrimary} disabled={isSubmitting}>
                <Icon name="add" size={14} /> Add to master formulary
              </button>
            </form>
          </div>

          <div>
            <div className="inventory-table-toolbar">
              <div>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: T.text }}>
                  <Icon name="description" size={14} /> Registered formulary drugs ({medicines.length})
                </h4>
                <p style={{ margin: '2px 0 0', fontSize: 11.5, color: T.textSub }}>
                  Real-time stock computed across active unexpired batches.
                </p>
              </div>
              <input
                type="text"
                aria-label="Filter medicines by brand or generic name"
                placeholder="Filter medicines…"
                value={medSearchFilter}
                onChange={(e) => setMedSearchFilter(e.target.value)}
                style={{ ...inputStyle, width: 170, padding: '6px 12px', fontSize: 12 }}
              />
            </div>

            <div className="inventory-table" style={{ maxHeight: 460 }} tabIndex={0} role="region" aria-label="Registered formulary drugs">
              <table className="tbl inventory-formulary-table" style={{ fontSize: 12 }}>
                <colgroup>
                  <col className="inventory-formulary-name-col" />
                  <col className="inventory-formulary-strength-col" />
                  <col className="inventory-formulary-stock-col" />
                  <col className="inventory-formulary-action-col" />
                </colgroup>
                <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                  <tr>
                    <th>Brand & generic name</th>
                    <th>Form & strength</th>
                    <th style={{ textAlign: 'right' }}>Available stock</th>
                    <th style={{ textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMedicines.length === 0 && (
                    <tr><td colSpan={4}>{emptyText('medicines', 'No formulary entries match the filter.')}</td></tr>
                  )}
                  {filteredMedicines.map((m) => (
                      <tr key={m.medicine_id}>
                        <td>
                          <div style={{ fontWeight: 700, color: T.text }}>{m.name}</div>
                          <div style={{ fontSize: 10.5, color: T.textMuted }}>{m.generic_name}</div>
                        </td>
                        <td style={{ color: T.textSub }}>
                          {m.strength} · {m.form}
                        </td>
                        <td style={{
                          textAlign: 'right',
                          fontWeight: 800,
                          color: (m.available_stock ?? 0) <= 0 ? T.danger : T.primary,
                        }}>
                          {m.available_stock ?? 0} {m.unit || 'pcs'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => handleDeleteMedicine(m.medicine_id, m.name)}
                            style={{
                              padding: '4px 10px',
                              borderRadius: T.radius.sm,
                              border: `1px solid ${T.dangerBorder}`,
                              background: T.dangerSoft,
                              color: T.danger,
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer',
                              fontFamily: T.font,
                              whiteSpace: 'nowrap',
                            }}
                            title="Delete this formulary definition"
                          >
                            <Icon name="delete" size={12} /> Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIRMATION MODAL ──────────────────────────── */}
      {confirmDialog && (
        <dialog
          ref={dialogRef}
          className="inventory-dialog"
          aria-labelledby="inventory-dialog-title"
          aria-describedby="inventory-dialog-message"
          onCancel={(event) => {
            event.preventDefault();
            setConfirmDialog(null);
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) setConfirmDialog(null);
          }}
        >
          <div className="modal-card">
            <h3 id="inventory-dialog-title" style={{
              margin: '0 0 12px', fontSize: 17, fontWeight: 800,
              color: confirmDialog.isDestructive ? T.danger : T.primary,
            }}>
              {confirmDialog.title}
            </h3>
            <p id="inventory-dialog-message" style={{
              fontSize: 13, color: T.textSub, margin: '0 0 22px',
              lineHeight: 1.55, whiteSpace: 'pre-line',
            }}>
              {confirmDialog.message}
            </p>
            <div className="inventory-dialog-actions">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                style={btnGhost}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const action = confirmDialog.onConfirm;
                  setConfirmDialog(null);
                  void action();
                }}
                style={{
                  ...btnPrimary,
                  background: confirmDialog.isDestructive ? T.danger : T.primary,
                  color: confirmDialog.isDestructive ? T.textOnDanger : T.textOnPrimary,
                }}
              >
                {confirmDialog.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </dialog>
      )}
    </section>
  );
}
