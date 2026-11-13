# MB-02 · consultation_scheduler_screen.dart

Mobile screens slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py mobile/lib/screens/codeslice .`

## MB-02 · mobile/lib/screens/consultation_scheduler_screen.dart
**LOC:** 1689 · **Anchor base:** 2727901 + current changes · **Role:** Appointment booking and cancellation screen (Book a consultation + My appointments tabs) with live slot sync.
**Mounted by:** PatientPortalScreen, patient_portal_screen.dart L810 (portal tab 2 of 5)
**API surface:** GET /api/appointments/doctors (L433); GET /api/appointments/slots?doctorId&date (L469); GET /api/appointments/my (L488); POST /api/appointments (L520); PATCH /api/appointments/{id}/cancel (L681)
**Socket events:** on appointment:booked (L162), on appointment:cancelled (L167) — both refetch slots; no emits
**State / key fields:** tabs/selection: _activeSubTab (0 booking, 1 history), _selectedDoctorId, _selectedDate, _selectedSlotTime, _selectedPurpose
data: _doctors, _slots, _myAppointments (+ _loadingDoctors/_loadingSlots/_loadingHistory), _currentPurposes and _slotsRequest
carousel: _upcomingWeekdays (60 weekdays), _monthNotifier (ValueNotifier), _dateItemExtent, _dateScrollController
booking: _notesController, _isSubmitting
io: _socket (socket_io_client, JWT auth), _storage (FlutterSecureStorage jwt_token)
palette: primaryGreen, softSage, textMain, textSub, borderColor, disabledSlotBg/Text

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-9 | — | imports: dart:convert, Material, secure storage, socket_io_client, ApiConfig, Rs, EmergencyAlertService |
| 2 | 10-29 | _ConsultationSchedulerScreenState | widget class + State header; fields _storage, _activeSubTab, _socket, _doctors, _selectedDoctorId |
| 3 | 30-63 | _getNextValidWeekday | month consts, _getNextValidWeekday, _selectedDate, _monthNotifier, _upcomingWeekdays, _dateItemExtent |
| 4 | 64-92 | _slotsRequest | Slot selections, active request counter, server-provided purposes and booking form state. |
| 5 | 93-105 | initState | Initialize date navigation, load practitioners and history, and connect the slot socket. |
| 6 | 106-134 | didChangeAppLifecycleState | didChangeDependencies recomputes _dateItemExtent; dispose tears down controllers/socket; resume refetch |
| 7 | 135-158 | _initSlotSocket | socket.io connect (JWT auth, websocket+polling); on appointment:booked / appointment:cancelled refetch slots |
| 8 | 159-174 | _onDateScroll | carousel scroll listener updates _monthNotifier month label from itemExtent offsets (no setState) |
| 9 | 175-194 | _generateWeekdaysList | builds _upcomingWeekdays (60 Mon-Fri dates); snaps weekend _selectedDate to first weekday |
| 10 | 195-232 | _formatSlotDisplay | helpers: _isSameDay, _formatSlotDisplay 24h to AM/PM, _isMorning, _formatSlotRange group time bounds |
| 11 | 233-321 | _buildSlotGroupHeader | slot UI helpers: _buildSlotGroupHeader AM/PM header row, _buildSectionBreak dotted divider |
| 12 | 322-394 | _buildSlotWrap | responsive slot chip Wrap; tap sets _selectedSlotTime; unavailable slots disabled |
| 13 | 396-420 | _fetchDoctors | GET doctors and select the first practitioner. Load availability from the server. |
| 14 | 421-464 | _fetchAvailableSlots | Load slots and appointment types from the API. Discard stale responses and clear old slot selections. |
| 15 | 465-482 | _fetchMyAppointments | GET /api/appointments/my; fills _myAppointments for the history tab |
| 16 | 483-603 | _submitBooking | Submit the selected doctor, date, and purpose. Refresh availability after a booking conflict. |
| 17 | 604-688 | _cancelAppointment | reason confirm dialog then PATCH /api/appointments/{id}/cancel with cancelled_reason; refetches |
| 18 | 689-744 | _pickDate | showDatePicker (weekdays only, 90-day window); syncs date, month label, carousel scroll |
| 19 | 745-768 | _showToast | _formatDateTime pretty-prints datetimes; _showToast SnackBar (green or error red) |
| 20 | 769-790 | build | build: width-capped Column of _buildHeader plus booking or history tab by _activeSubTab |
| 21 | 791-884 | _buildHeader | hero title text and Book a consultation / My appointments segmented tab switcher |
| 22 | 885-1003 | _buildBookingTab | booking tab: numbered sections (team, purpose, date, slots), notes TextField, Confirm appointment button |
| 23 | 1004-1088 | _buildDoctorList | doctor cards: initials avatar, name, specialty; tap selects doctor and refetches slots |
| 24 | 1089-1126 | _buildPurposeChips | purpose chips Wrap over _currentPurposes; tap sets _selectedPurpose |
| 25 | 1127-1180 | _buildDateHeader | Choose a date row; ValueListenableBuilder month label, arrow opens _pickDate |
| 26 | 1181-1296 | _buildDateCarousel | horizontal weekday carousel, month badge at month start; tap selects date, fetches slots |
| 27 | 1297-1356 | _buildSlotGrid | slot grid: loading spinner, empty state, Morning and Afternoon groups via _isMorning split |
| 28 | 1357-1415 | _buildInfoCard | visit-prep card: _CheckItem reminders, infirmary location and weekday hours |
| 29 | 1416-1449 | _buildHistoryTab | history tab: loading spinner and empty state (No appointments booked yet) |
| 30 | 1450-1598 | isConfirmed | appointment cards: status pill, doctor, formatted datetime, location, notes block |
| 31 | 1599-1621 | Cancel appointment | cancel link when status scheduled; calls _cancelAppointment(appointment_id) |
| 32 | 1622-1660 | _buildSectionHeader | numbered section header (badge + title) used by booking tab |
| 33 | 1661-1688 | _CheckItem | _CheckItem StatelessWidget: check icon + text row |
