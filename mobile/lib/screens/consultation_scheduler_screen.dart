// mobile/lib/screens/consultation_scheduler_screen.dart
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import '../config/api_config.dart';
import '../services/emergency_alert_service.dart';

class ConsultationSchedulerScreen extends StatefulWidget {
  const ConsultationSchedulerScreen({super.key});

  @override
  State<ConsultationSchedulerScreen> createState() => _ConsultationSchedulerScreenState();
}

class _ConsultationSchedulerScreenState extends State<ConsultationSchedulerScreen> {
  final _storage = const FlutterSecureStorage();

  // 0 = Book Consultation, 1 = My Bookings
  int _activeSubTab = 0;

  // Booking state
  List<dynamic> _doctors = [];
  bool _loadingDoctors = false;
  int? _selectedDoctorId;

  DateTime _selectedDate = DateTime.now().add(const Duration(days: 1));
  List<dynamic> _slots = [];
  bool _loadingSlots = false;
  String? _selectedSlotTime;

  // Specific Medical vs. Dental consultation purposes
  final List<String> _medicalPurposes = [
    'General Medical Consultation',
    'Physical Examination',
    'Prescription Refill / Lab Review',
    'OJT / Academic Medical Clearance',
  ];

  final List<String> _dentalPurposes = [
    'Dental Check-up / Oral Examination',
    'Tooth Extraction',
    'Oral Prophylaxis (Cleaning)',
    'Dental Filling / Cavity Restoration',
    'Dental Pain / Toothache Emergency',
  ];

  List<String> _currentPurposes = [];
  String _selectedPurpose = 'General Medical Consultation';

  final _notesController = TextEditingController();
  bool _isSubmitting = false;

  // History state
  List<dynamic> _myAppointments = [];
  bool _loadingHistory = false;

