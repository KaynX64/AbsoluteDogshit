# MB-02 · consultation_scheduler_screen.dart

Mobile screens slice map · [index](../CODESLICE.md) · check from repo root: `python3 scripts/verify_codeslice.py mobile/lib/screens/codeslice .`

## MB-02 · mobile/lib/screens/consultation_scheduler_screen.dart
**LOC:** 2136 · **Anchor commit:** f8d61a1 · **Role:** Appointment booking and cancellation screen (Book a consultation + My appointments tabs) with live slot sync and content-sized list/grid history layouts.
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
| 1 | 1-11 | — | imports: dart:convert, Material, secure storage, socket_io_client, ApiConfig, Rs, EmergencyAlertService |
| 2 | 12-34 | _ConsultationSchedulerScreenState | widget class + State header; fields _storage, _activeSubTab, _socket, _doctors, _selectedDoctorId |
| 3 | 35-68 | _getNextValidWeekday | month consts, _getNextValidWeekday, _selectedDate, _monthNotifier, _upcomingWeekdays, _dateItemExtent |
| 4 | 69-98 | _slotsRequest | Slot selections, active request counter, server-provided purposes and booking form state. |
| 5 | 99-121 | initState | Initialize date navigation, load practitioners and history, and connect the slot socket. |
| 6 | 122-150 | didChangeAppLifecycleState | didChangeDependencies recomputes _dateItemExtent; dispose tears down controllers/socket; resume refetch |
| 7 | 151-175 | _initSlotSocket | socket.io connect (JWT auth, websocket+polling); on appointment:booked / appointment:cancelled refetch slots |
| 8 | 176-192 | _onDateScroll | carousel scroll listener updates _monthNotifier month label from itemExtent offsets (no setState) |
| 9 | 193-214 | _generateWeekdaysList | builds _upcomingWeekdays (60 Mon-Fri dates); snaps weekend _selectedDate to first weekday |
| 10 | 215-255 | _formatSlotDisplay | helpers: _isSameDay, _formatSlotDisplay 24h to AM/PM, _isMorning, _formatSlotRange group time bounds |
| 11 | 256-342 | _buildSlotGroupHeader | slot UI helpers: _buildSlotGroupHeader AM/PM header row, _buildSectionBreak dotted divider |
| 12 | 343-417 | _buildSlotWrap | responsive slot chip Wrap; tap sets _selectedSlotTime; unavailable slots disabled |
| 13 | 418-443 | _fetchDoctors | GET doctors and select the first practitioner. Load availability from the server. |
| 14 | 444-499 | _fetchAvailableSlots | Load slots and appointment types from the API; omit the four unavailable noon slots. Discard stale responses and clear old slot selections. |
| 15 | 500-517 | _fetchMyAppointments | GET /api/appointments/my; fills _myAppointments for the history tab |
| 16 | 518-684 | _submitBooking | Review care team, purpose, date/time and notes before POST; preserve drafts on dismissal, reject stale reviews, prevent duplicate dialogs/submissions and refresh after a conflict. |
| 17 | 685-771 | _cancelAppointment | reason confirm dialog then PATCH /api/appointments/{id}/cancel with cancelled_reason; refetches |
| 18 | 772-821 | _pickDate | showDatePicker (weekdays only, 90-day window); syncs date, month label, carousel scroll |
| 19 | 822-845 | _showToast | _formatDateTime pretty-prints datetimes; _showToast SnackBar (green or error red) |
| 20 | 846-870 | build | width-capped Column of _buildHeader plus booking or history tab by _activeSubTab |
| 21 | 871-976 | _buildHeader | hero title and segmented tabs; conditionally shows history layout control |
| 22 | 977-1046 | _buildHistoryLayoutSelector | accessible List/Grid toggle for My appointments |
| 23 | 1047-1172 | _buildBookingTab | booking tab: numbered sections, notes TextField, Review appointment button |
| 24 | 1173-1279 | _buildDoctorList | doctor cards: initials avatar, name, specialty; tap selects doctor and refetches slots |
| 25 | 1280-1377 | _buildPurposeChips | distinct purpose icons and responsive booking cards with animated selected state |
| 26 | 1378-1431 | _buildDateHeader | Choose a date row; ValueListenableBuilder month label, arrow opens _pickDate |
| 27 | 1432-1519 | _buildDateCarousel | horizontal weekday carousel with weekday labels on every date; tap selects date, fetches slots |
| 28 | 1520-1583 | _buildSlotGrid | slot grid: loading spinner, empty state, Morning and Afternoon groups via _isMorning split |
| 29 | 1584-1645 | _buildInfoCard | visit-prep card: _CheckItem reminders, infirmary location and weekday hours |
| 30 | 1646-1923 | _buildHistoryTab | appointments loading/empty states, default detailed list, optional content-sized responsive columns |
| 31 | 1924-2068 | _buildAppointmentGridCard | content-sized appointment details, status, date, doctor, location, notes and cancellation |
| 32 | 2069-2104 | _buildSectionHeader | numbered section header (badge + title) used by booking tab |
| 33 | 2105-2136 | _CheckItem | _CheckItem StatelessWidget: check icon + text row |
