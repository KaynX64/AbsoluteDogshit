<!-- split from desktop/src/components/AGENTS.md — part 01 of 04 -->
# desktop/src/components/AGENTS.md — component map & navigation anchors

Flat folder: one component per file, header comment `// desktop/src/components/<Name>.tsx`. All line anchors below are for commit **b7556cb** — after edits, re-derive with `rg -n "<symbol>" <File>.tsx` instead of trusting stale numbers.

**Never open a file >1k lines whole.** Use the anchors: read a ±40-line window around the line you need. For the full picture of any monolith, start from `CODESLICE.md` (this directory) — a slim index routing to per-monolith slice maps in `codeslice/` (Mounted-by / API-surface / socket / state header + machine-verified line-range slices with rg-able anchors). Where a sub-MD disagrees with the L-numbers below, the sub-MD is fresher.

## Universal patterns (copy these; don't invent variants)

- Auth: `const token = localStorage.getItem('valetudo_token')` → `headers: { Authorization: \`Bearer ${token}\` }`. App.tsx sets the key at login (L575) and clears both `valetudo_token` + `token` at logout (L125-126).
- Base URL: `import { API_BASE_URL, SOCKET_URL } from '../config/api'` — never hardcode a host.
- HTTP: plain `fetch()` with manual `res.ok` / status-code checks; JSON via `JSON.stringify`. No axios, no react-query.
- Sockets: each realtime component opens its **own** `io(SOCKET_URL, { auth: { token } })` inside a `useEffect` and disconnects on cleanup (canonical pattern: DoctorConsole L351-374). New client-side event names need a matching server `io.emit(...)` in `server/src/routes/*` or `utils/reminderWorker.js`.
- Icons: `<Icon name tone />` only — the name registry is `IconNames` (Icon.tsx L124). Add new glyphs there, not inline SVG.
- Styling: inline `style` objects + live tokens from `../theme`; use `T.textOnPrimary` / semantic `textOn*` tokens for filled controls, and do not add component-local palettes. `index.css` (~75 KB) is globals only.
- Role-gated UI here is cosmetic — the server enforces RBAC on every route. Never treat client checks as security.

## Mount graph (who renders what)

```
App.tsx ─ NURSE→NurseConsole · DOCTOR/DENTIST→DoctorConsole · ADMIN→AdminConsole · EMERGENCY_RESPONDER→ResponderConsole
         └─ IncidentReportModal (mounted once for EVERY console view, App.tsx L785 — post-resolution documentation popup; server routes to the specific desktop window that resolved the alert)
NurseConsole    → QrIntakeScanner (L1104) · InventoryManager (L410, inventory view)
DoctorConsole   → AnalyticsDashboard (L1341) · PrescriptionGenerator (L2507) · SignatureEnrollment (L4263) · EmergencyAlertBanner (SOS banner, mounted for DOCTOR+DENTIST after the signature warning L1273) · embedded odontogram (L2079)
AdminConsole    → CreateUserModal (Add account; modal portals to document.body so the sticky top bar cannot constrain its backdrop) · ServerPingMonitor · AnalyticsDashboard
PrescriptionGenerator → InteractionWarning (L829)
SignatureEnrollment   → SignaturePad
```

- Shell slice maps (indexed in `CODESLICE.md`): `App.tsx` → `codeslice/DT-09-App.md` · `electron/main.cjs` → `codeslice/DT-13-ElectronMain.md`.

**Not mounted (don't build on them):** `DentalChart.tsx` (DoctorConsole embeds its own chart at L2079), `VaccinationInputter.tsx` (**0 bytes, empty, unreferenced — delete or implement**). `EmergencyAlertBanner.tsx` IS now mounted (DoctorConsole) — it self-hides via 403 on `/api/emergency/active` for accounts the server does not consider responders.

## Consoles