  @override
  void initState() {
    super.initState();
    _currentPurposes = _medicalPurposes;
    _fetchDoctors();
    _fetchMyAppointments();
  }

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
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
      final res = await http.get(
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
      final res = await http.get(
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
      final res = await http.get(
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
      final res = await http.post(
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
              icon: const Icon(Icons.check_circle, color: Color(0xFF0F766E), size: 48),
              title: const Text('Consultation Scheduled', style: TextStyle(fontWeight: FontWeight.bold)),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Scheduled for: $scheduledDateTime', style: const TextStyle(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 6),
                  Text('Purpose: $_selectedPurpose'),
                  const SizedBox(height: 12),
                  const Text(
                    'Reminders:\n• Please arrive 10 minutes prior to your time block.\n• Present your QR Health Pass at the Infirmary reception for touchless check-in.',
                    style: TextStyle(fontSize: 12, color: Colors.black87),
                  ),
                ],
              ),
              actions: [
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF0F766E),
                    foregroundColor: Colors.white,
                  ),
                  onPressed: () {
                    Navigator.pop(ctx);
                    setState(() => _activeSubTab = 1);
                  },
                  child: const Text('View in My Bookings'),
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
        title: const Text('Cancel Consultation'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Are you sure you want to cancel this scheduled appointment?'),
            const SizedBox(height: 12),
            TextField(
              controller: reasonController,
              decoration: const InputDecoration(
                labelText: 'Reason for cancellation',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Keep')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red, foregroundColor: Colors.white),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Confirm Cancel'),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    final token = await _storage.read(key: 'jwt_token');
    try {
      final res = await http.patch(
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
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate.isBefore(now) ? now.add(const Duration(days: 1)) : _selectedDate,
      firstDate: now,
      lastDate: now.add(const Duration(days: 60)),
      selectableDayPredicate: (day) => day.weekday != DateTime.saturday && day.weekday != DateTime.sunday,
    );

    if (picked != null && picked != _selectedDate) {
      setState(() => _selectedDate = picked);
      _fetchAvailableSlots();
    }
  }

  void _showToast(String message, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? Colors.red.shade700 : const Color(0xFF0F766E),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          color: Colors.white,
          child: SizedBox(
            width: double.infinity,
            child: SegmentedButton<int>(
              segments: const [
                ButtonSegment<int>(
                  value: 0,
                  icon: Icon(Icons.edit_calendar_outlined),
                  label: Text('Book Consultation'),
                ),
                ButtonSegment<int>(
                  value: 1,
                  icon: Icon(Icons.history_rounded),
                  label: Text('My Bookings'),
                ),
              ],
              selected: {_activeSubTab},
              onSelectionChanged: (newSelection) {
                setState(() => _activeSubTab = newSelection.first);
              },
              style: ButtonStyle(
                shape: WidgetStateProperty.all(
                  RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
              ),
            ),
          ),
        ),
        const Divider(height: 1),
        Expanded(
          child: _activeSubTab == 0 ? _buildBookingTab() : _buildHistoryTab(),
        ),
      ],
    );
  }

  // --- SUB-VIEW 0: BOOKING FORM ---
  Widget _buildBookingTab() {
    if (_loadingDoctors) {
      return const Center(child: CircularProgressIndicator(color: Color(0xFF0F766E)));
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('1. Select Attending Practitioner', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
        const SizedBox(height: 6),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            border: Border.all(color: Colors.grey.shade300),
            borderRadius: BorderRadius.circular(8),
            color: Colors.white,
          ),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<int>(
              value: _selectedDoctorId,
              isExpanded: true,
              hint: const Text('Choose a doctor/dentist'),
              items: _doctors.map<DropdownMenuItem<int>>((doc) {
                return DropdownMenuItem<int>(
                  value: doc['user_id'],
                  child: Text(
                    "Dr. ${doc['first_name']} ${doc['last_name']} (${doc['specialty']})",
                    style: const TextStyle(fontSize: 14),
                  ),
                );
              }).toList(),
              onChanged: (val) {
                if (val != null) {
                  setState(() => _selectedDoctorId = val);
                  _updatePurposesForSelectedDoctor(val);
                  _fetchAvailableSlots();
                }
              },
            ),
          ),
        ),
        const SizedBox(height: 18),

        const Text('2. Purpose of Visit', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
        const SizedBox(height: 6),
        Wrap(
          spacing: 8,
          runSpacing: 4,
          children: _currentPurposes.map((purpose) {
            final isSelected = _selectedPurpose == purpose;
            return ChoiceChip(
              label: Text(purpose, style: TextStyle(fontSize: 12, color: isSelected ? Colors.white : Colors.black87)),
              selected: isSelected,
              selectedColor: const Color(0xFF0F766E),
              onSelected: (_) => setState(() => _selectedPurpose = purpose),
            );
          }).toList(),
        ),
        const SizedBox(height: 18),

        const Text('3. Consultation Date', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
        const SizedBox(height: 6),
        InkWell(
          onTap: _pickDate,
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
            decoration: BoxDecoration(
              color: Colors.teal.shade50,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: const Color(0xFF0F766E)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(Icons.calendar_today, color: Color(0xFF0F766E), size: 20),
                    const SizedBox(width: 10),
                    Text(
                      "${_selectedDate.year}-${_selectedDate.month.toString().padLeft(2, '0')}-${_selectedDate.day.toString().padLeft(2, '0')}",
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF0F766E)),
                    ),
                  ],
                ),
                const Text('Change Date', style: TextStyle(color: Color(0xFF0F766E), fontWeight: FontWeight.bold)),
              ],
            ),
          ),
        ),
        const SizedBox(height: 18),

        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('4. Available Time Slots', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
            if (_loadingSlots)
              const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF0F766E)))
          ],
        ),
        const SizedBox(height: 8),
        _slots.isEmpty
            ? Container(
                padding: const EdgeInsets.all(16),
                alignment: Alignment.center,
                decoration: BoxDecoration(color: Colors.grey.shade100, borderRadius: BorderRadius.circular(8)),
                child: const Text('No slots available on this date.', style: TextStyle(color: Colors.black54)),
              )
            : GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 4,
                  mainAxisSpacing: 8,
                  crossAxisSpacing: 8,
                  childAspectRatio: 2.1,
                ),
                itemCount: _slots.length,
                itemBuilder: (context, index) {
                  final slot = _slots[index];
                  final time = slot['time'];
                  final isAvail = slot['isAvailable'] == true;
                  final isSelected = _selectedSlotTime == time;

                  return ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      padding: EdgeInsets.zero,
                      backgroundColor: isSelected
                          ? const Color(0xFF0F766E)
                          : isAvail
                              ? Colors.white
                              : Colors.grey.shade200,
                      foregroundColor: isSelected
                          ? Colors.white
                          : isAvail
                              ? const Color(0xFF0F766E)
                              : Colors.grey.shade400,
                      side: BorderSide(
                        color: isSelected
                            ? const Color(0xFF0F766E)
                            : isAvail
                                ? Colors.teal.shade200
                                : Colors.transparent,
                      ),
                      elevation: isSelected ? 2 : 0,
                    ),
                    onPressed: isAvail ? () => setState(() => _selectedSlotTime = time) : null,
                    child: Text(
                      time,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        decoration: isAvail ? TextDecoration.none : TextDecoration.lineThrough,
                      ),
                    ),
                  );
                },
              ),
        const SizedBox(height: 18),

        const Text('5. Symptoms / Visit Notes (Optional)', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
        const SizedBox(height: 6),
        TextField(
          controller: _notesController,
          maxLines: 2,
          decoration: const InputDecoration(
            hintText: 'Briefly state symptoms or requirements...',
            border: OutlineInputBorder(),
            fillColor: Colors.white,
            filled: true,
          ),
        ),
        const SizedBox(height: 24),

        ElevatedButton.icon(
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF0F766E),
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 14),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          ),
          onPressed: _isSubmitting ? null : _submitBooking,
          icon: _isSubmitting
              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
              : const Icon(Icons.check_circle_outline),
          label: Text(
            _isSubmitting ? 'Confirming Booking...' : 'Confirm Appointment',
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
          ),
        ),
        const SizedBox(height: 20),
      ],
    );
  }

  // --- SUB-VIEW 1: MY BOOKINGS ---
  Widget _buildHistoryTab() {
    if (_loadingHistory) {
      return const Center(child: CircularProgressIndicator(color: Color(0xFF0F766E)));
    }

    if (_myAppointments.isEmpty) {
      return RefreshIndicator(
        onRefresh: _fetchMyAppointments,
        child: ListView(
          children: const [
            SizedBox(height: 80),
            Icon(Icons.event_busy, size: 60, color: Colors.grey),
            SizedBox(height: 12),
            Center(child: Text('No appointments booked yet.', style: TextStyle(color: Colors.black54, fontSize: 15))),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _fetchMyAppointments,
      child: ListView.builder(
        padding: const EdgeInsets.all(12),
        itemCount: _myAppointments.length,
        itemBuilder: (context, index) {
          final item = _myAppointments[index];
          final status = item['status'] ?? 'scheduled';

          Color statusColor = Colors.blue;
          if (status == 'scheduled') statusColor = Colors.orange.shade700;
          if (status == 'checked_in' || status == 'serving') statusColor = Colors.teal;
          if (status == 'completed') statusColor = Colors.green.shade700;
          if (status == 'cancelled' || status == 'no_show') statusColor = Colors.red.shade700;

          return Card(
            elevation: 1,
            margin: const EdgeInsets.only(bottom: 12),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        item['appointment_type'] ?? 'General Checkup',
                        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: statusColor.withAlpha(30),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: statusColor),
                        ),
                        child: Text(
                          status.toUpperCase(),
                          style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: statusColor),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    "Attending: Dr. ${item['doctor_first_name']} ${item['doctor_last_name']} (${item['doctor_specialty']})",
                    style: const TextStyle(color: Colors.black87, fontSize: 13),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(Icons.access_time, size: 16, color: Color(0xFF0F766E)),
                      const SizedBox(width: 6),
                      Text(
                        item['formatted_date_time'] ?? item['date_time'],
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Color(0xFF0F766E)),
                      ),
                    ],
                  ),
                  if (item['notes'] != null && item['notes'].toString().isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text("Notes: ${item['notes']}", style: const TextStyle(fontSize: 12, color: Colors.black54)),
                  ],
                  if (status == 'scheduled') ...[
                    const Divider(height: 18),
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton.icon(
                        style: TextButton.styleFrom(foregroundColor: Colors.red),
                        onPressed: () => _cancelAppointment(item['appointment_id']),
                        icon: const Icon(Icons.cancel_outlined, size: 16),
                        label: const Text('Cancel Booking'),
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
}