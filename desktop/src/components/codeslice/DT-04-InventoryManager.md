# DT-04 · InventoryManager.tsx

Desktop component slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py desktop/src/components/codeslice .`

## DT-04 · desktop/src/components/InventoryManager.tsx
**LOC:** 1462 · **Anchor commit:** ed2c817 · **Role:** Medicine inventory: FEFO catalog/dispense, stock-in, adjust-dispose, alerts, logs, formulary CRUD
**Mounted by:** NurseConsole.tsx L411-413 (viewMode === 'inventory', initialTab=selectedInvTab); sole import/mount site
**API surface:** GET /api/inventory/batches (L108), GET /api/inventory/medicines (L118), GET /api/inventory/reorder-suggestions (L133), GET /api/inventory/expiring-soon (L134), GET /api/inventory/logs (L145), POST /api/inventory/deduct (L282), POST /api/inventory/receive (L311), POST /api/inventory/adjust (L342), POST /api/inventory/medicines (L390), DELETE /api/inventory/medicines/:medicineId (L454)
**Socket events:** on inventory:updated (L165); no emits
**State / key fields:** Tab/dialog: activeTab, confirmDialog · catalog: batchId, quantity, reason, statusMessage, batches, medicines, barcodeQuery, logTypeFilter, logSearchQuery · stock-in: stockInMedId/BatchNo/MfgDate/ExpDate/Supplier/Qty · adjust: adjustBatchId/Qty/Type/Reason · alerts/logs: reorderSuggestions, expiringLots, inventoryLogs, loadingLogs; derived lowStockLots, filteredLogs · formulary: newMedName/Generic/Form/Strength/Unit/Reorder, medSearchFilter; ref barcodeInputRef

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-6 | socket.io-client | Imports: React hooks, socket.io, theme (T, buttons, inputs), API/SOCKET config, Icon |
| 2 | 8-34 | getExpiryStatus | MedicineMaster/InvTab/ConfirmDialogState types; getExpiryStatus: Expired, Expiring soon (<=90d), Good |
| 3 | 36-52 | Catalog & Deduction | Component open; activeTab, confirmDialog; catalog state: batchId, quantity, reason, batches, medicines, barcode |
| 4 | 54-70 | stockInMedId | Stock-in state (medId, batchNo, mfg/exp dates, supplier, qty); adjust state (batchId, qty, type, reason) |
| 5 | 72-87 | reorderSuggestions | reorderSuggestions, expiringLots, inventoryLogs, loadingLogs; newMed* fields + medSearchFilter |
| 6 | 89-102 | lowStockLots | initialTab sync effect; lowStockLots derived: unexpired lots at/below reorder buffer, sorted |
| 7 | 104-127 | fetchMedicines | GET /api/inventory/batches (batches) + GET /api/inventory/medicines (medicines, default stockInMedId) |
| 8 | 129-151 | fetchLogs | fetchReorderAndAlerts: GET reorder-suggestions + expiring-soon; fetchLogs: GET /api/inventory/logs |
| 9 | 153-176 | inventory:updated | Mount effect: initial fetches; socket connect; on inventory:updated refetch all + sync message |
| 10 | 178-209 | processScannedCode | Barcode lookup by batch_no/batch_id/name; expired lots blocked on catalog; sets batchId + adjustBatchId |
| 11 | 211-248 | handleGlobalKeyDown | Global keydown: USB HID buffer (60ms cadence), Enter submits scan; cleanup on unmount |
| 12 | 250-268 | filteredLogs | handleBarcodeSubmit; filteredLogs: type filter (all/dispense/receive/dispose) + text search |
| 13 | 270-304 | handleDeductStock | POST /api/inventory/deduct (batch_id, quantity_deducted, reason); expired-lot guard |
| 14 | 306-336 | handleReceiveStock | POST /api/inventory/receive (medicine_id, batch_no, mfg/exp dates, supplier, qty) |
| 15 | 338-384 | executeAdjustStock | executeAdjustStock POSTs /api/inventory/adjust; handleAdjustStock opens destructive confirm first |
| 16 | 386-442 | executeCreateMedicine | POST /api/inventory/medicines; handleCreateMedicine confirm dialog (duplicate formulary warning) |
| 17 | 444-471 | handleDeleteMedicine | DELETE /api/inventory/medicines/:medicineId behind destructive confirm dialog |
| 18 | 473-485 | Catalog & dispense | Tab config (6 tabs); fieldLabel style constant |
| 19 | 487-538 | Medicine & first-aid inventory | Page header; tab bar — logs tab fetchLogs, alerts tab fetchReorderAndAlerts on click |
| 20 | 540-550 | statusMessage | statusMessage banner: success when it contains Selected, else danger styling |
| 21 | 552-572 | USB Barcode / QR Scanner active | Catalog tab open; barcode scan form (barcodeQuery + Find lot submit) |
| 22 | 573-682 | First-expiry-first-out batches | FEFO lot table: unexpired rows, radio select, stock, expiry, status pill |
| 23 | 684-743 | Dispense stock | Dispense form: selected batch, quantity, reason; submit handleDeductStock |
| 24 | 745-829 | Log incoming medication shipment | Stock-in form: medicine select, lot, qty, mfg/exp dates, supplier; handleReceiveStock |
| 25 | 831-902 | Discard expired / damaged medicines | Adjust form: batch select, qty, type (dispose/recall/return/adjust), reason; handleAdjustStock |
| 26 | 904-954 | Automated reorder suggestions | Reorder suggestions table: current stock, buffer, suggested order qty |
| 27 | 955-1013 | Expiring stocks on shelf | Expiring <90d lots table: stock on hand, expiry date, alert_level pill |
| 28 | 1015-1096 | Low stock lots | Low stock lots table: CRITICAL BUFFER vs LOW STOCK pills; empty state; tab close |
| 29 | 1098-1116 | Central inventory consumption log | Logs header: filtered/total counts; Refresh button (fetchLogs) |
| 30 | 1118-1159 | Search drug, lot, staff | Log filter chips (All/Dispensed/Received/Disposals) + search input |
| 31 | 1161-1245 | No transaction records found | Logs table: log_id, date, action pill, medicine/lot, delta, performed_by, reason/prescription |
| 32 | 1247-1329 | Register new drug | New drug form: brand, generic, form, strength, unit, buffer threshold; handleCreateMedicine |
| 33 | 1331-1417 | Registered formulary drugs | Formulary table: brand/generic, form/strength, stock on hand; per-row Delete button |
| 34 | 1419-1463 | modal-backdrop | Confirmation modal (title, message, Cancel/Confirm); component close |
