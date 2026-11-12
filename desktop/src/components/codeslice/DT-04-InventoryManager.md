# DT-04 · InventoryManager.tsx

Desktop component slice map · [index](../CODESLICE.md) · [layout stylesheet](../InventoryManager.css)

## DT-04 · desktop/src/components/InventoryManager.tsx

**LOC:** 1531 · **Anchor base:** 2727901 with the nurse inventory redesign applied · **Role:** Batch catalog and dispensing, stock intake, removals, alerts, logs, and formulary.
**Mounted by:** NurseConsole.tsx L1232, inventory view. The triage Stock alerts tile passes the Alerts & reorder initial tab at L1699.
**API surface:** GET /api/inventory/{batches,medicines,reorder-suggestions,expiring-soon,logs}. POST /api/inventory/{deduct,receive,adjust,medicines}. DELETE /api/inventory/medicines/:id.
**Socket events:** Receives inventory:updated and refreshes the read models.
**State:** Selected tab and batch, expiry/reorder alert count badge, form and filter fields, read status and cancellation by resource, one pending write, typed notice, confirmation dialog.

Use the app's active theme tokens and existing Icon component. Split layouts stack based on available workspace width. Stock-in and dispensing submit directly. Adjustment, formulary registration, duplicate registration, and formulary deletion retain their separate confirmation paths.

The client and server preserve their existing expiry cutoffs. The formulary's available stock excludes expired stock. Deletion checks all remaining stock, including expired lots. Alert panels and transaction filters keep their existing stock and action groupings.

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-8 | subscribeToDesktopEvents | Imports shared API, theme helpers, icon and scoped layout CSS |
| 2 | 9-29 | interface MedicineMaster | Formulary type, tab and dialog contracts |
| 3 | 30-52 | type InventoryNotice | Notice tones, data sources by section and six tab definitions |
| 4 | 53-59 | function getExpiryStatus | Existing client expiry rule and expiry labels |
| 5 | 60-84 | export default function InventoryManager | Component and dialog, submission, notice, and request state |
| 6 | 85-102 | stockInMedId, setStockInMedId | Stock-in and adjustment fields and defaults |
| 7 | 103-118 | reorderSuggestions, setReorderSuggestions | Alerts, logs and formulary state |
| 8 | 119-160 | useEffect(() => { | Entry tab sync, dialog focus restoration, selected batch and filtered medicine and low-stock data |
| 9 | 161-185 | const readInventory | Authenticated reads with per-resource cancellation, retained results and status |
| 10 | 186-208 | const fetchBatches | Batch, formulary, alerts and log readers. Revalidate the stock-in selection against refreshed data. |
| 11 | 209-236 | fetchBatches(); | Initial load, socket-triggered refresh and cleanup |
| 12 | 237-269 | const processScannedCode | Exact batch number, batch ID, or medicine-name lookup and expiry handling |
| 13 | 270-312 | let buffer = ''; | USB HID key buffer. Keep scanner keys out of controls and dialogs. |
| 14 | 313-333 | const handleBarcodeSubmit | Manual lookup and consumption log filter/search logic |
| 15 | 334-365 | const submitInventoryChange | Single in-flight write, authenticated request and typed feedback |
| 16 | 366-387 | const handleDeductStock | Direct dispense with selected-batch and client expiry guards |
| 17 | 388-409 | const handleReceiveStock | Direct stock intake with existing payload and success reset |
| 18 | 410-447 | const executeAdjustStock | Stock removal request and destructive confirmation |
| 19 | 448-495 | const executeCreateMedicine | Formulary creation and distinct duplicate/new-entry confirmations |
| 20 | 496-515 | const handleDeleteMedicine | Active formulary deletion behind destructive confirmation |
| 21 | 516-583 | const fieldLabel | Themed workspace heading, six responsive section buttons, and expiry/reorder alert count badge |
| 22 | 584-596 | {notice && ( | Mutation and sync feedback plus a warning for failed reads |
| 23 | 597-626 | CATALOG & DISPENSE | Labeled barcode input and Find lot action |
| 24 | 627-732 | First-expiry-first-out batches | Expiry-ordered batch table, keyboard-operable radios and row selection |
| 25 | 733-783 | Dispense stock | Selected medicine, strength, lot, stock, quantity and editable reason |
| 26 | 784-880 | STOCK-IN | Centered stock intake form with native medicine select, dates and supplier |
| 27 | 881-961 | ADJUST & DISPOSE | Centered removal form with all four existing reasons for adjustment |
| 28 | 962-1047 | ALERTS & REORDER | Alerts page header and top-left low stock lots |
| 29 | 1048-1102 | > Expiry alerts | Expired and expiring lots with text labels in the top-right panel |
| 30 | 1103-1145 | Automated reorder suggestions | Read-only reorder suggestions in the full-width section below |
| 31 | 1146-1173 | LOGS | Consumption log header, counts and refresh |
| 32 | 1174-1210 | All actions ( | Action filters, including grouped removals, and text search |
| 33 | 1211-1292 | {loadingLogs ? ( | Log loading/empty states and transaction table with non-wrapping action labels |
| 34 | 1293-1390 | FORMULARY MASTER | Medicine registration and native dosage-form options |
| 35 | 1391-1473 | > Registered formulary drugs | Filterable catalog with evenly spaced columns, available stock and one-line Delete action |
| 36 | 1474-1531 | CONFIRMATION MODAL | Native modal, Cancel and Confirm, Escape and backdrop dismissal |
