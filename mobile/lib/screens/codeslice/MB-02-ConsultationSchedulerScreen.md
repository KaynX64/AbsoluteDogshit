# MB-02 · consultation_scheduler_screen.dart

Mobile screens slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py mobile/lib/screens/codeslice .`

## MB-02 · mobile/lib/screens/consultation_scheduler_screen.dart
**LOC:** 2094 · **Anchor base:** 2727901 + current changes · **Role:** Appointment booking and cancellation screen (Book a consultation + My appointments tabs) with live slot sync and content-sized list/grid history layouts.
**Mounted by:** PatientPortalScreen, patient_portal_screen.dart L810 (portal tab 2 of 5)
**API surface:** GET /api/appointments/doctors (L433); GET /api/appointments/slots?doctorId&date (L469); GET /api/appointments/my (L488); POST /api/appointments (L520); PATCH /api/appointments/{id}/cancel (L681)
**Socket events:** on appointment:booked (L162), on appointment:cancelled (L167) — both refetch slots; no emits
**State / key fields:** tabs/selection: _activeSubTab (0 booking, 1 history), _selectedDoctorId, _selectedDate, _selectedSlotTime, _selectedPurpose
data: _doctors, _slots, _myAppointments (+ _loadingDoctors/_loadingSlots/_loadingHistory), _isAppointmentGridView, _currentPurposes and _slotsRequest
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
| 5 | 93-115 | initState | Initialize date navigation, load practitioners and history, and connect the slot socket. |
| 6 | 116-144 | didChangeAppLifecycleState | didChangeDependencies recomputes _dateItemExtent; dispose tears down controllers/socket; resume refetch |
| 7 | 145-168 | _initSlotSocket | socket.io connect (JWT auth, websocket+polling); on appointment:booked / appointment:cancelled refetch slots |
| 8 | 169-185 | _onDateScroll | carousel scroll listener updates _monthNotifier month label from itemExtent offsets (no setState) |
| 9 | 186-207 | _generateWeekdaysList | builds _upcomingWeekdays (60 Mon-Fri dates); snaps weekend _selectedDate to first weekday |
| 10 | 208-248 | _formatSlotDisplay | helpers: _isSameDay, _formatSlotDisplay 24h to AM/PM, _isMorning, _formatSlotRange group time bounds |
| 11 | 249-335 | _buildSlotGroupHeader | slot UI helpers: _buildSlotGroupHeader AM/PM header row, _buildSectionBreak dotted divider |
| 12 | 336-410 | _buildSlotWrap | responsive slot chip Wrap; tap sets _selectedSlotTime; unavailable slots disabled |
| 13 | 411-436 | _fetchDoctors | GET doctors and select the first practitioner. Load availability from the server. |
| 14 | 437-490 | _fetchAvailableSlots | Load slots and appointment types from the API; omit the four unavailable noon slots. Discard stale responses and clear old slot selections. |
| 15 | 491-508 | _fetchMyAppointments | GET /api/appointments/my; fills _myAppointments for the history tab |
| 16 | 509-633 | _submitBooking | Submit the selected doctor, date, and purpose. Refresh availability after a booking conflict. |
| 17 | 634-720 | _cancelAppointment | reason confirm dialog then PATCH /api/appointments/{id}/cancel with cancelled_reason; refetches |
| 18 | 721-782 | _pickDate | showDatePicker (weekdays only, 90-day window); syncs date, month label, carousel scroll |
| 19 | 783-806 | _showToast | _formatDateTime pretty-prints datetimes; _showToast SnackBar (green or error red) |
| 20 | 807-831 | build | width-capped Column of _buildHeader plus booking or history tab by _activeSubTab |
| 21 | 832-937 | _buildHeader | hero title and segmented tabs; conditionally shows history layout control |
| 22 | 938-1007 | _buildHistoryLayoutSelector | accessible List/Grid toggle for My appointments |
| 23 | 1008-1127 | _buildBookingTab | booking tab: numbered sections, notes TextField, Confirm appointment button |
| 24 | 1128-1234 | _buildDoctorList | doctor cards: initials avatar, name, specialty; tap selects doctor and refetches slots |
| 25 | 1235-1330 | _buildPurposeChips | distinct purpose icons and responsive booking cards with animated selected state |
| 26 | 1331-1388 | _buildDateHeader | Choose a date row; ValueListenableBuilder month label, arrow opens _pickDate |
| 27 | 1389-1476 | _buildDateCarousel | horizontal weekday carousel with weekday labels on every date; tap selects date, fetches slots |
| 28 | 1477-1540 | _buildSlotGrid | slot grid: loading spinner, empty state, Morning and Afternoon groups via _isMorning split |
| 29 | 1541-1602 | _buildInfoCard | visit-prep card: _CheckItem reminders, infirmary location and weekday hours |
| 30 | 1603-1882 | _buildHistoryTab | appointments loading/empty states, default detailed list, optional content-sized responsive columns |
| 31 | 1883-2027 | _buildAppointmentGridCard | content-sized appointment details, status, date, doctor, location, notes and cancellation |
| 32 | 2028-2066 | _buildSectionHeader | numbered section header (badge + title) used by booking tab |
| 33 | 2067-2094 | _CheckItem | _CheckItem StatelessWidget: check icon + text row |
