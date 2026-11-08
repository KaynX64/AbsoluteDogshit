<!-- split from desktop/src/components/AGENTS.md — part 03 of 04 -->
### NurseConsole.tsx — 1,941 lines / 76 KB / 22 useState. Triage queue, expected, intake, live metrics
- **Slice map:** `codeslice/DT-03-NurseConsole.md` (36 slices, verified @ 93b4172).
- Exports: `NurseViewMode` L95 (`'triage'|'expected'|'inventory'`), component L499. App.tsx owns the mode (L486; tab bar L164-166) — `viewMode` prop is controlled, falls back to internal state.
- Station metrics are derived from live data, never hard-coded: queue L548 (`GET /api/appointments/queue/today`), active SOS L567, no-shows L615, inventory L628 (`GET /api/inventory/dashboard-summary`), expected L645 — rendered as tiles at L1652.
- Sockets L674-728: `queue:updated`, `emergency:new_alert`, `emergency:status_change`, `inventory:updated`, `appointment:status_changed`, `appointment:booked` — each triggers a targeted refetch.
- Actions: `updateSosStatus` L583 (in-app confirm portal rendered at `document.body` to cover the full app window), `callNextPatient` L729 (emergency tickets offered first), check-in confirm L756 / execute L781 (`POST /api/appointments/:id/checkin`).
- Views: `inventory` L1183 (+ SOS safety strip); `expected` L1238; SOS band L877 (rendered on triage, expected and inventory); `QrIntakeScanner` embedded L1712.

### ResponderConsole.tsx — 495 lines / 21 KB. SOS list & dispatch
- **Slice map:** `codeslice/DT-12-ResponderConsole.md` (15 slices, verified @ 93b4172).
- Poll `fetchAlerts` L28 (`GET /api/emergency/active`) + sockets `emergency:new_alert` L53, `emergency:status_change` L64. Alarm `playEmergencyAlarm` L13 (WebAudio).
- `updateStatus` L84 (`PATCH /api/emergency/:id/status`), test hooks L109/L121 (`POST /api/emergency/sos`), `statusStyle` L143.

### IncidentReportModal.tsx — 550 lines. Post-resolution incident documentation popup
- **Slice map:** `codeslice/DT-11-IncidentReportModal.md` (18 slices, verified @ 93b4172).
- Mounted once by App.tsx for every console view. Opens only on `emergency:incident_report_required`, which the server sends to the specific desktop window that resolved the incident; historical pending alerts do not auto-open when a console starts.
- Pre-fill `useEffect` L98 (`GET /api/emergency/:alertId/incident-report`) — patient name / ID number / contact number / role come from the server; `resolvedAt` defaults to the stored resolution timestamp (editable `datetime-local`).
- Submit `submitReport` L233 (`POST /api/emergency/:alertId/incident-report`; 409 `REPORT_ALREADY_FILED` = another console won, popup dismisses). Socket `emergency:incident_reported` (L189) dismisses this console's popup when someone else files first. "Skip for now" dismisses for the session only.
- Queue behavior: popups arriving while a form is open are queued and shown one by one (`openFor` L85 / `closePopup` L212).

## Feature components

### InventoryManager.tsx — 1,464 lines / 63 KB / 32 useState. Stock movements & medicine CRUD
- **Slice map:** `codeslice/DT-04-InventoryManager.md` (34 slices, verified @ 93b4172).
- Loads: batches L105, medicines L115, reorder-suggestions + expiring-soon L129, movement logs L141. Socket `inventory:updated` L160 → refetch (server emits it on every deduct/receive/adjust).
- Barcode: `processScannedCode` L179, `handleBarcodeSubmit` L250. Movements: deduct L270, receive L306, adjust L338. CRUD: create medicine L386, delete L444 (`DELETE /api/inventory/medicines/:id`).

### QrIntakeScanner.tsx — 1,440 lines / 51 KB / 21 useState. Patient intake
- **Slice map:** `codeslice/DT-05-QrIntakeScanner.md` (26 slices, verified @ 93b4172).
- Props: `onPatientVerified(patient, token)` — hands verified patients to NurseConsole.
- Flow: active-ticket check L102 → health-pass verify L123 (`POST /api/health-pass/verify`) → manual search L165 (`/api/appointments/lookup`) → appointment check L239 → confirm arrival L258 (checkin) → walk-in register L297.
- Camera via jsQR: `startCamera` L338, `tickScan` L371, QR image upload L395.
