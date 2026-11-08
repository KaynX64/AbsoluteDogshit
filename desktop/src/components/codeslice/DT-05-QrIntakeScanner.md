# DT-05 · QrIntakeScanner.tsx

Desktop component slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py desktop/src/components/codeslice .`

## DT-05 · desktop/src/components/QrIntakeScanner.tsx
**LOC:** 1387 · **Anchor commit:** ee8bbe5 · **Role:** QR intake desk: webcam/file QR verification, ID search, triage vitals, appointment check-in, walk-in tickets
**Mounted by:** NurseConsole.tsx L1106 (intake view; prop onPatientVerified(patient, token) hands verified patients to NurseConsole)
**API surface:** GET /api/appointments/patient/:userId/active-ticket (L106); POST /api/health-pass/verify (L137); GET /api/appointments/lookup?query= (L175); GET /api/appointments/lookup?userId= (L242); POST /api/appointments/:id/checkin (L262); POST /api/appointments/walk-in (L304)
**Socket events:** none
**State / key fields:** intake: scanMode camera|search, searchQuery, scanStatus, verifiedPatient, pendingAppointment, checkInSuccess · queue: activeTicket, loadingActiveTicket (duplicate prevention), walkInSuccess, isRegisteringWalkIn · vitals: bp, temp, pulse, spo2, respRate, sex, height, weight, lastVerifiedAt; derived bmi/bmiCategory · camera: isCameraActive, cameraError; refs videoRef/canvasRef/animationFrameId (jsQR decode loop) · offline fallback via window.electronAPI.offlineSearchPatients (SQLite) · inline palette object C resolved from live theme tokens

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-21 | interface ActiveTicket | imports (jsQR, API_BASE_URL, live theme tokens, Icon); QrIntakeScannerProps + ActiveTicket interfaces |
| 2 | 22-72 | const [scanMode, setScanMode] | useState: scanMode, searchQuery, verifiedPatient, pendingAppointment, activeTicket, vitals, camera; bmi derived |
| 3 | 75-102 | Resolve the current palette | inline palette object C resolves active theme tokens for intake styles |
| 4 | 103-122 | checkActiveTicket = async | checkActiveTicket: GET /api/appointments/patient/:userId/active-ticket → activeTicket |
| 5 | 123-164 | verifyToken = async | verifyToken: POST /api/health-pass/verify; ok → sets verifiedPatient+vitals, fetches ticket+appointment |
| 6 | 165-237 | handleManualSearch = async | handleManualSearch: GET /api/appointments/lookup?query=; offline fallback electronAPI.offlineSearchPatients |
| 7 | 239-256 | checkPatientAppointments = async | checkPatientAppointments: GET /api/appointments/lookup?userId= → pendingAppointment + vitals defaults |
| 8 | 258-294 | handleConfirmArrival = async | handleConfirmArrival: POST /api/appointments/:id/checkin w/ vitals; 409 → already-in-queue error |
| 9 | 296-336 | handleRegisterWalkIn = async | handleRegisterWalkIn: POST /api/appointments/walk-in w/ vitals notes; 409 race handling |
| 10 | 338-369 | startCamera = async | startCamera/stopCamera: getUserMedia webcam stream, play video, stop tracks + cancel rAF |
| 11 | 371-391 | tickScan = () | tickScan: rAF loop draws video to canvas, jsQR decode, code >20 chars → verifyToken |
| 12 | 393-410 | handleQrFileUpload | unmount cleanup useEffect; handleQrFileUpload decodes QR from uploaded image via jsQR |
| 13 | 412-431 | formatLastVerified | formatLastVerified relative-time helper; status flags statusIsOk/Err/Warn from scanStatus |
| 14 | 433-534 | Patient intake & check-in | render shell: card header w/ camera icon, subtitle; Scan/Search ID mode pill switcher (scanMode) |
| 15 | 536-626 | Camera is off | camera viewport: video+canvas refs, 16:9 frame, camera-off placeholder, cameraError banner |
| 16 | 628-668 | Enter student ID | search mode form: student ID/last-name input + Search button → handleManualSearch |
| 17 | 670-788 | Scan QR from file | camera actions row: Turn on/Stop camera buttons; Scan QR from file label + hidden input |
| 18 | 790-826 | Status line | scanStatus banner colored by statusIsOk/Err/Warn (success/danger/warning sage tints) |
| 19 | 828-940 | Verified patient card | patient card: name, student_no/course, Last verified badge; grid blood type/allergies/h/w/sex/BMI |
| 20 | 942-976 | @keyframes spin | active-ticket pre-check: loading spinner while checking queue status |
| 21 | 977-1081 | Queue ticket | STATE already-in-queue: warning card w/ activeTicket.ticket_no, arrival_time, visit_type, doctor_name |
| 22 | 1082-1125 | Scheduled booking detected | STATE scheduled booking: status pill, Time (formatted_schedule), Purpose + Dr name |
| 23 | 1127-1220 | Blood pressure | triage vitals form (booking branch): sex select + 7 inputs bp/temp/pulse/spo2/resp/h/w; BMI line |
| 24 | 1222-1257 | Confirm arrival & check-in patient | checked-in success banner OR full-width Confirm arrival & check-in button (handleConfirmArrival) |
| 25 | 1258-1296 | No scheduled appointment today | STATE walk-in: header, Walk-in pill, guidance copy for registering into today's live queue |
| 26 | 1298-1436 | Register as walk-in patient | walkInSuccess banner OR triage vitals form + Register as walk-in button (handleRegisterWalkIn) |
