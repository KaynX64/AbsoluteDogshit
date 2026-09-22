// mobile/lib/screens/documents_viewer_screen.dart
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:qr_flutter/qr_flutter.dart';
import '../config/api_config.dart';

class DocumentsViewerScreen extends StatefulWidget {
  const DocumentsViewerScreen({super.key});

  @override
  State<DocumentsViewerScreen> createState() => _DocumentsViewerScreenState();
}

class _DocumentsViewerScreenState extends State<DocumentsViewerScreen> {
  final _storage = const FlutterSecureStorage();

  // 0 = Prescriptions, 1 = Clearances
  int _selectedSubTab = 0;

  List<dynamic> _prescriptions = [];
  bool _loadingPrescriptions = false;

  List<dynamic> _clearances = [];
  bool _loadingClearances = false;

  @override
  void initState() {
    super.initState();
    _fetchPrescriptions();
    _fetchClearances();
  }

  Future<void> _fetchPrescriptions() async {
    setState(() => _loadingPrescriptions = true);
    final token = await _storage.read(key: 'jwt_token');
    try {
      final res = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/api/documents/prescriptions/my'),
        headers: {'Authorization': 'Bearer $token'},
      );
      if (res.statusCode == 200) {
        setState(() => _prescriptions = jsonDecode(res.body));
      }
    } catch (_) {}
    if (mounted) setState(() => _loadingPrescriptions = false);
  }

  Future<void> _fetchClearances() async {
    setState(() => _loadingClearances = true);
    final token = await _storage.read(key: 'jwt_token');
    try {
      final res = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/api/documents/clearances/my'),
        headers: {'Authorization': 'Bearer $token'},
      );
      if (res.statusCode == 200) {
        setState(() => _clearances = jsonDecode(res.body));
      }
    } catch (_) {}
    if (mounted) setState(() => _loadingClearances = false);
  }

  String _formatDate(String? rawDate) {
    if (rawDate == null || rawDate.isEmpty) return 'N/A';
    try {
      final dt = DateTime.parse(rawDate).toLocal();
      return "${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}";
    } catch (_) {
      return rawDate.split('T').first;
    }
  }

  // --- Modal: Prescription QR Verification Details (Fixed with Dialog) ---
  void _showPrescriptionQrModal(Map<String, dynamic> rx) {
    final qrToken = rx['qr_token'] ?? '';
    showDialog(
      context: context,
      builder: (ctx) => Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: SingleChildScrollView(
            child: SizedBox(
              width: double.maxFinite,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.qr_code_scanner, color: Color(0xFF0F766E)),
                      const SizedBox(width: 8),
                      const Text(
                        'Digital Rx Verification',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Container(
                    width: 210,
                    height: 210,
                    alignment: Alignment.center,
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.teal.shade100),
                      boxShadow: const [BoxShadow(color: Colors.black12, blurRadius: 6)],
                    ),
                    child: QrImageView(
                      data: qrToken,
                      version: QrVersions.auto,
                      size: 190.0,
                    ),
                  ),
                  const SizedBox(height: 14),
                  Text(
                    "Prescription #${rx['prescription_id']}",
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    "Attending: Dr. ${rx['doctor_first_name']} ${rx['doctor_last_name']} (${rx['doctor_license']})",
                    style: const TextStyle(fontSize: 12, color: Colors.black54),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 10),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Colors.grey.shade100,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      "Verification Token:\n$qrToken",
                      style: const TextStyle(fontSize: 10, fontFamily: 'monospace', color: Colors.black87),
                      textAlign: TextAlign.center,
                    ),
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    'Present this QR code to the university infirmary or accredited pharmacy to verify authenticity.',
                    style: TextStyle(fontSize: 11, color: Colors.black54),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 18),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF0F766E),
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      onPressed: () => Navigator.pop(ctx),
                      child: const Text('Close'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  // --- Modal: Official Clearance Certificate & Digital Seal (Fixed with Dialog) ---
  void _showClearanceCertificateModal(Map<String, dynamic> clearance) {
    final qrToken = clearance['qr_token'] ?? '';
    final rawExpiry = clearance['expires_at'];
    DateTime? expiryDate;
    bool isExpired = false;
    if (rawExpiry != null) {
      try {
        expiryDate = DateTime.parse(rawExpiry);
        isExpired = expiryDate.isBefore(DateTime.now());
      } catch (_) {}
    }

    showDialog(
      context: context,
      builder: (ctx) => Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: SingleChildScrollView(
            child: SizedBox(
              width: double.maxFinite,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // PSU Infirmary Header
                  const Text(
                    'PANGASINAN STATE UNIVERSITY',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 13,
                      color: Color(0xFF0F766E),
                      letterSpacing: 0.5,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const Text(
                    'CAMPUS INFIRMARY MEDICAL SERVICES',
                    style: TextStyle(fontSize: 10, color: Colors.black54, fontWeight: FontWeight.bold),
                    textAlign: TextAlign.center,
                  ),
                  const Divider(height: 18),

                  const Text(
                    'OFFICIAL MEDICAL CLEARANCE',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, decoration: TextDecoration.underline),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 12),

                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF0FDFA),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.teal.shade200),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          "Purpose: ${clearance['purpose']}",
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          "Issued: ${_formatDate(clearance['issued_at'])}",
                          style: const TextStyle(fontSize: 12),
                        ),
                        Text(
                          "Valid Until: ${_formatDate(clearance['expires_at'])}",
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: isExpired ? Colors.red : Colors.green.shade800,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),

                  // Cryptographic QR Seal
                  Container(
                    width: 180,
                    height: 180,
                    alignment: Alignment.center,
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.grey.shade300),
                    ),
                    child: QrImageView(
                      data: qrToken,
                      version: QrVersions.auto,
                      size: 160.0,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    "Digital Seal Token: ${qrToken.substring(0, qrToken.length > 20 ? 20 : qrToken.length)}...",
                    style: const TextStyle(fontSize: 10, fontFamily: 'monospace', color: Colors.black54),
                  ),
                  const SizedBox(height: 12),

                  // Signer Metadata Block
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Colors.grey.shade50,
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: Colors.grey.shade200),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        Text(
                          "Dr. ${clearance['doctor_first_name']} ${clearance['doctor_last_name']}",
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                        ),
                        Text(
                          "Attending Physician • ${clearance['doctor_license']}",
                          style: const TextStyle(fontSize: 11, color: Colors.black54),
                        ),
                        const Text(
                          "Republic Act No. 10173 Verified E-Signature",
                          style: TextStyle(fontSize: 10, fontStyle: FontStyle.italic, color: Color(0xFF0F766E)),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF0F766E),
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      onPressed: () => Navigator.pop(ctx),
                      child: const Text('Dismiss'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Sub-Tab Switcher
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          color: Colors.white,
          child: SizedBox(
            width: double.infinity,
            child: SegmentedButton<int>(
              segments: const [
                ButtonSegment<int>(
                  value: 0,
                  icon: Icon(Icons.medication_outlined),
                  label: Text('Prescriptions (℞)'),
                ),
                ButtonSegment<int>(
                  value: 1,
                  icon: Icon(Icons.verified_outlined),
                  label: Text('Clearances (📄)'),
                ),
              ],
              selected: {_selectedSubTab},
              onSelectionChanged: (newSelection) {
                setState(() => _selectedSubTab = newSelection.first);
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

        // Sub-Tab Body
        Expanded(
          child: _selectedSubTab == 0 ? _buildPrescriptionsList() : _buildClearancesList(),
        ),
      ],
    );
  }

  // --- SUB-VIEW 0: PRESCRIPTIONS LIST ---
  Widget _buildPrescriptionsList() {
    if (_loadingPrescriptions) {
      return const Center(child: CircularProgressIndicator(color: Color(0xFF0F766E)));
    }

if (_prescriptions.isEmpty) {
  return RefreshIndicator(
    onRefresh: _fetchPrescriptions,
    child: ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: const [
        SizedBox(height: 80),
        Icon(Icons.medication_liquid_outlined, size: 64, color: Colors.grey),
        SizedBox(height: 12),
        Center(child: Text('No digital prescriptions on record.')),
      ],
    ),
  );
}

    return RefreshIndicator(
      onRefresh: _fetchPrescriptions,
      child: ListView.builder(
        padding: const EdgeInsets.all(12),
        itemCount: _prescriptions.length,
        itemBuilder: (context, index) {
          final rx = _prescriptions[index];
          final items = rx['items'] as List<dynamic>? ?? [];
          final status = (rx['status'] ?? 'active').toString().toLowerCase();

          Color statusColor = Colors.green.shade700;
          if (status == 'dispensed') statusColor = Colors.blue.shade700;
          if (status == 'expired' || status == 'cancelled') statusColor = Colors.red.shade700;

          return Card(
            elevation: 2,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
              side: BorderSide(color: Colors.teal.shade200, width: 1),
            ),
            margin: const EdgeInsets.only(bottom: 14),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Card Header
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          const Text(
                            '℞',
                            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: Color(0xFF0F766E)),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            "Prescription #${rx['prescription_id']}",
                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                          ),
                        ],
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: statusColor.withAlpha(25),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: statusColor),
                        ),
                        child: Text(
                          status.toUpperCase(),
                          style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: statusColor),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),

                  Text(
                    "Physician: Dr. ${rx['doctor_first_name']} ${rx['doctor_last_name']} (${rx['doctor_license']})",
                    style: const TextStyle(fontSize: 13, color: Colors.black87),
                  ),
                  Text(
                    "Issued: ${_formatDate(rx['issued_at'])}",
                    style: const TextStyle(fontSize: 12, color: Colors.black54),
                  ),
                  const Divider(height: 18),

                  // Prescribed Medication Line Items
                  const Text('Prescribed Medications:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Color(0xFF0F766E))),
                  const SizedBox(height: 6),
                  if (items.isEmpty)
                    const Text('No line items recorded.', style: TextStyle(fontSize: 12, fontStyle: FontStyle.italic, color: Colors.grey))
                  else
                    ...items.map((item) {
                      return Container(
                        margin: const EdgeInsets.only(bottom: 8),
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: Colors.grey.shade50,
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: Colors.grey.shade200),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  "${item['medicine_name']} (${item['strength'] ?? 'Standard'})",
                                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                                ),
                                Text(
                                  "${item['form'] ?? 'Tablet'}",
                                  style: const TextStyle(fontSize: 11, color: Colors.black54),
                                ),
                              ],
                            ),
                            if (item['generic_name'] != null)
                              Text(
                                "Generic: ${item['generic_name']}",
                                style: const TextStyle(fontSize: 11, fontStyle: FontStyle.italic, color: Colors.black54),
                              ),
                            const SizedBox(height: 3),
                            Text(
                              "Sig: ${item['dosage']} • ${item['frequency']}",
                              style: const TextStyle(fontSize: 12, color: Colors.black87),
                            ),
                            if (item['instructions'] != null && item['instructions'].toString().isNotEmpty)
                              Text(
                                "Note: ${item['instructions']}",
                                style: TextStyle(fontSize: 11, color: Colors.teal.shade800),
                              ),
                          ],
                        ),
                      );
                    }),

                  if (rx['notes'] != null && rx['notes'].toString().isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text("Doctor Notes: ${rx['notes']}", style: const TextStyle(fontSize: 12, color: Colors.black54)),
                  ],
                  const SizedBox(height: 10),

                  // Verification Button
                  Align(
                    alignment: Alignment.centerRight,
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFF0F766E),
                        side: const BorderSide(color: Color(0xFF0F766E)),
                      ),
                      onPressed: () => _showPrescriptionQrModal(rx),
                      icon: const Icon(Icons.qr_code, size: 16),
                      label: const Text('Show Rx QR & Verification'),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  // --- SUB-VIEW 1: MEDICAL CLEARANCES LIST ---
  Widget _buildClearancesList() {
    if (_loadingClearances) {
      return const Center(child: CircularProgressIndicator(color: Color(0xFF0F766E)));
    }

    if (_clearances.isEmpty) {
      return RefreshIndicator(
        onRefresh: _fetchClearances,
        child: ListView(
          children: const [
            SizedBox(height: 80),
            Icon(Icons.verified_user_outlined, size: 64, color: Colors.grey),
            SizedBox(height: 12),
            Center(child: Text('No medical clearances on record.', style: TextStyle(color: Colors.black54, fontSize: 15))),
            SizedBox(height: 6),
            Center(
              child: Text(
                'Clearances issued for OJT, sports, or academic requirements appear here.',
                style: TextStyle(color: Colors.grey, fontSize: 12),
                textAlign: TextAlign.center,
              ),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _fetchClearances,
      child: ListView.builder(
        padding: const EdgeInsets.all(12),
        itemCount: _clearances.length,
        itemBuilder: (context, index) {
          final c = _clearances[index];
          final rawExpiry = c['expires_at'];
          DateTime? expiryDate;
          int daysRemaining = 999;
          bool isExpired = false;

          if (rawExpiry != null) {
            try {
              expiryDate = DateTime.parse(rawExpiry);
              daysRemaining = expiryDate.difference(DateTime.now()).inDays;
              isExpired = daysRemaining < 0;
            } catch (_) {}
          }

          return Card(
            elevation: 2,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
              side: BorderSide(color: isExpired ? Colors.red.shade200 : Colors.teal.shade200, width: 1),
            ),
            margin: const EdgeInsets.only(bottom: 14),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Clearance Header & Expiry Tracker
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          c['purpose'] ?? 'Medical Clearance',
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: (isExpired ? Colors.red : Colors.green).withAlpha(25),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: isExpired ? Colors.red : Colors.green),
                        ),
                        child: Text(
                          isExpired ? 'EXPIRED' : (daysRemaining <= 30 ? 'EXPIRING SOON' : 'VALID'),
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            color: isExpired ? Colors.red : Colors.green.shade800,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),

                  Text("Physician: Dr. ${c['doctor_first_name']} ${c['doctor_last_name']} (${c['doctor_license']})", style: const TextStyle(fontSize: 13)),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(Icons.event_available, size: 16, color: Color(0xFF0F766E)),
                      const SizedBox(width: 6),
                      Text("Issued: ${_formatDate(c['issued_at'])}", style: const TextStyle(fontSize: 12, color: Colors.black87)),
                      const SizedBox(width: 14),
                      const Icon(Icons.event_busy, size: 16, color: Colors.red),
                      const SizedBox(width: 6),
                      Text("Expires: ${_formatDate(c['expires_at'])}", style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: isExpired ? Colors.red : Colors.black87)),
                    ],
                  ),
                  const Divider(height: 18),

                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        isExpired ? 'Status: Inactive' : 'Status: Ready for University Submission',
                        style: TextStyle(fontSize: 11, color: isExpired ? Colors.red : Colors.black54, fontWeight: FontWeight.bold),
                      ),
                      ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF0F766E),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        ),
                        onPressed: () => _showClearanceCertificateModal(c),
                        icon: const Icon(Icons.verified, size: 16),
                        label: const Text('View Certificate & Seal', style: TextStyle(fontSize: 12)),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}