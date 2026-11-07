# MB-02 · consultation_scheduler_screen.dart

Mobile screens slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py mobile/lib/screens/codeslice .`

## MB-02 · mobile/lib/screens/consultation_scheduler_screen.dart
**LOC:** 1694 · **Anchor commit:** 7cf9f16 · **Role:** Appointment booking and cancellation screen (Book a consultation + My appointments tabs) with live slot sync.
**Mounted by:** PatientPortalScreen, patient_portal_screen.dart L810 (portal tab 2 of 5)
**API surface:** GET /api/appointments/doctors (L433); GET /api/appointments/slots?doctorId&date (L469); GET /api/appointments/my (L488); POST /api/appointments (L520); PATCH /api/appointments/{id}/cancel (L681)
**Socket events:** on appointment:booked (L162), on appointment:cancelled (L167) — both refetch slots; no emits
**State / key fields:** tabs/selection: _activeSubTab (0 booking, 1 history), _selectedDoctorId, _selectedDate, _selectedSlotTime, _selectedPurpose
data: _doctors, _slots, _myAppointments (+ _loadingDoctors/_loadingSlots/_loadingHistory), _medicalPurposes/_dentalPurposes/_currentPurposes
carousel: _upcomingWeekdays (60 weekdays), _monthNotifier (ValueNotifier), _dateItemExtent, _dateScrollController
booking: _notesController, _isSubmitting
io: _socket (socket_io_client, JWT auth), _storage (FlutterSecureStorage jwt_token)
palette: primaryGreen, softSage, textMain, textSub, borderColor, disabledSlotBg/Text

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-9 | — | imports: dart:convert, Material, secure storage, socket_io_client, ApiConfig, Rs, EmergencyAlertService |
| 2 | 10-29 | _ConsultationSchedulerScreenState | widget class + State header; fields _storage, _activeSubTab, _socket, _doctors, _selectedDoctorId |
| 3 | 30-63 | _getNextValidWeekday | month consts, _getNextValidWeekday, _selectedDate, _monthNotifier, _upcomingWeekdays, _dateItemExtent |
| 4 | 64-105 | _dentalPurposes | state: _slots/_selectedSlotTime, purpose lists, _notesController, _myAppointments, _isSubmitting; color consts |
| 5 | 106-119 | initState | initState: default purposes, month label, weekday list, fetch doctors + history, start slot socket |
| 6 | 120-148 | didChangeAppLifecycleState | didChangeDependencies recomputes _dateItemExtent; dispose tears down controllers/socket; resume refetch |
| 7 | 149-172 | _initSlotSocket | socket.io connect (JWT auth, websocket+polling); on appointment:booked / appointment:cancelled refetch slots |
| 8 | 173-188 | _onDateScroll | carousel scroll listener updates _monthNotifier month label from itemExtent offsets (no setState) |
| 9 | 189-208 | _generateWeekdaysList | builds _upcomingWeekdays (60 Mon-Fri dates); snaps weekend _selectedDate to first weekday |
| 10 | 209-246 | _formatSlotDisplay | helpers: _isSameDay, _formatSlotDisplay 24h to AM/PM, _isMorning, _formatSlotRange group time bounds |
| 11 | 247-335 | _buildSlotGroupHeader | slot UI helpers: _buildSlotGroupHeader AM/PM header row, _buildSectionBreak dotted divider |
| 12 | 336-407 | _buildSlotWrap | responsive slot chip Wrap; tap sets _selectedSlotTime; unavailable slots disabled |
| 13 | 408-426 | _updatePurposesForSelectedDoctor | swaps _currentPurposes between _medicalPurposes and _dentalPurposes for dentist role/specialty |
| 14 | 427-452 | _fetchDoctors | GET /api/appointments/doctors; selects first doctor, updates purposes, fetches slots |
| 15 | 453-481 | _fetchAvailableSlots | GET /api/appointments/slots?doctorId&date; fills _slots, clears _selectedSlotTime |
| 16 | 482-499 | _fetchMyAppointments | GET /api/appointments/my; fills _myAppointments for the history tab |
| 17 | 500-615 | _submitBooking | POST /api/appointments (doctor_user_id, date_time, appointment_type, notes); success dialog + notification |
| 18 | 616-700 | _cancelAppointment | reason confirm dialog then PATCH /api/appointments/{id}/cancel with cancelled_reason; refetches |
| 19 | 701-756 | _pickDate | showDatePicker (weekdays only, 90-day window); syncs date, month label, carousel scroll |
| 20 | 757-780 | _showToast | _formatDateTime pretty-prints datetimes; _showToast SnackBar (green or error red) |
| 21 | 781-802 | build | build: width-capped Column of _buildHeader plus booking or history tab by _activeSubTab |
| 22 | 803-896 | _buildHeader | hero title text and Book a consultation / My appointments segmented tab switcher |
| 23 | 897-1015 | _buildBookingTab | booking tab: numbered sections (team, purpose, date, slots), notes TextField, Confirm appointment button |
| 24 | 1016-1097 | _buildDoctorList | doctor cards: initials avatar, name, specialty; tap selects doctor and refetches slots |
| 25 | 1098-1132 | _buildPurposeChips | purpose chips Wrap over _currentPurposes; tap sets _selectedPurpose |
| 26 | 1133-1186 | _buildDateHeader | Choose a date row; ValueListenableBuilder month label, arrow opens _pickDate |
| 27 | 1187-1302 | _buildDateCarousel | horizontal weekday carousel, month badge at month start; tap selects date, fetches slots |
| 28 | 1303-1362 | _buildSlotGrid | slot grid: loading spinner, empty state, Morning and Afternoon groups via _isMorning split |
| 29 | 1363-1421 | _buildInfoCard | visit-prep card: _CheckItem reminders, infirmary location and weekday hours |
| 30 | 1422-1455 | _buildHistoryTab | history tab: loading spinner and empty state (No appointments booked yet) |
| 31 | 1456-1604 | isConfirmed | appointment cards: status pill, doctor, formatted datetime, location, notes block |
| 32 | 1605-1627 | Cancel appointment | cancel link when status scheduled; calls _cancelAppointment(appointment_id) |
| 33 | 1628-1666 | _buildSectionHeader | numbered section header (badge + title) used by booking tab |
| 34 | 1667-1694 | _CheckItem | _CheckItem StatelessWidget: check icon + text row |
