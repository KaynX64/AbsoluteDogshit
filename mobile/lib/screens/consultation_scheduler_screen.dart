// mobile/lib/screens/consultation_scheduler_screen.dart
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config/api_config.dart';
import '../services/emergency_alert_service.dart';

class ConsultationSchedulerScreen extends StatefulWidget {
  const ConsultationSchedulerScreen({super.key});

  @override
  State<ConsultationSchedulerScreen> createState() => _ConsultationSchedulerScreenState();
}

class _ConsultationSchedulerScreenState extends State<ConsultationSchedulerScreen> {
  final _storage = const FlutterSecureStorage();

  // 0 = Book Consultation, 1 = My Appointments
  int _activeSubTab = 0;

  // Booking state
  List<dynamic> _doctors = [];
  bool _loadingDoctors = false;
  int? _selectedDoctorId;

  static const List<String> _months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  static const List<String> _monthsAbbr = [
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'
  ];

  // Helper to ensure dates always land on an open clinic weekday (Monday–Friday)
  static DateTime _getNextValidWeekday([DateTime? fromDate]) {
    DateTime start = fromDate ?? DateTime.now();
    DateTime date = DateTime(start.year, start.month, start.day);
    if (fromDate == null) {
      date = date.add(const Duration(days: 1));
    }
    while (date.weekday == DateTime.saturday || date.weekday == DateTime.sunday) {
      date = date.add(const Duration(days: 1));
    }
    return date;
  }

  late DateTime _selectedDate = _getNextValidWeekday();
  late String _displayedMonthYear;
  List<DateTime> _upcomingWeekdays = [];

  List<dynamic> _slots = [];
  bool _loadingSlots = false;
  String? _selectedSlotTime;

  final List<String> _medicalPurposes = [
    'General consultation',
    'Physical examination',
    'Prescription refill',
    'Medical clearance',
  ];

  final List<String> _dentalPurposes = [
    'Dental Check-up',
    'Tooth Extraction',
    'Oral Prophylaxis',
    'Dental Filling',
    'Toothache Emergency',
  ];

  List<String> _currentPurposes = [];
  String _selectedPurpose = 'General consultation';

  final _notesController = TextEditingController();
  bool _isSubmitting = false;

  // History state
  List<dynamic> _myAppointments = [];
  bool _loadingHistory = false;

  static const primaryGreen = Color(0xFF284E3A);
  static const softSage = Color(0xFFE5EDE4);
  static const textMain = Color(0xFF191C1A);
  static const textSub = Color(0xFF5A635B);
  static const borderColor = Color(0xFFD6DFD5);
  static const disabledSlotBg = Color(0xFFEDF2EC);
  static const disabledSlotText = Color(0xFFA3B0A4);

