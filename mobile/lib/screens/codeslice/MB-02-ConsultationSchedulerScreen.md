# MB-02 · consultation_scheduler_screen.dart

Mobile screens slice map · [index](../CODESLICE.md) · check from repo root: `python3 scripts/verify_codeslice.py mobile/lib/screens/codeslice .`

## MB-02 · mobile/lib/screens/consultation_scheduler_screen.dart
**LOC:** 2287 · **Anchor commit:** f8d61a1 · **Role:** Appointment booking and cancellation screen (Book a consultation + My appointments tabs) with live slot sync and content-sized list/grid history layouts.
**Mounted by:** PatientPortalScreen, patient_portal_screen.dart (portal tab 2 of 5)
**API surface:** GET /api/appointments/doctors; GET /api/appointments/slots?doctorId&date; GET /api/appointments/my; POST /api/appointments; PATCH /api/appointments/{id}/cancel
**Socket events:** on appointment:booked, on appointment:cancelled — both refetch slots; no emits
**State / key fields:** tabs/selection: _activeSubTab (0 booking, 1 history), _selectedDoctorId, _selectedDate, _selectedSlotTime, _selectedPurpose
data: _doctors, _slots, _myAppointments (+ _loadingDoctors/_loadingSlots/_loadingHistory), _isAppointmentGridView, _currentPurposes and _slotsRequest
carousel: _upcomingWeekdays (60 weekdays), _monthNotifier (ValueNotifier), _dateItemExtent, _dateScrollController
booking: _notesController, _isSubmitting, _isReviewing; AppointmentBookingReview in widgets/appointment_booking_review.dart
io: _socket (socket_io_client, JWT auth), _storage (FlutterSecureStorage jwt_token)
palette: primaryGreen, softSage, textMain, textSub, borderColor, disabledSlotBg/Text

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-18 | — | imports: dart:convert, Material, secure storage, socket_io_client, ApiConfig, Rs, EmergencyAlertService |
| 2 | 19-48 | _ConsultationSchedulerScreenState | widget class + State header; fields _storage, _activeSubTab, _socket, _doctors, _selectedDoctorId |
| 3 | 49-82 | _getNextValidWeekday | month consts, _getNextValidWeekday, _selectedDate, _monthNotifier, _upcomingWeekdays, _dateItemExtent |
| 4 | 83-115 | _slotsRequest | Slot selections, active request counter, server-provided purposes and booking form state. |
| 5 | 116-153 | initState | Initialize date navigation, reuse practitioners and load history on selection, and connect the slot socket. |
| 6 | 154-214 | didChangeAppLifecycleState | didChangeDependencies recomputes _dateItemExtent; dispose tears down controllers/socket; resume refetch |
| 7 | 215-258 | _initSlotSocket | socket.io connect (JWT auth, websocket+polling); on appointment:booked / appointment:cancelled refetch slots |
| 8 | 259-275 | _onDateScroll | carousel scroll listener updates _monthNotifier month label from itemExtent offsets (no setState) |
| 9 | 276-297 | _generateWeekdaysList | builds _upcomingWeekdays (60 Mon-Fri dates); snaps weekend _selectedDate to first weekday |
| 10 | 298-338 | _formatSlotDisplay | helpers: _isSameDay, _formatSlotDisplay 24h to AM/PM, _isMorning, _formatSlotRange group time bounds |
| 11 | 339-425 | _buildSlotGroupHeader | slot UI helpers: _buildSlotGroupHeader AM/PM header row, _buildSectionBreak dotted divider |
| 12 | 426-500 | _buildSlotWrap | responsive slot chip Wrap; tap sets _selectedSlotTime; unavailable slots disabled |
| 13 | 501-536 | _fetchDoctors | Reuse fresh doctors and preserve the saved practitioner. Load availability from the server. |
| 14 | 537-603 | _fetchAvailableSlots | Load slots and appointment types from the API; omit the four unavailable noon slots. Discard stale responses and clear old slot selections. |
| 15 | 604-640 | _fetchMyAppointments | GET /api/appointments/my; fills _myAppointments for the history tab |
| 16 | 641-832 | _submitBooking | Review care team, purpose, date/time and notes before POST; preserve drafts on dismissal, reject stale reviews, prevent duplicate dialogs/submissions and refresh after a conflict. |
| 17 | 833-921 | _cancelAppointment | reason confirm dialog then PATCH /api/appointments/{id}/cancel with cancelled_reason; refetches |
| 18 | 922-971 | _pickDate | showDatePicker (weekdays only, 90-day window); syncs date, month label, carousel scroll |
| 19 | 972-998 | _showToast | _formatDateTime pretty-prints datetimes; _showToast SnackBar (green or error red) |
| 20 | 999-1023 | build | width-capped Column of _buildHeader plus booking or history tab by _activeSubTab |
| 21 | 1024-1142 | _buildHeader | hero title and segmented tabs; conditionally shows history layout control |
| 22 | 1143-1214 | _buildHistoryLayoutSelector | accessible List/Grid toggle for My appointments |
| 23 | 1215-1341 | _buildBookingTab | booking tab: numbered sections, notes TextField, Review appointment button |
| 24 | 1342-1450 | _buildDoctorList | doctor cards: initials avatar, name, specialty; tap selects doctor and refetches slots |
| 25 | 1451-1552 | _buildPurposeChips | distinct purpose icons and responsive booking cards with animated selected state |
| 26 | 1553-1606 | _buildDateHeader | Choose a date row; ValueListenableBuilder month label, arrow opens _pickDate |
| 27 | 1607-1699 | _buildDateCarousel | horizontal weekday carousel with weekday labels on every date; tap selects date, fetches slots |
| 28 | 1700-1763 | _buildSlotGrid | slot grid: loading spinner, empty state, Morning and Afternoon groups via _isMorning split |
| 29 | 1764-1825 | _buildInfoCard | visit-prep card: _CheckItem reminders, infirmary location and weekday hours |
| 30 | 1826-2074 | _buildHistoryTab | appointments loading/empty states, default detailed list, optional content-sized responsive columns |
| 31 | 2075-2219 | _buildAppointmentGridCard | content-sized appointment details, status, date, doctor, location, notes and cancellation |
| 32 | 2220-2255 | _buildSectionHeader | numbered section header (badge + title) used by booking tab |
| 33 | 2256-2287 | _CheckItem | _CheckItem StatelessWidget: check icon + text row |
