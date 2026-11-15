# MB-02 · consultation_scheduler_screen.dart

Mobile screens slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py mobile/lib/screens/codeslice .`

## MB-02 · mobile/lib/screens/consultation_scheduler_screen.dart
**LOC:** 2095 · **Anchor verification:** current dark-mode UI working tree · **Role:** Appointment booking and cancellation screen (Book a consultation + My appointments tabs) with live slot sync and content-sized list/grid history layouts.
**Mounted by:** PatientPortalScreen, patient_portal_screen.dart (portal tab 2 of 5)
**API surface:** GET /api/appointments/doctors; GET /api/appointments/slots?doctorId&date; GET /api/appointments/my; POST /api/appointments; PATCH /api/appointments/{id}/cancel
**Socket events:** on appointment:booked, on appointment:cancelled — both refetch slots; no emits
**State / key fields:** tabs/selection: _activeSubTab (0 booking, 1 history), _selectedDoctorId, _selectedDate, _selectedSlotTime, _selectedPurpose
data: _doctors, _slots, _myAppointments (+ _loadingDoctors/_loadingSlots/_loadingHistory), _isAppointmentGridView, _currentPurposes and _slotsRequest
carousel: _upcomingWeekdays (60 weekdays), _monthNotifier (ValueNotifier), _dateItemExtent, _dateScrollController
booking: _notesController, _isSubmitting
io: _socket (socket_io_client, JWT auth), _storage (FlutterSecureStorage jwt_token)
palette: primaryGreen, softSage, textMain, textSub, borderColor, disabledSlotBg/Text

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-11 | — | imports: dart:convert, Material, secure storage, socket_io_client, ApiConfig, Rs, EmergencyAlertService |
| 2 | 12-33 | _ConsultationSchedulerScreenState | widget class + State header; fields _storage, _activeSubTab, _socket, _doctors, _selectedDoctorId |
| 3 | 34-67 | _getNextValidWeekday | month consts, _getNextValidWeekday, _selectedDate, _monthNotifier, _upcomingWeekdays, _dateItemExtent |
| 4 | 68-96 | _slotsRequest | Slot selections, active request counter, server-provided purposes and booking form state. |
| 5 | 97-119 | initState | Initialize date navigation, load practitioners and history, and connect the slot socket. |
| 6 | 120-148 | didChangeAppLifecycleState | didChangeDependencies recomputes _dateItemExtent; dispose tears down controllers/socket; resume refetch |
| 7 | 149-173 | _initSlotSocket | socket.io connect (JWT auth, websocket+polling); on appointment:booked / appointment:cancelled refetch slots |
| 8 | 174-190 | _onDateScroll | carousel scroll listener updates _monthNotifier month label from itemExtent offsets (no setState) |
| 9 | 191-212 | _generateWeekdaysList | builds _upcomingWeekdays (60 Mon-Fri dates); snaps weekend _selectedDate to first weekday |
| 10 | 213-253 | _formatSlotDisplay | helpers: _isSameDay, _formatSlotDisplay 24h to AM/PM, _isMorning, _formatSlotRange group time bounds |
| 11 | 254-340 | _buildSlotGroupHeader | slot UI helpers: _buildSlotGroupHeader AM/PM header row, _buildSectionBreak dotted divider |
| 12 | 341-415 | _buildSlotWrap | responsive slot chip Wrap; tap sets _selectedSlotTime; unavailable slots disabled |
| 13 | 416-441 | _fetchDoctors | GET doctors and select the first practitioner. Load availability from the server. |
| 14 | 442-497 | _fetchAvailableSlots | Load slots and appointment types from the API; omit the four unavailable noon slots. Discard stale responses and clear old slot selections. |
| 15 | 498-515 | _fetchMyAppointments | GET /api/appointments/my; fills _myAppointments for the history tab |
| 16 | 516-640 | _submitBooking | Submit the selected doctor, date, and purpose. Refresh availability after a booking conflict. |
| 17 | 641-727 | _cancelAppointment | reason confirm dialog then PATCH /api/appointments/{id}/cancel with cancelled_reason; refetches |
| 18 | 728-777 | _pickDate | showDatePicker (weekdays only, 90-day window); syncs date, month label, carousel scroll |
| 19 | 778-801 | _showToast | _formatDateTime pretty-prints datetimes; _showToast SnackBar (green or error red) |
| 20 | 802-826 | build | width-capped Column of _buildHeader plus booking or history tab by _activeSubTab |
| 21 | 827-932 | _buildHeader | hero title and segmented tabs; conditionally shows history layout control |
| 22 | 933-1002 | _buildHistoryLayoutSelector | accessible List/Grid toggle for My appointments |
| 23 | 1003-1126 | _buildBookingTab | booking tab: numbered sections, notes TextField, Confirm appointment button |
| 24 | 1127-1233 | _buildDoctorList | doctor cards: initials avatar, name, specialty; tap selects doctor and refetches slots |
| 25 | 1234-1331 | _buildPurposeChips | distinct purpose icons and responsive booking cards with animated selected state |
| 26 | 1332-1389 | _buildDateHeader | Choose a date row; ValueListenableBuilder month label, arrow opens _pickDate |
| 27 | 1390-1477 | _buildDateCarousel | horizontal weekday carousel with weekday labels on every date; tap selects date, fetches slots |
| 28 | 1478-1541 | _buildSlotGrid | slot grid: loading spinner, empty state, Morning and Afternoon groups via _isMorning split |
| 29 | 1542-1603 | _buildInfoCard | visit-prep card: _CheckItem reminders, infirmary location and weekday hours |
| 30 | 1604-1883 | _buildHistoryTab | appointments loading/empty states, default detailed list, optional content-sized responsive columns |
| 31 | 1884-2028 | _buildAppointmentGridCard | content-sized appointment details, status, date, doctor, location, notes and cancellation |
| 32 | 2029-2067 | _buildSectionHeader | numbered section header (badge + title) used by booking tab |
| 33 | 2068-2095 | _CheckItem | _CheckItem StatelessWidget: check icon + text row |