  final ScrollController _dateScrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _currentPurposes = _medicalPurposes;
    _displayedMonthYear = "${_months[_selectedDate.month - 1]} ${_selectedDate.year}";
    _generateWeekdaysList();
    _dateScrollController.addListener(_onDateScroll);
    _fetchDoctors();
    _fetchMyAppointments();
  }

  @override
  void dispose() {
    _notesController.dispose();
    _dateScrollController.removeListener(_onDateScroll);
    _dateScrollController.dispose();
    super.dispose();
  }

  // Dynamically transitions the header (e.g. October 2026 -> November 2026) as the user scrolls
  void _onDateScroll() {
    if (!_dateScrollController.hasClients || _upcomingWeekdays.isEmpty) return;
    const itemExtent = 72.0; // 62 card width + 10 margin
    final index = ((_dateScrollController.offset + 36) / itemExtent)
        .floor()
        .clamp(0, _upcomingWeekdays.length - 1);

    final visibleDate = _upcomingWeekdays[index];
    final monthName = _months[visibleDate.month - 1];
    final newMonthYear = "$monthName ${visibleDate.year}";

    if (_displayedMonthYear != newMonthYear) {
      setState(() {
        _displayedMonthYear = newMonthYear;
      });
    }
  }

  void _generateWeekdaysList() {
    final List<DateTime> list = [];
    DateTime curr = DateTime.now();
    curr = DateTime(curr.year, curr.month, curr.day);

    // Generate upcoming 60 weekdays (approx. 12 weeks of clinical dates)
    while (list.length < 60) {
      if (curr.weekday != DateTime.saturday && curr.weekday != DateTime.sunday) {
        list.add(curr);
      }
      curr = curr.add(const Duration(days: 1));
    }

    setState(() {
      _upcomingWeekdays = list;
      if (_selectedDate.weekday == DateTime.saturday || _selectedDate.weekday == DateTime.sunday) {
        _selectedDate = list.first;
      }
      _displayedMonthYear = "${_months[_selectedDate.month - 1]} ${_selectedDate.year}";
    });
  }

  bool _isSameDay(DateTime a, DateTime b) {
    return a.year == b.year && a.month == b.month && a.day == b.day;
  }

  String _formatSlotDisplay(String time24) {
    try {
      final parts = time24.split(':');
      int hour = int.parse(parts[0]);
      final minute = parts[1];
      final period = hour >= 12 ? 'PM' : 'AM';
      if (hour > 12) hour -= 12;
      if (hour == 0) hour = 12;
      return '$hour:$minute $period';
    } catch (_) {
      return time24;
    }
  }

  void _updatePurposesForSelectedDoctor(int doctorId) {
    final doc = _doctors.firstWhere((d) => d['user_id'] == doctorId, orElse: () => null);
    if (doc != null) {
      final isDentist = doc['role_code'] == 'DENTIST' ||
          (doc['specialty'] != null && doc['specialty'].toString().toLowerCase().contains('dent'));

      setState(() {
        if (isDentist) {
          _currentPurposes = _dentalPurposes;
          _selectedPurpose = _dentalPurposes[0];
        } else {
          _currentPurposes = _medicalPurposes;
          _selectedPurpose = _medicalPurposes[0];
        }
      });
    }
  }

  Future<void> _fetchDoctors() async {
    setState(() => _loadingDoctors = true);
    final token = await _storage.read(key: 'jwt_token');
    try {
      final res = await ApiConfig.client.get(
        Uri.parse('${ApiConfig.baseUrl}/api/appointments/doctors'),
        headers: {'Authorization': 'Bearer $token'},
      );
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        setState(() {
          _doctors = data;
          if (_doctors.isNotEmpty) {
            _selectedDoctorId = _doctors[0]['user_id'];
            _updatePurposesForSelectedDoctor(_selectedDoctorId!);
            _fetchAvailableSlots();
          }
        });
      }
    } catch (e) {
      _showToast('Failed to load doctors: $e', isError: true);
    } finally {
      if (mounted) setState(() => _loadingDoctors = false);
    }
  }

  Future<void> _fetchAvailableSlots() async {
    if (_selectedDoctorId == null) return;

    setState(() {
      _loadingSlots = true;
      _selectedSlotTime = null;
    });

    final token = await _storage.read(key: 'jwt_token');
    final formattedDate =
        "${_selectedDate.year}-${_selectedDate.month.toString().padLeft(2, '0')}-${_selectedDate.day.toString().padLeft(2, '0')}";

    try {
      final res = await ApiConfig.client.get(
        Uri.parse('${ApiConfig.baseUrl}/api/appointments/slots?doctorId=$_selectedDoctorId&date=$formattedDate'),
        headers: {'Authorization': 'Bearer $token'},
      );
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        setState(() => _slots = data['slots'] ?? []);
      }
    } catch (e) {
      _showToast('Failed to load slots: $e', isError: true);
    } finally {
      if (mounted) setState(() => _loadingSlots = false);
    }
  }

  Future<void> _fetchMyAppointments() async {
    setState(() => _loadingHistory = true);
    final token = await _storage.read(key: 'jwt_token');
    try {
      final res = await ApiConfig.client.get(
        Uri.parse('${ApiConfig.baseUrl}/api/appointments/my'),
        headers: {'Authorization': 'Bearer $token'},
      );
      if (res.statusCode == 200) {
        setState(() => _myAppointments = jsonDecode(res.body));
      }
    } catch (e) {
      _showToast('Failed to load history: $e', isError: true);
    } finally {
      if (mounted) setState(() => _loadingHistory = false);
    }
  }

  Future<void> _submitBooking() async {
    if (_selectedDoctorId == null) {
      _showToast('Please select a doctor or dentist.', isError: true);
      return;
    }
    if (_selectedSlotTime == null) {
      _showToast('Please select an available time slot.', isError: true);
      return;
    }

    setState(() => _isSubmitting = true);
    final token = await _storage.read(key: 'jwt_token');

    final formattedDate =
        "${_selectedDate.year}-${_selectedDate.month.toString().padLeft(2, '0')}-${_selectedDate.day.toString().padLeft(2, '0')}";
    final scheduledDateTime = "$formattedDate $_selectedSlotTime:00";

    try {
      final res = await ApiConfig.client.post(
        Uri.parse('${ApiConfig.baseUrl}/api/appointments'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
        body: jsonEncode({
          'doctor_user_id': _selectedDoctorId,
          'date_time': scheduledDateTime,
          'appointment_type': _selectedPurpose,
          'notes': _notesController.text.trim(),
        }),
      );

      final data = jsonDecode(res.body);
      if (res.statusCode == 201) {
        _notesController.clear();
        _fetchAvailableSlots();
        _fetchMyAppointments();

        EmergencyAlertService().showAppointmentConfirmedNotification(
          '📅 Consultation Confirmed',
          'Your appointment for $_selectedPurpose on $scheduledDateTime is set.',
        );

        if (mounted) {
          showDialog(
            context: context,
            builder: (ctx) => AlertDialog(
              backgroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
              icon: const Icon(Icons.check_circle_outline, color: primaryGreen, size: 48),
              title: const Text('Consultation Scheduled', style: TextStyle(fontWeight: FontWeight.w800, color: primaryGreen)),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Scheduled for: $scheduledDateTime', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13.5)),
                  const SizedBox(height: 6),
                  Text('Purpose: $_selectedPurpose', style: const TextStyle(fontSize: 13, color: textSub)),
                  const SizedBox(height: 12),
                  const Text(
                    'Reminders:\n• Arrive 10 minutes prior to your time block.\n• Present your QR Health Pass at reception for touchless check-in.',
                    style: TextStyle(fontSize: 12, color: textSub, height: 1.4),
                  ),
                ],
              ),
              actions: [
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: primaryGreen,
                    foregroundColor: Colors.white,
                    shape: const StadiumBorder(),
                  ),
                  onPressed: () {
                    Navigator.pop(ctx);
                    setState(() => _activeSubTab = 1);
                  },
                  child: const Text('View in My appointments'),
                ),
              ],
            ),
          );
        }
      } else {
        _showToast(data['error'] ?? 'Booking failed', isError: true);
      }
    } catch (e) {
      _showToast('Network error: $e', isError: true);
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  Future<void> _cancelAppointment(int appointmentId) async {
    final reasonController = TextEditingController();
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('Cancel Consultation', style: TextStyle(fontWeight: FontWeight.w800, color: Color(0xFF7A2E26))),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Are you sure you want to cancel this scheduled appointment?', style: TextStyle(fontSize: 13, color: textSub)),
            const SizedBox(height: 12),
            TextField(
              controller: reasonController,
              decoration: InputDecoration(
                hintText: 'Reason for cancellation',
                filled: true,
                fillColor: const Color(0xFFF7F9F6),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: borderColor)),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Keep', style: TextStyle(color: textSub))),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF7A2E26), foregroundColor: Colors.white, shape: const StadiumBorder()),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Confirm Cancel'),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    final token = await _storage.read(key: 'jwt_token');
    try {
      final res = await ApiConfig.client.patch(
        Uri.parse('${ApiConfig.baseUrl}/api/appointments/$appointmentId/cancel'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
        body: jsonEncode({'cancelled_reason': reasonController.text.trim()}),
      );

      if (res.statusCode == 200) {
        _showToast('Appointment cancelled.');
        _fetchMyAppointments();
        _fetchAvailableSlots();
      } else {
        final err = jsonDecode(res.body)['error'] ?? 'Cancellation failed';
        _showToast(err, isError: true);
      }
    } catch (e) {
      _showToast('Error: $e', isError: true);
    }
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final firstDate = DateTime(now.year, now.month, now.day);
    final lastDate = firstDate.add(const Duration(days: 90));

    DateTime initial = DateTime(_selectedDate.year, _selectedDate.month, _selectedDate.day);
    if (initial.isBefore(firstDate) ||
        initial.isAfter(lastDate) ||
        initial.weekday == DateTime.saturday ||
        initial.weekday == DateTime.sunday) {
      initial = _getNextValidWeekday(firstDate);
    }

    try {
      final picked = await showDatePicker(
        context: context,
        initialDate: initial,
        firstDate: firstDate,
        lastDate: lastDate,
        selectableDayPredicate: (day) =>
            day.weekday != DateTime.saturday && day.weekday != DateTime.sunday,
        builder: (context, child) {
          return Theme(
            data: Theme.of(context).copyWith(
              colorScheme: const ColorScheme.light(
                primary: primaryGreen,
                onPrimary: Colors.white,
                onSurface: textMain,
              ),
            ),
            child: child!,
          );
        },
      );

      if (picked != null && !_isSameDay(picked, _selectedDate)) {
        setState(() {
          _selectedDate = picked;
          _displayedMonthYear = "${_months[picked.month - 1]} ${picked.year}";
        });
        _fetchAvailableSlots();

        // Auto scroll horizontal carousel to matched date
        final targetIndex = _upcomingWeekdays.indexWhere((d) => _isSameDay(d, picked));
        if (targetIndex != -1 && _dateScrollController.hasClients) {
          _dateScrollController.animateTo(
            targetIndex * 72.0,
            duration: const Duration(milliseconds: 320),
            curve: Curves.easeOutCubic,
          );
        }
      }
    } catch (e) {
      debugPrint('[DatePicker Error]: $e');
    }
  }

  String _formatDateTime(String? raw) {
    if (raw == null || raw.isEmpty) return 'N/A';
    try {
      final dt = DateTime.parse(raw.replaceAll('/', '-'));
      final month = _months[dt.month - 1];
      final hour = dt.hour > 12 ? dt.hour - 12 : (dt.hour == 0 ? 12 : dt.hour);
      final minute = dt.minute.toString().padLeft(2, '0');
      final period = dt.hour >= 12 ? 'PM' : 'AM';
      return '$month ${dt.day}, ${dt.year} | $hour:$minute $period';
    } catch (_) {
      return raw;
    }
  }

  void _showToast(String message, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? const Color(0xFF7A2E26) : primaryGreen,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Title Header
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 8.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'A MOMENT FOR YOUR HEALTH',
                style: TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.8,
                  color: textSub,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                "Let's plan your care.",
                style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: textMain, letterSpacing: -0.5),
              ),
              const SizedBox(height: 2),
              const Text(
                "Find a time that works for you. We'll take care of the rest.",
                style: TextStyle(fontSize: 13.5, color: textSub),
              ),
              const SizedBox(height: 14),

              // Pill Switcher Bar
              Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: softSage,
                  borderRadius: BorderRadius.circular(24),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: GestureDetector(
                        onTap: () => setState(() => _activeSubTab = 0),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 9),
                          decoration: BoxDecoration(
                            color: _activeSubTab == 0 ? primaryGreen : Colors.transparent,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          alignment: Alignment.center,
                          child: Text(
                            'Book a consultation',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: _activeSubTab == 0 ? Colors.white : primaryGreen,
                            ),
                          ),
                        ),
                      ),
                    ),
                    Expanded(
                      child: GestureDetector(
                        onTap: () => setState(() => _activeSubTab = 1),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 9),
                          decoration: BoxDecoration(
                            color: _activeSubTab == 1 ? primaryGreen : Colors.transparent,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          alignment: Alignment.center,
                          child: Text(
                            'My appointments',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: _activeSubTab == 1 ? Colors.white : primaryGreen,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 4),

        Expanded(
          child: _activeSubTab == 0 ? _buildBookingTab() : _buildHistoryTab(),
        ),
      ],
    );
  }

  // --- SUB-VIEW 0: BOOKING FORM (FIGMA DESIGN ALIGNED WITH DYNAMIC MONTH) ---
  Widget _buildBookingTab() {
    if (_loadingDoctors) {
      return const Center(child: CircularProgressIndicator(color: primaryGreen));
    }

    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
      children: [
        // 1. Your Care Team
        _buildSectionHeader('1', 'Your care team'),
        const SizedBox(height: 8),
        ..._doctors.map((doc) {
          final isSelected = _selectedDoctorId == doc['user_id'];
          final initials = "${doc['first_name'][0]}${doc['last_name'][0]}";

          return GestureDetector(
            onTap: () {
              setState(() => _selectedDoctorId = doc['user_id']);
              _updatePurposesForSelectedDoctor(doc['user_id']);
              _fetchAvailableSlots();
            },
            child: Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: isSelected ? const Color(0xFFE2EBE1) : Colors.white,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: isSelected ? primaryGreen : borderColor, width: isSelected ? 1.5 : 1),
              ),
              child: Row(
                children: [
                  Container(
                    width: 38,
                    height: 38,
                    decoration: BoxDecoration(
                      color: isSelected ? primaryGreen.withValues(alpha: 0.15) : softSage,
                      shape: BoxShape.circle,
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      initials,
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: primaryGreen),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          "Dr. ${doc['first_name']} ${doc['last_name']}",
                          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: textMain),
                        ),
                        Text(
                          doc['specialty'] ?? 'General & family medicine',
                          style: const TextStyle(fontSize: 12, color: textSub),
                        ),
                      ],
                    ),
                  ),
                  if (isSelected) const Icon(Icons.check, size: 18, color: primaryGreen),
                ],
              ),
            ),
          );
        }),
        const SizedBox(height: 18),

        // 2. What brings you in?
        _buildSectionHeader('2', 'What brings you in?'),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: _currentPurposes.map((purpose) {
            final isSelected = _selectedPurpose == purpose;
            return GestureDetector(
              onTap: () => setState(() => _selectedPurpose = purpose),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                decoration: BoxDecoration(
                  color: isSelected ? primaryGreen : Colors.white,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: isSelected ? primaryGreen : borderColor),
                ),
                child: Text(
                  purpose,
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: isSelected ? Colors.white : textMain,
                  ),
                ),
              ),
            );
          }).toList(),
        ),
        const SizedBox(height: 22),

        // =====================================================================
        // 3. A DAY THAT WORKS FOR YOU (AUTO-TRANSITIONING MONTH HEADER)
        // =====================================================================
        _buildSectionHeader('3', 'A day that works for you'),
        const SizedBox(height: 12),

        // "Choose a date" & Dynamically Updated Month/Year Header
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            const Text(
              'Choose a date',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                color: textMain,
                letterSpacing: -0.3,
              ),
            ),
            InkWell(
              onTap: _pickDate,
              borderRadius: BorderRadius.circular(8),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                child: Row(
                  children: [
                    AnimatedSwitcher(
                      duration: const Duration(milliseconds: 200),
                      child: Text(
                        _displayedMonthYear,
                        key: ValueKey<String>(_displayedMonthYear),
                        style: const TextStyle(
                          fontSize: 15.5,
                          fontWeight: FontWeight.w700,
                          color: primaryGreen,
                        ),
                      ),
                    ),
                    const SizedBox(width: 4),
                    const Icon(Icons.arrow_drop_down, color: primaryGreen, size: 20),
                  ],
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),

        // Horizontal Weekday Card Carousel
        SizedBox(
          height: 92,
          child: ListView.builder(
            controller: _dateScrollController,
            scrollDirection: Axis.horizontal,
            physics: const BouncingScrollPhysics(),
            itemCount: _upcomingWeekdays.length,
            itemBuilder: (context, index) {
              final date = _upcomingWeekdays[index];
              final isSelected = _isSameDay(date, _selectedDate);

              const weekdayAbbr = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
              final dayName = weekdayAbbr[date.weekday - 1];

              // Identifies month transitions (e.g. crossing from October 30 to November 2)
              final isMonthStart = index == 0 || date.month != _upcomingWeekdays[index - 1].month;
              final monthBadge = _monthsAbbr[date.month - 1];

              return GestureDetector(
                onTap: () {
                  setState(() {
                    _selectedDate = date;
                    _displayedMonthYear = "${_months[date.month - 1]} ${date.year}";
                  });
                  _fetchAvailableSlots();
                },
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  width: 62,
                  margin: EdgeInsets.only(right: index == _upcomingWeekdays.length - 1 ? 0 : 10),
                  decoration: BoxDecoration(
                    color: isSelected ? primaryGreen : Colors.white,
                    borderRadius: BorderRadius.circular(22),
                    border: Border.all(
                      color: isSelected ? primaryGreen : borderColor,
                      width: 1.2,
                    ),
                    boxShadow: isSelected
                        ? [
                            BoxShadow(
                              color: primaryGreen.withValues(alpha: 0.22),
                              blurRadius: 8,
                              offset: const Offset(0, 4),
                            ),
                          ]
                        : null,
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      // If it's the start of a new month, display a helpful mini tag (e.g. NOV)
                      if (isMonthStart)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                          margin: const EdgeInsets.only(bottom: 2),
                          decoration: BoxDecoration(
                            color: isSelected ? Colors.white.withValues(alpha: 0.25) : softSage,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            monthBadge,
                            style: TextStyle(
                              fontSize: 9,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 0.6,
                              color: isSelected ? Colors.white : primaryGreen,
                            ),
                          ),
                        )
                      else
                        Text(
                          dayName,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.5,
                            color: isSelected ? Colors.white.withValues(alpha: 0.85) : const Color(0xFF6B7A6E),
                          ),
                        ),
                      const SizedBox(height: 4),
                      Text(
                        '${date.day}',
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                          color: isSelected ? Colors.white : textMain,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 8),

        const Text(
          'Consultations are available Monday–Friday.',
          style: TextStyle(fontSize: 12.5, color: textSub),
        ),
        const SizedBox(height: 24),

        // =====================================================================
        // 4. CHOOSE YOUR TIME (FIGMA 12-HOUR PILL GRID)
        // =====================================================================
        _buildSectionHeader('4', 'Choose your time'),
        const SizedBox(height: 12),

        if (_loadingSlots)
          const Center(
            child: Padding(
              padding: EdgeInsets.all(20),
              child: CircularProgressIndicator(color: primaryGreen, strokeWidth: 2),
            ),
          )
        else if (_slots.isEmpty)
          Container(
            padding: const EdgeInsets.all(16),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: borderColor),
            ),
            child: const Text('No slots available on this date.', style: TextStyle(color: textSub, fontSize: 13)),
          )
        else
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: 2.25,
            ),
            itemCount: _slots.length,
            itemBuilder: (context, index) {
              final slot = _slots[index];
              final rawTime = slot['time'];
              final displayTime = _formatSlotDisplay(rawTime);
              final isAvail = slot['isAvailable'] == true;
              final isSelected = _selectedSlotTime == rawTime;

              return GestureDetector(
                onTap: isAvail ? () => setState(() => _selectedSlotTime = rawTime) : null,
                child: Container(
                  decoration: BoxDecoration(
                    color: isSelected
                        ? primaryGreen
                        : isAvail
                            ? Colors.white
                            : disabledSlotBg,
                    borderRadius: BorderRadius.circular(22),
                    border: Border.all(
                      color: isSelected
                          ? primaryGreen
                          : isAvail
                              ? borderColor
                              : Colors.transparent,
                      width: 1.2,
                    ),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    displayTime,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: isSelected || isAvail ? FontWeight.w700 : FontWeight.w600,
                      color: isSelected
                          ? Colors.white
                          : isAvail
                              ? textMain
                              : disabledSlotText,
                    ),
                  ),
                ),
              );
            },
          ),
        const SizedBox(height: 22),

        // 5. Anything we should know?
        const Text(
          'Anything we should know? (optional)',
          style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: textMain),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _notesController,
          maxLines: 3,
          style: const TextStyle(fontSize: 13),
          decoration: InputDecoration(
            hintText: 'Tell your care team a little about your visit…',
            hintStyle: const TextStyle(color: Color(0xFF94A396), fontSize: 13),
            filled: true,
            fillColor: Colors.white,
            contentPadding: const EdgeInsets.all(14),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(18), borderSide: const BorderSide(color: borderColor)),
            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(18), borderSide: const BorderSide(color: borderColor)),
            focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(18), borderSide: const BorderSide(color: primaryGreen)),
          ),
        ),
        const SizedBox(height: 20),

        // Confirm Button
        SizedBox(
          width: double.infinity,
          height: 52,
          child: ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: primaryGreen,
              foregroundColor: Colors.white,
              elevation: 0,
              shape: const StadiumBorder(),
            ),
            onPressed: _isSubmitting ? null : _submitBooking,
            child: _isSubmitting
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                : const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text('Confirm appointment', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                      SizedBox(width: 8),
                      Icon(Icons.arrow_forward_rounded, size: 18),
                    ],
                  ),
          ),
        ),
        const SizedBox(height: 24),

        // "A smoother visit." Info Card
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: const Color(0xFFE2EBE1),
            borderRadius: BorderRadius.circular(22),
          ),
          child: const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.healing_outlined, size: 18, color: primaryGreen),
                  SizedBox(width: 8),
                  Text('A smoother visit.', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Color(0xFF191C1A))),
                ],
              ),
              SizedBox(height: 12),
              _CheckItem('Bring your university ID and health pass.'),
              _CheckItem('Arrive 10 minutes before your appointment.'),
              _CheckItem('Keep a list of any medications you take.'),
              Divider(color: Color(0xFFC7D6C6), height: 24),
              Row(
                children: [
                  Icon(Icons.location_on_outlined, size: 15, color: textSub),
                  SizedBox(width: 6),
                  Text('PSU Lingayen Campus Infirmary', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: textMain)),
                ],
              ),
              Padding(
                padding: EdgeInsets.only(left: 21, top: 2),
                child: Text('Monday–Friday · 8 AM–5 PM', style: TextStyle(fontSize: 11.5, color: textSub)),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
      ],
    );
  }

  // --- SUB-VIEW 1: MY APPOINTMENTS LIST ---
  Widget _buildHistoryTab() {
    if (_loadingHistory) {
      return const Center(child: CircularProgressIndicator(color: primaryGreen));
    }

    if (_myAppointments.isEmpty) {
      return RefreshIndicator(
        color: primaryGreen,
        onRefresh: _fetchMyAppointments,
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: const [
            SizedBox(height: 60),
            Icon(Icons.calendar_month_outlined, size: 54, color: Color(0xFFA4B0A6)),
            SizedBox(height: 12),
            Center(child: Text('No appointments booked yet.', style: TextStyle(color: textSub, fontSize: 14, fontWeight: FontWeight.w600))),
          ],
        ),
      );
    }

    return RefreshIndicator(
      color: primaryGreen,
      onRefresh: _fetchMyAppointments,
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
        itemCount: _myAppointments.length,
        itemBuilder: (context, index) {
          final item = _myAppointments[index];
          final status = (item['status'] ?? 'scheduled').toString().toLowerCase();

          final isConfirmed = status == 'scheduled' || status == 'checked_in';
          final isCompleted = status == 'completed';

          return Container(
            margin: const EdgeInsets.only(bottom: 14),
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(22),
              border: Border.all(color: borderColor),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(6),
                      decoration: BoxDecoration(color: softSage, borderRadius: BorderRadius.circular(8)),
                      child: const Icon(Icons.calendar_today_outlined, size: 16, color: primaryGreen),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        item['appointment_type'] ?? 'General consultation',
                        style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: textMain),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: isConfirmed
                            ? const Color(0xFFE5EDE4)
                            : isCompleted
                                ? const Color(0xFFE2EBE1)
                                : const Color(0xFFFDE8E8),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        status == 'scheduled' ? 'Confirmed' : status.toUpperCase(),
                        style: TextStyle(
                          fontSize: 10.5,
                          fontWeight: FontWeight.w700,
                          color: isConfirmed
                              ? primaryGreen
                              : isCompleted
                                  ? const Color(0xFF15803D)
                                  : const Color(0xFF9B1C1C),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),

                Text(
                  "Dr. ${item['doctor_first_name']} ${item['doctor_last_name']}",
                  style: const TextStyle(fontSize: 13, color: textSub, fontWeight: FontWeight.w500),
                ),
                const SizedBox(height: 6),

                Row(
                  children: [
                    const Icon(Icons.event_outlined, size: 15, color: textSub),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        _formatDateTime(item['formatted_date_time'] ?? item['date_time']),
                        style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: textMain),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                const Row(
                  children: [
                    Icon(Icons.location_on_outlined, size: 15, color: textSub),
                    SizedBox(width: 6),
                    Text('Medical Clinic · Room 1', style: TextStyle(fontSize: 12, color: textSub)),
                  ],
                ),

                if (item['notes'] != null && item['notes'].toString().isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(color: const Color(0xFFF7F9F6), borderRadius: BorderRadius.circular(12)),
                    child: Text(
                      item['notes'],
                      style: const TextStyle(fontSize: 12, color: textSub),
                    ),
                  ),
                ],

                if (status == 'scheduled') ...[
                  const SizedBox(height: 12),
                  GestureDetector(
                    onTap: () => _cancelAppointment(item['appointment_id']),
                    child: const Text(
                      'Cancel appointment',
                      style: TextStyle(color: Color(0xFF7A2E26), fontSize: 13, fontWeight: FontWeight.w700),
                    ),
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildSectionHeader(String number, String title) {
    return Row(
      children: [
        Container(
          width: 22,
          height: 22,
          decoration: const BoxDecoration(color: softSage, shape: BoxShape.circle),
          alignment: Alignment.center,
          child: Text(number, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: primaryGreen)),
        ),
        const SizedBox(width: 8),
        Text(title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5, color: textMain)),
      ],
    );
  }
}

class _CheckItem extends StatelessWidget {
  final String text;
  const _CheckItem(this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6.0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.check, size: 16, color: Color(0xFF284E3A)),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 12.5, color: Color(0xFF424943)))),
        ],
      ),
    );
  }
}