# DT-04 · InventoryManager.tsx

Desktop component slice map · [index](../CODESLICE.md) · [layout stylesheet](../InventoryManager.css)

## DT-04 · desktop/src/components/InventoryManager.tsx

**LOC:** 1502 · **Anchor base:** 2727901 with the nurse inventory redesign applied · **Role:** Batch catalog and dispensing, stock intake, removals, alerts, logs, and formulary.
**Mounted by:** NurseConsole.tsx L1232, inventory view. The triage Stock alerts tile passes the Alerts & reorder initial tab at L1699.
**API surface:** GET /api/inventory/{batches,medicines,reorder-suggestions,expiring-soon,logs}. POST /api/inventory/{deduct,receive,adjust,medicines}. DELETE /api/inventory/medicines/:id.
**Socket events:** Receives inventory:updated and refreshes the read models.
**State:** Selected tab and batch, form and filter fields, read status and cancellation by resource, one pending write, typed notice, confirmation dialog.

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
| 8 | 119-156 | useEffect(() => { | Entry tab sync, dialog focus restoration, selected batch and filtered medicine and low-stock data |
| 9 | 157-181 | const readInventory | Authenticated reads with per-resource cancellation, retained results and status |
| 10 | 182-204 | const fetchBatches | Batch, formulary, alerts and log readers. Revalidate the stock-in selection against refreshed data. |
| 11 | 205-232 | fetchBatches(); | Initial load, socket-triggered refresh and cleanup |
| 12 | 233-265 | const processScannedCode | Exact batch number, batch ID, or medicine-name lookup and expiry handling |
| 13 | 266-308 | let buffer = ''; | USB HID key buffer. Keep scanner keys out of controls and dialogs. |
| 14 | 309-329 | const handleBarcodeSubmit | Manual lookup and consumption log filter/search logic |
| 15 | 330-361 | const submitInventoryChange | Single in-flight write, authenticated request and typed feedback |
| 16 | 362-383 | const handleDeductStock | Direct dispense with selected-batch and client expiry guards |
| 17 | 384-405 | const handleReceiveStock | Direct stock intake with existing payload and success reset |
| 18 | 406-443 | const executeAdjustStock | Stock removal request and destructive confirmation |
| 19 | 444-491 | const executeCreateMedicine | Formulary creation and distinct duplicate/new-entry confirmations |
| 20 | 492-511 | const handleDeleteMedicine | Active formulary deletion behind destructive confirmation |
| 21 | 512-551 | const fieldLabel | Themed workspace heading and six responsive section buttons |
| 22 | 552-564 | {notice && ( | Mutation and sync feedback plus a warning for failed reads |
| 23 | 565-594 | CATALOG & DISPENSE | Labeled barcode input and Find lot action |
| 24 | 595-700 | First-expiry-first-out batches | Expiry-ordered batch table, keyboard-operable radios and row selection |
| 25 | 701-751 | Dispense stock | Selected medicine, strength, lot, stock, quantity and editable reason |
| 26 | 752-848 | STOCK-IN | Centered stock intake form with native medicine select, dates and supplier |
| 27 | 849-929 | ADJUST & DISPOSE | Centered removal form with all four existing reasons for adjustment |
| 28 | 930-985 | ALERTS & REORDER | Read-only reorder suggestions |
| 29 | 986-1035 | > Expiry alerts | Expired and expiring lots with text labels |
| 30 | 1036-1116 | {/* Low stock category: | Low-stock lots and reorder buffer thresholds |
| 31 | 1117-1144 | LOGS | Consumption log header, counts and refresh |
| 32 | 1145-1181 | All actions ( | Action filters, including grouped removals, and text search |
| 33 | 1182-1263 | {loadingLogs ? ( | Log loading/empty states and transaction table |
| 34 | 1264-1361 | FORMULARY MASTER | Medicine registration and native dosage-form options |
| 35 | 1362-1444 | > Registered formulary drugs | Filterable catalog with evenly spaced columns, available stock and one-line Delete action |
| 36 | 1445-1502 | CONFIRMATION MODAL | Native modal, Cancel and Confirm, Escape and backdrop dismissal |
