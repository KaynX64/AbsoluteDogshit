// mobile/lib/screens/consultation_scheduler_screen.dart
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../config/api_config.dart';
import '../utils/responsive.dart';
import '../services/emergency_alert_service.dart';

class ConsultationSchedulerScreen extends StatefulWidget {
  const ConsultationSchedulerScreen({super.key});

  @override
  State<ConsultationSchedulerScreen> createState() => _ConsultationSchedulerScreenState();
}

class _ConsultationSchedulerScreenState extends State<ConsultationSchedulerScreen>
    with WidgetsBindingObserver {
  final _storage = const FlutterSecureStorage();

  int _activeSubTab = 0;

  io.Socket? _socket;

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

  // ValueNotifier isolates month-label rebuilds from the rest of the screen.
  final ValueNotifier<String> _monthNotifier = ValueNotifier<String>('');

  List<DateTime> _upcomingWeekdays = [];

  // Computed once per MediaQuery change — the scroll-offset math
  // (_onDateScroll, _pickDate animateTo) MUST use the same value the
  // ListView.builder uses for itemExtent, otherwise the month label
  // desyncs from the visible date. See didChangeDependencies().
  double _dateItemExtent = 72.0;

  List<dynamic> _slots = [];
  bool _loadingSlots = false;
  String? _selectedSlotTime;

  final List<String> _medicalPurposes = [
    'General consultation',
    'Prescription refill',
    'Medical clearance',
  ];

  final List<String> _dentalPurposes = [
    'Dental Checkup',
    'Tooth Extraction',
    'Oral Prophylaxis',
    'Toothache Emergency',
  ];

  List<String> _currentPurposes = [];
  String _selectedPurpose = 'General consultation';

  final _notesController = TextEditingController();
  bool _isSubmitting = false;

  List<dynamic> _myAppointments = [];
  bool _loadingHistory = false;

  static const primaryGreen = Color(0xFF284E3A);
  static const softSage = Color(0xFFE5EDE4);
  static const textMain = Color(0xFF191C1A);
  static const textSub = Color(0xFF5A635B);
  static const borderColor = Color(0xFFD6DFD5);
  static const disabledSlotBg = Color(0xFFEDF2EC);
  static const disabledSlotText = Color(0xFFA3B0A4);

  static const _selectedDoctorBg = Color(0xFFE2EBE1);
  static const _selectedAvatarBg = Color(0x26284E3A);
  static const _infoCardBg = Color(0xFFE2EBE1);
  static const _dividerSoft = Color(0xFFC7D6C6);
  static const _hintColor = Color(0xFF94A396);
  static const _monthTagColor = Color(0xFF6B7A6E);

  final ScrollController _dateScrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _currentPurposes = _medicalPurposes;
    _monthNotifier.value = "${_months[_selectedDate.month - 1]} ${_selectedDate.year}";
    _generateWeekdaysList();
    _dateScrollController.addListener(_onDateScroll);
    _fetchDoctors();
    _fetchMyAppointments();
    _initSlotSocket();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // MediaQuery is only safe to read here (not in initState). On rotation,
    // split-screen resize, or font-scale change this fires again and the
    // extent is recomputed — the scroll math picks up the new value on the
    // next listener tick.
    final rs = Rs.of(context);
    _dateItemExtent = rs.w(72).clamp(60.0, 88.0);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _notesController.dispose();
    _dateScrollController.removeListener(_onDateScroll);
    _dateScrollController.dispose();
    _monthNotifier.dispose();
    _socket?.disconnect();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _selectedDoctorId != null) {
      _fetchAvailableSlots();
    }
  }

  Future<void> _initSlotSocket() async {
    final token = await _storage.read(key: 'jwt_token');
    try {
      _socket = io.io(
        ApiConfig.socketUrl,
        io.OptionBuilder()
            .setTransports(['websocket', 'polling'])
            .setAuth({'token': token})
            .enableAutoConnect()
            .build(),
      );

      _socket?.on('appointment:booked', (data) {
        if (!mounted || _selectedDoctorId == null) return;
        _fetchAvailableSlots();
      });

      _socket?.on('appointment:cancelled', (_) {
        if (!mounted) return;
        _fetchAvailableSlots();
      });
    } catch (_) {}
  }

  void _onDateScroll() {
    if (!_dateScrollController.hasClients || _upcomingWeekdays.isEmpty) return;
    final extent = _dateItemExtent;
    final index = ((_dateScrollController.offset + extent / 2) / extent)
        .floor()
        .clamp(0, _upcomingWeekdays.length - 1);

    final visibleDate = _upcomingWeekdays[index];
    final newMonthYear = "${_months[visibleDate.month - 1]} ${visibleDate.year}";

    // No setState → no full-screen rebuild. Only the month label updates.
    if (_monthNotifier.value != newMonthYear) {
      _monthNotifier.value = newMonthYear;
    }
  }

  void _generateWeekdaysList() {
    final List<DateTime> list = [];
    DateTime curr = DateTime.now();
    curr = DateTime(curr.year, curr.month, curr.day);

    while (list.length < 60) {
      if (curr.weekday != DateTime.saturday && curr.weekday != DateTime.sunday) {
        list.add(curr);
      }
      curr = curr.add(const Duration(days: 1));
    }

    _upcomingWeekdays = list;
    if (_selectedDate.weekday == DateTime.saturday ||
        _selectedDate.weekday == DateTime.sunday) {
      _selectedDate = list.first;
    }
    _monthNotifier.value = "${_months[_selectedDate.month - 1]} ${_selectedDate.year}";
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

  bool _isMorning(String time24) {
    final hour = int.tryParse(time24.split(':').first) ?? 0;
    return hour < 12;
  }

  String _formatSlotRange(List<dynamic> group) {
    if (group.isEmpty) return '';
    final first = _formatSlotDisplay(group.first['time']);
    final last = _formatSlotDisplay(group.last['time']);

    final firstPeriod = first.split(' ').last;
    final lastPeriod = last.split(' ').last;

    if (firstPeriod == lastPeriod) {
      final firstTime = first.substring(0, first.length - firstPeriod.length - 1);
      return '$firstTime – $last';
    }
    return '$first – $last';
  }

  Widget _buildSlotGroupHeader({
    required Rs rs,
    required IconData icon,
    required String label,
    required String range,
  }) {
    final chipSize = rs.w(26).clamp(22.0, 30.0);
    return Row(
      children: [
        Container(
          width: chipSize,
          height: chipSize,
          decoration: BoxDecoration(
            color: softSage,
            borderRadius: BorderRadius.circular(rs.r(8)),
          ),
          alignment: Alignment.center,
          child: Icon(icon, size: rs.w(14), color: primaryGreen),
        ),
        SizedBox(width: rs.w(10)),
        Flexible(
          child: Text(
            label,
            style: TextStyle(
              fontSize: rs.sp(13.5),
              fontWeight: FontWeight.w800,
              color: textMain,
              letterSpacing: -0.2,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
        SizedBox(width: rs.w(12)),
        Expanded(
          child: Container(height: 1, color: borderColor),
        ),
        SizedBox(width: rs.w(12)),
        // On a compact screen the range pushes the label off — hide it
        // and let the AM/PM block carry the meaning.
        if (!rs.isCompact)
          Flexible(
            child: Text(
              range,
              style: TextStyle(
                fontSize: rs.sp(11.5),
                fontWeight: FontWeight.w600,
                color: textSub,
                letterSpacing: 0.1,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.end,
            ),
          ),
      ],
    );
  }

  Widget _buildSectionBreak() {
    return Row(
      children: [
        Expanded(
          child: Container(
            height: 1,
            color: borderColor.withValues(alpha: 0.55),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Container(
            width: 5,
            height: 5,
            decoration: const BoxDecoration(
              color: _dividerSoft,
              shape: BoxShape.circle,
            ),
          ),
        ),
        Expanded(
          child: Container(
            height: 1,
            color: borderColor.withValues(alpha: 0.55),
          ),
        ),
      ],
    );
  }

  Widget _buildSlotWrap(Rs rs, List<dynamic> group) {
    // 3 columns on phones, 4 on slightly larger phones, 5 on tablets.
    // The gap and slot ratio scale with the Rs factor so the visual
    // rhythm stays consistent.
    final crossAxisCount = rs.pick<int>(compact: 3, phone: 3, tablet: 5);
    final gap = rs.w(10).clamp(8.0, 14.0);

    return LayoutBuilder(
      builder: (context, constraints) {
        final slotWidth =
            (constraints.maxWidth - (crossAxisCount - 1) * gap) / crossAxisCount;
        final slotHeight = slotWidth / 2.25;

        return Wrap(
          spacing: gap,
          runSpacing: gap,
          children: group.map((slot) {
            final rawTime = slot['time'];
            final displayTime = _formatSlotDisplay(rawTime);
            final isAvail = slot['isAvailable'] == true;
            final isSelected = _selectedSlotTime == rawTime;
            final isDisabled = !isAvail;

            return SizedBox(
              width: slotWidth,
              height: slotHeight,
              child: GestureDetector(
                onTap: isDisabled
                    ? null
                    : () => setState(() => _selectedSlotTime = rawTime),
                behavior: HitTestBehavior.opaque,
                child: Container(
                  decoration: BoxDecoration(
                    color: isSelected
                        ? primaryGreen
                        : isDisabled
                            ? disabledSlotBg
                            : Colors.white,
                    borderRadius: BorderRadius.circular(rs.r(22)),
                    border: Border.all(
                      color: isSelected
                          ? primaryGreen
                          : isDisabled
                              ? Colors.transparent
                              : borderColor,
                      width: 1.2,
                    ),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    displayTime,
                    style: TextStyle(
                      fontSize: rs.sp(13),
                      fontWeight: isSelected || !isDisabled
                          ? FontWeight.w700
                          : FontWeight.w600,
                      color: isSelected
                          ? Colors.white
                          : isDisabled
                              ? disabledSlotText
                              : textMain,
                    ),
                  ),
                ),
              ),
            );
          }).toList(),
        );
      },
    );
  }

  void _updatePurposesForSelectedDoctor(int doctorId) {
    final doc = _doctors.firstWhere((d) => d['user_id'] == doctorId, orElse: () => null);
    if (doc != null) {
      final isDentist = doc['role_code'] == 'DENTIST' ||
          (doc['specialty'] != null &&
              doc['specialty'].toString().toLowerCase().contains('dent'));

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
        Uri.parse(
            '${ApiConfig.baseUrl}/api/appointments/slots?doctorId=$_selectedDoctorId&date=$formattedDate'),
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
        await _fetchAvailableSlots();
        await _fetchMyAppointments();

        EmergencyAlertService().showAppointmentConfirmedNotification(
          '📅 Consultation Confirmed',
          'Your appointment for $_selectedPurpose on $scheduledDateTime is set.',
        );

        if (mounted) {
          final rs = Rs.of(context);
          showDialog(
            context: context,
            builder: (ctx) => AlertDialog(
              backgroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(rs.r(20)),
              ),
              icon: const Icon(Icons.check_circle_outline,
                  color: primaryGreen, size: 48),
              title: Text(
                'Consultation Scheduled',
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  color: primaryGreen,
                  fontSize: rs.sp(17),
                ),
              ),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Scheduled for: $scheduledDateTime',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: rs.sp(13.5),
                    ),
                  ),
                  SizedBox(height: rs.h(6)),
                  Text(
                    'Purpose: $_selectedPurpose',
                    style: TextStyle(fontSize: rs.sp(13), color: textSub),
                  ),
                  SizedBox(height: rs.h(12)),
                  Text(
                    'Reminders:\n• Arrive 10 minutes prior to your time block.\n• Present your QR Health Pass at reception for touchless check-in.',
                    style: TextStyle(
                      fontSize: rs.sp(12),
                      color: textSub,
                      height: 1.4,
                    ),
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
    final rs = Rs.of(context);
    final reasonController = TextEditingController();
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(rs.r(20)),
        ),
        title: Text(
          'Cancel Consultation',
          style: TextStyle(
            fontWeight: FontWeight.w800,
            color: const Color(0xFF7A2E26),
            fontSize: rs.sp(16),
          ),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Are you sure you want to cancel this scheduled appointment?',
              style: TextStyle(fontSize: rs.sp(13), color: textSub),
            ),
            SizedBox(height: rs.h(12)),
            TextField(
              controller: reasonController,
              decoration: InputDecoration(
                hintText: 'Reason for cancellation',
                filled: true,
                fillColor: const Color(0xFFF7F9F6),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(rs.r(14)),
                  borderSide: const BorderSide(color: borderColor),
                ),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Keep', style: TextStyle(color: textSub)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF7A2E26),
              foregroundColor: Colors.white,
              shape: const StadiumBorder(),
            ),
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
        });
        _monthNotifier.value = "${_months[picked.month - 1]} ${picked.year}";
        _fetchAvailableSlots();

        final targetIndex = _upcomingWeekdays.indexWhere((d) => _isSameDay(d, picked));
        if (targetIndex != -1 && _dateScrollController.hasClients) {
          _dateScrollController.animateTo(
            targetIndex * _dateItemExtent,
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
    final rs = Rs.of(context);
    return Center(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: rs.isTablet ? 720.0 : double.infinity,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildHeader(rs),
            SizedBox(height: rs.h(4)),
            Expanded(
              child: _activeSubTab == 0 ? _buildBookingTab(rs) : _buildHistoryTab(rs),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(Rs rs) {
    return Padding(
      padding: EdgeInsets.symmetric(
        horizontal: rs.w(20),
        vertical: rs.h(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'A MOMENT FOR YOUR HEALTH',
            style: TextStyle(
              fontSize: rs.sp(10.5),
              fontWeight: FontWeight.w700,
              letterSpacing: 1.8,
              color: textSub,
            ),
          ),
          SizedBox(height: rs.h(4)),
          Text(
            "Let's plan your care.",
            style: TextStyle(
              fontSize: rs.sp(28),
              fontWeight: FontWeight.w800,
              color: textMain,
              letterSpacing: -0.5,
            ),
          ),
          SizedBox(height: rs.h(2)),
          Text(
            "Find a time that works for you. We'll take care of the rest.",
            style: TextStyle(fontSize: rs.sp(13.5), color: textSub),
          ),
          SizedBox(height: rs.h(14)),
          Container(
            padding: EdgeInsets.all(rs.w(4).clamp(3.0, 5.0)),
            decoration: BoxDecoration(
              color: softSage,
              borderRadius: BorderRadius.circular(rs.r(24)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: GestureDetector(
                    onTap: () => setState(() => _activeSubTab = 0),
                    behavior: HitTestBehavior.opaque,
                    child: Container(
                      padding: EdgeInsets.symmetric(vertical: rs.h(9)),
                      decoration: BoxDecoration(
                        color: _activeSubTab == 0 ? primaryGreen : Colors.transparent,
                        borderRadius: BorderRadius.circular(rs.r(20)),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        'Book a consultation',
                        style: TextStyle(
                          fontSize: rs.sp(13),
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
                    behavior: HitTestBehavior.opaque,
                    child: Container(
                      padding: EdgeInsets.symmetric(vertical: rs.h(9)),
                      decoration: BoxDecoration(
                        color: _activeSubTab == 1 ? primaryGreen : Colors.transparent,
                        borderRadius: BorderRadius.circular(rs.r(20)),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        'My appointments',
                        style: TextStyle(
                          fontSize: rs.sp(13),
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
    );
  }

  Widget _buildBookingTab(Rs rs) {
    if (_loadingDoctors) {
      return const Center(child: CircularProgressIndicator(color: primaryGreen));
    }

    return RefreshIndicator(
      color: primaryGreen,
      onRefresh: _fetchAvailableSlots,
      child: ListView(
        padding: EdgeInsets.symmetric(
          horizontal: rs.w(20),
          vertical: rs.h(8),
        ),
        cacheExtent: 300,
        addAutomaticKeepAlives: false,
        addRepaintBoundaries: true,
        addSemanticIndexes: false,
        children: [
          _buildSectionHeader(rs, '1', 'Your care team'),
          SizedBox(height: rs.h(8)),
          RepaintBoundary(child: _buildDoctorList(rs)),
          SizedBox(height: rs.h(18)),
          _buildSectionHeader(rs, '2', 'What brings you in?'),
          SizedBox(height: rs.h(8)),
          RepaintBoundary(child: _buildPurposeChips(rs)),
          SizedBox(height: rs.h(22)),
          _buildSectionHeader(rs, '3', 'A day that works for you'),
          SizedBox(height: rs.h(12)),
          _buildDateHeader(rs),
          SizedBox(height: rs.h(14)),
          RepaintBoundary(child: _buildDateCarousel(rs)),
          SizedBox(height: rs.h(8)),
          Text(
            'Consultations are available Monday–Friday.',
            style: TextStyle(fontSize: rs.sp(12.5), color: textSub),
          ),
          SizedBox(height: rs.h(24)),
          _buildSectionHeader(rs, '4', 'Choose your time'),
          SizedBox(height: rs.h(12)),
          RepaintBoundary(child: _buildSlotGrid(rs)),
          SizedBox(height: rs.h(22)),
          Text(
            'Anything we should know? (optional)',
            style: TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: rs.sp(13),
              color: textMain,
            ),
          ),
          SizedBox(height: rs.h(8)),
          TextField(
            controller: _notesController,
            maxLines: 3,
            style: TextStyle(fontSize: rs.sp(13)),
            decoration: InputDecoration(
              hintText: 'Tell your care team a little about your visit…',
              hintStyle: TextStyle(color: _hintColor, fontSize: rs.sp(13)),
              filled: true,
              fillColor: Colors.white,
              contentPadding: EdgeInsets.all(rs.w(14)),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(rs.r(18)),
                borderSide: const BorderSide(color: borderColor),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(rs.r(18)),
                borderSide: const BorderSide(color: borderColor),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(rs.r(18)),
                borderSide: const BorderSide(color: primaryGreen),
              ),
            ),
          ),
          SizedBox(height: rs.h(20)),
          SizedBox(
            width: double.infinity,
            height: rs.h(52).clamp(46.0, 58.0),
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: primaryGreen,
                foregroundColor: Colors.white,
                elevation: 0,
                shape: const StadiumBorder(),
              ),
              onPressed: _isSubmitting ? null : _submitBooking,
              child: _isSubmitting
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        color: Colors.white,
                        strokeWidth: 2,
                      ),
                    )
                  : Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          'Confirm appointment',
                          style: TextStyle(
                            fontSize: rs.sp(15),
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        SizedBox(width: rs.w(8)),
                        const Icon(Icons.arrow_forward_rounded, size: 18),
                      ],
                    ),
            ),
          ),
          SizedBox(height: rs.h(24)),
          RepaintBoundary(child: _buildInfoCard(rs)),
          SizedBox(height: rs.h(24)),
        ],
      ),
    );
  }

  Widget _buildDoctorList(Rs rs) {
    final avatarSize = rs.w(38).clamp(34.0, 44.0);
    final items = <Widget>[];
    for (final doc in _doctors) {
      final isSelected = _selectedDoctorId == doc['user_id'];
      final initials = "${doc['first_name'][0]}${doc['last_name'][0]}";

      items.add(
        GestureDetector(
          onTap: () {
            setState(() => _selectedDoctorId = doc['user_id']);
            _updatePurposesForSelectedDoctor(doc['user_id']);
            _fetchAvailableSlots();
          },
          behavior: HitTestBehavior.opaque,
          child: Container(
            margin: EdgeInsets.only(bottom: rs.h(8)),
            padding: EdgeInsets.symmetric(
              horizontal: rs.w(14),
              vertical: rs.h(12),
            ),
            decoration: BoxDecoration(
              color: isSelected ? _selectedDoctorBg : Colors.white,
              borderRadius: BorderRadius.circular(rs.r(18)),
              border: Border.all(
                color: isSelected ? primaryGreen : borderColor,
                width: isSelected ? 1.5 : 1,
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: avatarSize,
                  height: avatarSize,
                  decoration: BoxDecoration(
                    color: isSelected ? _selectedAvatarBg : softSage,
                    shape: BoxShape.circle,
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    initials,
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: rs.sp(13),
                      color: primaryGreen,
                    ),
                  ),
                ),
                SizedBox(width: rs.w(12)),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        "Dr. ${doc['first_name']} ${doc['last_name']}",
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: rs.sp(14),
                          color: textMain,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      Text(
                        doc['specialty'] ?? 'General & family medicine',
                        style: TextStyle(fontSize: rs.sp(12), color: textSub),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                if (isSelected) const Icon(Icons.check, size: 18, color: primaryGreen),
              ],
            ),
          ),
        ),
      );
    }
    return Column(children: items);
  }

  Widget _buildPurposeChips(Rs rs) {
    return Wrap(
      spacing: rs.w(8),
      runSpacing: rs.h(8),
      children: _currentPurposes.map((purpose) {
        final isSelected = _selectedPurpose == purpose;
        return GestureDetector(
          onTap: () => setState(() => _selectedPurpose = purpose),
          behavior: HitTestBehavior.opaque,
          child: Container(
            padding: EdgeInsets.symmetric(
              horizontal: rs.w(16),
              vertical: rs.h(10),
            ),
            decoration: BoxDecoration(
              color: isSelected ? primaryGreen : Colors.white,
              borderRadius: BorderRadius.circular(rs.r(20)),
              border: Border.all(
                color: isSelected ? primaryGreen : borderColor,
              ),
            ),
            child: Text(
              purpose,
              style: TextStyle(
                fontSize: rs.sp(12.5),
                fontWeight: FontWeight.w600,
                color: isSelected ? Colors.white : textMain,
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildDateHeader(Rs rs) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Flexible(
          child: Text(
            'Choose a date',
            style: TextStyle(
              fontSize: rs.sp(20),
              fontWeight: FontWeight.w800,
              color: textMain,
              letterSpacing: -0.3,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
        SizedBox(width: rs.w(8)),
        InkWell(
          onTap: _pickDate,
          borderRadius: BorderRadius.circular(rs.r(8)),
          child: Padding(
            padding: EdgeInsets.symmetric(
              horizontal: rs.w(4),
              vertical: rs.h(2),
            ),
            child: Row(
              children: [
                ValueListenableBuilder<String>(
                  valueListenable: _monthNotifier,
                  builder: (context, month, _) => AnimatedSwitcher(
                    duration: const Duration(milliseconds: 200),
                    child: Text(
                      month,
                      key: ValueKey<String>(month),
                      style: TextStyle(
                        fontSize: rs.sp(15.5),
                        fontWeight: FontWeight.w700,
                        color: primaryGreen,
                      ),
                    ),
                  ),
                ),
                SizedBox(width: rs.w(4)),
                const Icon(Icons.arrow_drop_down, color: primaryGreen, size: 20),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildDateCarousel(Rs rs) {
    // The item extent is stored on the State so the scroll listener, the
    // animateTo call in _pickDate, and this builder all agree on the same
    // value — otherwise the month label desyncs from the visible date.
    final extent = _dateItemExtent;
    final carouselHeight = extent * 1.28;

    const weekdayAbbr = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

    return SizedBox(
      height: carouselHeight,
      child: ListView.builder(
        controller: _dateScrollController,
        scrollDirection: Axis.horizontal,
        itemExtent: extent,
        itemCount: _upcomingWeekdays.length,
        cacheExtent: 200,
        addAutomaticKeepAlives: false,
        addRepaintBoundaries: true,
        itemBuilder: (context, index) {
          final date = _upcomingWeekdays[index];
          final isSelected = _isSameDay(date, _selectedDate);

          final dayName = weekdayAbbr[date.weekday - 1];
          final isMonthStart =
              index == 0 || date.month != _upcomingWeekdays[index - 1].month;
          final monthBadge = _monthsAbbr[date.month - 1];

          return GestureDetector(
            onTap: () {
              setState(() => _selectedDate = date);
              _monthNotifier.value =
                  "${_months[date.month - 1]} ${date.year}";
              _fetchAvailableSlots();
            },
            behavior: HitTestBehavior.opaque,
            child: Padding(
              padding: EdgeInsets.only(
                right: index == _upcomingWeekdays.length - 1 ? 0 : rs.w(10),
              ),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                decoration: BoxDecoration(
                  color: isSelected ? primaryGreen : Colors.white,
                  borderRadius: BorderRadius.circular(rs.r(22)),
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
                    if (isMonthStart)
                      Container(
                        padding: EdgeInsets.symmetric(
                          horizontal: rs.w(5),
                          vertical: rs.h(1),
                        ),
                        margin: EdgeInsets.only(bottom: rs.h(2)),
                        decoration: BoxDecoration(
                          color: isSelected
                              ? Colors.white.withValues(alpha: 0.25)
                              : softSage,
                          borderRadius: BorderRadius.circular(rs.r(6)),
                        ),
                        child: Text(
                          monthBadge,
                          style: TextStyle(
                            fontSize: rs.sp(9),
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
                          fontSize: rs.sp(11),
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.5,
                          color: isSelected
                              ? Colors.white.withValues(alpha: 0.85)
                              : _monthTagColor,
                        ),
                      ),
                    SizedBox(height: rs.h(4)),
                    Text(
                      '${date.day}',
                      style: TextStyle(
                        fontSize: rs.sp(22),
                        fontWeight: FontWeight.w800,
                        color: isSelected ? Colors.white : textMain,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildSlotGrid(Rs rs) {
    if (_loadingSlots) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(20),
          child: CircularProgressIndicator(color: primaryGreen, strokeWidth: 2),
        ),
      );
    }
    if (_slots.isEmpty) {
      return Container(
        padding: EdgeInsets.all(rs.w(16)),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(rs.r(16)),
          border: Border.all(color: borderColor),
        ),
        child: Text(
          'No slots available on this date.',
          style: TextStyle(color: textSub, fontSize: rs.sp(13)),
        ),
      );
    }

    final amSlots = _slots.where((s) => _isMorning(s['time'] as String)).toList();
    final pmSlots = _slots.where((s) => !_isMorning(s['time'] as String)).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (amSlots.isNotEmpty) ...[
          _buildSlotGroupHeader(
            rs: rs,
            icon: Icons.wb_sunny_outlined,
            label: 'Morning',
            range: _formatSlotRange(amSlots),
          ),
          SizedBox(height: rs.h(12)),
          _buildSlotWrap(rs, amSlots),
        ],
        if (amSlots.isNotEmpty && pmSlots.isNotEmpty) ...[
          SizedBox(height: rs.h(22)),
          _buildSectionBreak(),
          SizedBox(height: rs.h(22)),
        ],
        if (pmSlots.isNotEmpty) ...[
          _buildSlotGroupHeader(
            rs: rs,
            icon: Icons.wb_twilight,
            label: 'Afternoon',
            range: _formatSlotRange(pmSlots),
          ),
          SizedBox(height: rs.h(12)),
          _buildSlotWrap(rs, pmSlots),
        ],
      ],
    );
  }

  Widget _buildInfoCard(Rs rs) {
    return Container(
      padding: EdgeInsets.all(rs.w(18)),
      decoration: BoxDecoration(
        color: _infoCardBg,
        borderRadius: BorderRadius.circular(rs.r(22)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.healing_outlined, size: rs.w(18), color: primaryGreen),
              SizedBox(width: rs.w(8)),
              Text(
                'A smoother visit.',
                style: TextStyle(
                  fontSize: rs.sp(15),
                  fontWeight: FontWeight.w800,
                  color: const Color(0xFF191C1A),
                ),
              ),
            ],
          ),
          SizedBox(height: rs.h(12)),
          _CheckItem(rs: rs, text: 'Bring your university ID and health pass.'),
          _CheckItem(rs: rs, text: 'Arrive 10 minutes before your appointment.'),
          _CheckItem(rs: rs, text: 'Keep a list of any medications you take.'),
          Divider(color: _dividerSoft, height: rs.h(24)),
          Row(
            children: [
              Icon(Icons.location_on_outlined, size: rs.w(15), color: textSub),
              SizedBox(width: rs.w(6)),
              Flexible(
                child: Text(
                  'PSU Lingayen Campus Infirmary',
                  style: TextStyle(
                    fontSize: rs.sp(12),
                    fontWeight: FontWeight.bold,
                    color: textMain,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          Padding(
            padding: EdgeInsets.only(left: rs.w(21), top: rs.h(2)),
            child: Text(
              'Monday–Friday · 8 AM–5 PM',
              style: TextStyle(fontSize: rs.sp(11.5), color: textSub),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHistoryTab(Rs rs) {
    if (_loadingHistory) {
      return const Center(child: CircularProgressIndicator(color: primaryGreen));
    }

    if (_myAppointments.isEmpty) {
      return RefreshIndicator(
        color: primaryGreen,
        onRefresh: _fetchMyAppointments,
        child: ListView(
          padding: EdgeInsets.all(rs.w(24)),
          children: [
            SizedBox(height: rs.h(60)),
            Icon(
              Icons.calendar_month_outlined,
              size: rs.w(54).clamp(44.0, 60.0),
              color: const Color(0xFFA4B0A6),
            ),
            SizedBox(height: rs.h(12)),
            Center(
              child: Text(
                'No appointments booked yet.',
                style: TextStyle(
                  color: textSub,
                  fontSize: rs.sp(14),
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      color: primaryGreen,
      onRefresh: _fetchMyAppointments,
      child: ListView.builder(
        padding: EdgeInsets.symmetric(
          horizontal: rs.w(20),
          vertical: rs.h(8),
        ),
        itemCount: _myAppointments.length,
        addAutomaticKeepAlives: false,
        addRepaintBoundaries: true,
        addSemanticIndexes: false,
        itemBuilder: (context, index) {
          final item = _myAppointments[index];
          final status = (item['status'] ?? 'scheduled').toString().toLowerCase();

          final isConfirmed = status == 'scheduled' || status == 'checked_in';
          final isCompleted = status == 'completed';

          return RepaintBoundary(
            child: Container(
              margin: EdgeInsets.only(bottom: rs.h(14)),
              padding: EdgeInsets.all(rs.w(18)),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(rs.r(22)),
                border: Border.all(color: borderColor),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      Container(
                        padding: EdgeInsets.all(rs.w(6)),
                        decoration: BoxDecoration(
                          color: softSage,
                          borderRadius: BorderRadius.circular(rs.r(8)),
                        ),
                        child: Icon(
                          Icons.calendar_today_outlined,
                          size: rs.w(16),
                          color: primaryGreen,
                        ),
                      ),
                      SizedBox(width: rs.w(10)),
                      Expanded(
                        child: Text(
                          item['appointment_type'] ?? 'General consultation',
                          style: TextStyle(
                            fontSize: rs.sp(14.5),
                            fontWeight: FontWeight.w800,
                            color: textMain,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      SizedBox(width: rs.w(8)),
                      Container(
                        padding: EdgeInsets.symmetric(
                          horizontal: rs.w(10),
                          vertical: rs.h(4),
                        ),
                        decoration: BoxDecoration(
                          color: isConfirmed
                              ? const Color(0xFFE5EDE4)
                              : isCompleted
                                  ? const Color(0xFFE2EBE1)
                                  : const Color(0xFFFDE8E8),
                          borderRadius: BorderRadius.circular(rs.r(12)),
                        ),
                        child: Text(
                          status == 'scheduled' ? 'Confirmed' : status.toUpperCase(),
                          style: TextStyle(
                            fontSize: rs.sp(10.5),
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
                  SizedBox(height: rs.h(10)),
                  Text(
                    "Dr. ${item['doctor_first_name']} ${item['doctor_last_name']}",
                    style: TextStyle(
                      fontSize: rs.sp(13),
                      color: textSub,
                      fontWeight: FontWeight.w500,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  SizedBox(height: rs.h(6)),
                  Row(
                    children: [
                      Icon(Icons.event_outlined, size: rs.w(15), color: textSub),
                      SizedBox(width: rs.w(6)),
                      Expanded(
                        child: Text(
                          _formatDateTime(
                              item['formatted_date_time'] ?? item['date_time']),
                          style: TextStyle(
                            fontSize: rs.sp(12.5),
                            fontWeight: FontWeight.w700,
                            color: textMain,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  SizedBox(height: rs.h(4)),
                  Row(
                    children: [
                      Icon(Icons.location_on_outlined, size: rs.w(15), color: textSub),
                      SizedBox(width: rs.w(6)),
                      Expanded(
                        child: Text(
                          'Medical Clinic · Room 1',
                          style: TextStyle(fontSize: rs.sp(12), color: textSub),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  if (item['notes'] != null && item['notes'].toString().isNotEmpty) ...[
                    SizedBox(height: rs.h(10)),
                    Container(
                      width: double.infinity,
                      padding: EdgeInsets.all(rs.w(10)),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF7F9F6),
                        borderRadius: BorderRadius.circular(rs.r(12)),
                      ),
                      child: Text(
                        item['notes'],
                        style: TextStyle(fontSize: rs.sp(12), color: textSub),
                      ),
                    ),
                  ],
                  if (status == 'scheduled') ...[
                    SizedBox(height: rs.h(12)),
                    GestureDetector(
                      onTap: () => _cancelAppointment(item['appointment_id']),
                      behavior: HitTestBehavior.opaque,
                      child: Text(
                        'Cancel appointment',
                        style: TextStyle(
                          color: const Color(0xFF7A2E26),
                          fontSize: rs.sp(13),
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildSectionHeader(Rs rs, String number, String title) {
    final badgeSize = rs.w(22).clamp(20.0, 26.0);
    return Row(
      children: [
        Container(
          width: badgeSize,
          height: badgeSize,
          decoration: const BoxDecoration(
            color: softSage,
            shape: BoxShape.circle,
          ),
          alignment: Alignment.center,
          child: Text(
            number,
            style: TextStyle(
              fontSize: rs.sp(11),
              fontWeight: FontWeight.w800,
              color: primaryGreen,
            ),
          ),
        ),
        SizedBox(width: rs.w(8)),
        Flexible(
          child: Text(
            title,
            style: TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: rs.sp(14.5),
              color: textMain,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}

class _CheckItem extends StatelessWidget {
  final Rs rs;
  final String text;
  const _CheckItem({required this.rs, required this.text});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: rs.h(6)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.check, size: 16, color: Color(0xFF284E3A)),
          SizedBox(width: rs.w(8)),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontSize: rs.sp(12.5),
                color: const Color(0xFF424943),
              ),
            ),
          ),
        ],
      ),
    );
  }
}