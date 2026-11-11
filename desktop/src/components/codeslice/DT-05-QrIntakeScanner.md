# DT-05 · QrIntakeScanner.tsx

Desktop component slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py desktop/src/components/codeslice .`

## DT-05 · desktop/src/components/QrIntakeScanner.tsx
**LOC:** 1418 · **Anchor base:** 2727901 + current changes · **Role:** QR intake desk: webcam/file QR verification, ID search, triage vitals, appointment check-in, walk-in tickets
**Mounted by:** NurseConsole.tsx L1722 (intake view; prop onPatientVerified(patient, token) hands verified patients to NurseConsole)
**API surface:** GET /api/appointments/patient/:userId/active-ticket (L129); POST /api/health-pass/verify (L171); GET /api/appointments/lookup?query= (L207); GET /api/appointments/lookup?userId= (L271); POST /api/appointments/:id/checkin (L300); POST /api/appointments/walk-in (L341)
**Socket events:** none
**State / key fields:** intake: scanMode camera|search, searchQuery, scanStatus, verifiedPatient, pendingAppointment, checkInSuccess · queue: activeTicket, loadingActiveTicket (duplicate prevention), walkInSuccess, isRegisteringWalkIn · vitals: bp, temp, pulse, spo2, respRate, sex, height, weight, lastVerifiedAt, touchedVitals, rejectedVitals; validated values and derived BMI feedback · camera: isCameraActive, cameraError; refs videoRef/canvasRef/animationFrameId (jsQR decode loop) · offline fallback via window.electronAPI.offlineSearchPatients (SQLite) · inline palette object C resolved from live theme tokens

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-23 | interface ActiveTicket | imports (jsQR, API_BASE_URL, live theme tokens, Icon); QrIntakeScannerProps + ActiveTicket interfaces |
| 2 | 24-92 | const [scanMode, setScanMode] | useState: scanMode, searchQuery, verifiedPatient, pendingAppointment, activeTicket, vitals, camera; bmi derived |
| 3 | 95-122 | Resolve the current palette | inline palette object C resolves active theme tokens for intake styles |
| 4 | 123-142 | checkActiveTicket = async | checkActiveTicket: GET /api/appointments/patient/:userId/active-ticket → activeTicket |
| 5 | 145-193 | resetIntake | Reset readings and patient context before lookup. QR verify loads the new patient, ticket and booking. |
| 6 | 194-259 | handleManualSearch = async | handleManualSearch: GET /api/appointments/lookup?query=; offline fallback electronAPI.offlineSearchPatients |
| 7 | 261-276 | checkPatientAppointments = async | checkPatientAppointments: GET /api/appointments/lookup?userId= → pendingAppointment and profile context |
| 8 | 280-322 | checkVitalInputs | Gate booked intake and focus the first invalid reading if submission is attempted. |
| 9 | 323-360 | handleRegisterWalkIn = async | POST structured walk-in vitals after validation and handle queue conflicts. |
| 10 | 363-394 | startCamera = async | startCamera/stopCamera: getUserMedia webcam stream, play video, stop tracks + cancel rAF |
| 11 | 396-416 | tickScan = () | tickScan: rAF loop draws video to canvas, jsQR decode, code >20 chars → verifyToken |
| 12 | 418-435 | handleQrFileUpload | unmount cleanup useEffect; handleQrFileUpload decodes QR from uploaded image via jsQR |
| 13 | 440-460 | formatLastVerified | formatLastVerified relative-time helper; status flags statusIsOk/Err/Warn from scanStatus |
| 14 | 461-586 | const updateVital | Reject malformed and above-limit edits, clear rejected blank drafts with Backspace or Delete, and distinguish missing and invalid BMI inputs. |
| 15 | 587-686 | Patient intake & check-in | render shell: card header w/ camera icon, subtitle; Scan/Search ID mode pill switcher (scanMode) |
| 16 | 687-777 | Camera is off | camera viewport: video+canvas refs, 16:9 frame, camera-off placeholder, cameraError banner |
| 17 | 779-819 | Enter student ID | search mode form: student ID/last-name input + Search button → handleManualSearch |
| 18 | 821-939 | Scan QR from file | camera actions row: Turn on/Stop camera buttons; Scan QR from file label + hidden input |
| 19 | 941-977 | Status line | scanStatus banner colored by statusIsOk/Err/Warn (success/danger/warning sage tints) |
| 20 | 979-1091 | Verified patient card | patient card: name, student_no/course, Last verified badge; grid blood type/allergies/h/w/sex/BMI |
| 21 | 1093-1127 | @keyframes spin | active-ticket pre-check: loading spinner while checking queue status |
| 22 | 1128-1232 | Queue ticket | STATE already-in-queue: warning card w/ activeTicket.ticket_no, arrival_time, visit_type, doctor_name |
| 23 | 1233-1276 | Scheduled booking detected | STATE scheduled booking: status pill, Time (formatted_schedule), Purpose + Dr name |
| 24 | 1281-1286 | triageFields | Booked intake displays the shared validated fields. |
| 25 | 1287-1326 | Confirm arrival & check-in patient | Booked check-in action disables while a reading is invalid or the request is pending. |
| 26 | 1327-1362 | No scheduled appointment today | STATE walk-in: header, Walk-in pill, guidance copy for registering into today's live queue |
| 27 | 1363-1418 | Register as walk-in patient | Walk-in intake shows shared fields and blocks registration while readings are invalid. |
