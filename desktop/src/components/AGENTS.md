# desktop/src/components/
Flat folder, one component per file, header comment `// desktop/src/components/<Name>.tsx`.

## Consoles (huge — never open whole; `grep -n "function \|const .* = (" file` then range-read)
| File | Lines | Role |
|---|---|---|
| DoctorConsole.tsx | ~4.2k | consultations, EMR, prescriptions, clearances |
| AdminConsole.tsx | ~2.6k | users, roles/permissions, system |
| NurseConsole.tsx | ~1.5k | queue, vitals, intake |
| ResponderConsole.tsx | | SOS response |

## Feature components
QrIntakeScanner (~1.3k, jsQR camera intake + offline SQLite search) · InventoryManager (~1.5k) · AnalyticsDashboard (~1.3k) · PrescriptionGenerator (~1k) · CreateUserModal · DentalChart · VaccinationInputter · InteractionWarning · EmergencyAlertBanner · ServerPingMonitor · SignatureEnrollment · SignaturePad (`signature_pad`) · PasswordStrengthIndicator · Icon

## Rules
- Reuse `Icon`, theme tokens, `InteractionWarning`, `SignaturePad` — don't duplicate.
- Prefer extracting new logic into a new file here (or `services/`) over growing the 2–4k-line consoles.
- Role-gated UI is cosmetic; the server enforces roles. Never rely on it for security.
