// mobile/lib/screens/documents_viewer_screen.dart
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:open_filex/open_filex.dart';
import '../config/api_config.dart';

class DocumentsViewerScreen extends StatefulWidget {
  const DocumentsViewerScreen({super.key});

  @override
  State<DocumentsViewerScreen> createState() => _DocumentsViewerScreenState();
}

class _DocumentsViewerScreenState extends State<DocumentsViewerScreen> {
  final _storage = const FlutterSecureStorage();

  // 0 = Prescriptions, 1 = Clearances, 2 = Diagnostics & Lab
  int _selectedSubTab = 0;

  List<dynamic> _prescriptions = [];
  bool _loadingPrescriptions = false;

  List<dynamic> _clearances = [];
  bool _loadingClearances = false;

  List<dynamic> _diagnosticAttachments = [];
  bool _loadingDiagnostics = false;
  // Tracks which document id is currently downloading (null = nothing in flight)
  int? _downloadingId;

  static const primaryGreen = Color(0xFF284E3A);
  static const softSage = Color(0xFFE5EDE4);
  static const textMain = Color(0xFF191C1A);
  static const textSub = Color(0xFF5A635B);
  static const borderColor = Color(0xFFE2EBE2);

  @override
  void initState() {
    super.initState();
    _fetchPrescriptions();
    _fetchClearances();
    _fetchDiagnostics();
  }

  Future<void> _fetchPrescriptions() async {
    setState(() => _loadingPrescriptions = true);
    final token = await _storage.read(key: 'jwt_token');
    try {
      final res = await ApiConfig.client.get(
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
      final res = await ApiConfig.client.get(
        Uri.parse('${ApiConfig.baseUrl}/api/documents/clearances/my'),
        headers: {'Authorization': 'Bearer $token'},
      );
      if (res.statusCode == 200) {
        setState(() => _clearances = jsonDecode(res.body));
      }
    } catch (_) {}
    if (mounted) setState(() => _loadingClearances = false);
  }

  Future<void> _fetchDiagnostics() async {
    setState(() => _loadingDiagnostics = true);
    final token = await _storage.read(key: 'jwt_token');
    try {
      final res = await ApiConfig.client.get(
        Uri.parse('${ApiConfig.baseUrl}/api/documents/attachments/my'),
        headers: {'Authorization': 'Bearer $token'},
      );
      if (res.statusCode == 200) {
        setState(() => _diagnosticAttachments = jsonDecode(res.body));
      }
    } catch (_) {}
    if (mounted) setState(() => _loadingDiagnostics = false);
  }

  String _formatDate(String? rawDate) {
    if (rawDate == null || rawDate.isEmpty) return 'N/A';
    try {
      final dt = DateTime.parse(rawDate).toLocal();
      const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      return "${months[dt.month - 1]} ${dt.day}, ${dt.year}";
    } catch (_) {
      return rawDate.split('T').first;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // PDF DOWNLOAD — fetches with Bearer auth, saves to device, opens it
  // ─────────────────────────────────────────────────────────────────
  Future<void> _downloadAndOpenPdf({
    required int documentId,
    required String kind, // 'prescriptions' | 'clearances'
  }) async {
    if (_downloadingId != null) return;

    setState(() => _downloadingId = documentId);

    try {
      final token = await _storage.read(key: 'jwt_token');
      final url = Uri.parse('${ApiConfig.baseUrl}/api/documents/$kind/$documentId/pdf');

      final res = await http.get(url, headers: {'Authorization': 'Bearer $token'});

      if (res.statusCode != 200) {
        // Try to read server error message
        String msg = 'Server returned ${res.statusCode}';
        try {
          final decoded = jsonDecode(res.body);
          if (decoded is Map && decoded['error'] != null) msg = decoded['error'];
        } catch (_) {}
        throw Exception(msg);
      }

      // Save to app documents dir (iOS-friendly, Android-friendly)
      final dir = await getApplicationDocumentsDirectory();
      final fileName = kind == 'prescriptions'
          ? 'prescription-$documentId.pdf'
          : 'clearance-$documentId.pdf';
      final file = File('${dir.path}/$fileName');
      await file.writeAsBytes(res.bodyBytes, flush: true);

      if (!mounted) return;

      // Hand off to the OS PDF viewer
      final result = await OpenFilex.open(file.path);
      if (result.type != ResultType.done && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Saved to ${file.path}\nCould not open automatically.'),
            backgroundColor: primaryGreen,
            duration: const Duration(seconds: 5),
          ),
        );
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('✅ PDF downloaded and opened.'),
            backgroundColor: primaryGreen,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Download failed: $e'),
            backgroundColor: const Color(0xFF7A2E26),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _downloadingId = null);
    }
  }

  // --- MODAL 1: FULL OFFICIAL DIGITAL PRESCRIPTION (℞) ---
  void _showPrescriptionDocumentModal(Map<String, dynamic> rx) {
    final qrToken = rx['qr_token'] ?? '';
    final verificationUrl = '${ApiConfig.baseUrl}/api/documents/verify/$qrToken';
    final items = rx['items'] as List<dynamic>? ?? [];
    final prescriptionId = rx['prescription_id'] as int?;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => DraggableScrollableSheet(
          initialChildSize: 0.9,
          maxChildSize: 0.95,
          minChildSize: 0.5,
          builder: (_, scrollController) => Container(
            decoration: const BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 16),
            child: ListView(
              controller: scrollController,
              children: [
                Center(
                  child: Container(
                    width: 44,
                    height: 5,
                    decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(10)),
                  ),
                ),
                const SizedBox(height: 18),

                // University Letterhead
                const Center(
                  child: Column(
                    children: [
                      Text('PANGASINAN STATE UNIVERSITY', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 2.0, color: Color(0xFF4D6053))),
                      SizedBox(height: 2),
                      Text('CAMPUS INFIRMARY MEDICAL SERVICES', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: primaryGreen)),
                      Text('Lingayen Campus · Republic Act No. 10173 Verified E-Prescription', style: TextStyle(fontSize: 10.5, color: textSub)),
                    ],
                  ),
                ),
                const Divider(color: primaryGreen, height: 28, thickness: 1.5),

                // Rx Emblem
                const Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'PANGASINAN STATE UNIVERSITY',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 2.0,
                        color: Color(0xFF4D6053),
                      ),
                    ),
                    SizedBox(height: 2),
                    Text(
                      'CAMPUS INFIRMARY MEDICAL SERVICES',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w900,
                        color: primaryGreen,
                      ),
                    ),
                    Text(
                      'Lingayen Campus · Republic Act No. 10173 Verified E-Prescription',
                      style: TextStyle(fontSize: 10.5, color: textSub),
                    ),
                  ],
                ),
                const SizedBox(height: 10),

              // Rx Emblem
              const Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    '℞',
                    style: TextStyle(
                      fontSize: 38,
                      fontWeight: FontWeight.w900,
                      color: primaryGreen,
                      fontFamily: 'serif',
                    ),
                  ),
                  Text(
                    'OFFICIAL DIGITAL PRESCRIPTION',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 1.0,
                      color: textSub,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),

              // Prescribed Items
              const Text(
                'PRESCRIBED FORMULARY MEDICATION:',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.0,
                  color: textSub,
                ),
              ),
              const SizedBox(height: 8),
              if (items.isEmpty)
                const Text(
                  'No line items recorded.',
                  style: TextStyle(
                    fontSize: 13,
                    fontStyle: FontStyle.italic,
                    color: textSub,
                  ),
                )
              else
                ...items.map(
                  (it) => Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF7F9F6),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: borderColor),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              "${it['medicine_name']} (${it['generic_name']})",
                              style: const TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: 14,
                                color: textMain,
                              ),
                            ),
                            Text(
                              "${it['dosage'] ?? '500mg'}",
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 12,
                                color: primaryGreen,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          "Sig: ${it['instructions'] ?? 'Take as directed'} • ${it['frequency'] ?? 'Daily'}",
                          style: const TextStyle(fontSize: 12, color: textSub),
                        ),
                        Text(
                          "Duration: ${it['duration_days'] ?? 3} days (Qty: ${it['quantity_dispensed'] ?? 10} pcs)",
                          style: const TextStyle(fontSize: 11.5, color: textSub),
                        ),
                      ],
                    ),
                  ),
                ),

              if (rx['notes'] != null && rx['notes'].toString().isNotEmpty) ...[
                const SizedBox(height: 10),
                Text(
                  "Doctor Dietary Notes: ${rx['notes']}",
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontStyle: FontStyle.italic,
                    color: textSub,
                  ),
                ),
              ],

                const SizedBox(height: 20),

                // Embedded Verification QR Seal & Signature
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(color: const Color(0xFFE2EBE1), borderRadius: BorderRadius.circular(18)),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
                        child: QrImageView(data: verificationUrl, version: QrVersions.auto, size: 90),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('R.A. 10173 DIGITAL SEAL', style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w800, letterSpacing: 1.2, color: primaryGreen)),
                            const SizedBox(height: 4),
                            Text("Dr. ${rx['doctor_first_name']} ${rx['doctor_last_name']}", style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: textMain)),
                            Text("PRC License: ${rx['doctor_license']}", style: const TextStyle(fontSize: 11, color: textSub)),
                            Text("Issued: ${_formatDate(rx['issued_at'])}", style: const TextStyle(fontSize: 11, color: textSub)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),

                // ── Primary action: Download signed PDF ──────────
                if (prescriptionId != null)
                  SizedBox(
                    width: double.infinity,
                    height: 46,
                    child: ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: primaryGreen,
                        foregroundColor: Colors.white,
                        elevation: 0,
                        shape: const StadiumBorder(),
                      ),
                      onPressed: _downloadingId == prescriptionId
                          ? null
                          : () => _downloadAndOpenPdf(
                                documentId: prescriptionId,
                                kind: 'prescriptions',
                              ),
                      icon: _downloadingId == prescriptionId
                          ? const SizedBox(
                              width: 16, height: 16,
                              child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                            )
                          : const Icon(Icons.download_rounded, size: 18),
                      label: Text(
                        _downloadingId == prescriptionId
                            ? 'Downloading…'
                            : 'Download Signed PDF',
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13.5),
                      ),
                    ),
                  ),
                const SizedBox(height: 10),

                // Secondary actions row
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          foregroundColor: primaryGreen,
                          side: const BorderSide(color: primaryGreen),
                          shape: const StadiumBorder(),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                        onPressed: () => launchUrl(Uri.parse(verificationUrl), mode: LaunchMode.externalApplication),
                        icon: const Icon(Icons.open_in_browser, size: 16),
                        label: const Text('Open Web Verify', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: softSage,
                          foregroundColor: primaryGreen,
                          elevation: 0,
                          shape: const StadiumBorder(),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                        onPressed: () => Navigator.pop(ctx),
                        child: const Text('Done', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // --- MODAL 2: FULL OFFICIAL MEDICAL CLEARANCE CERTIFICATE ---
  void _showClearanceCertificateModal(Map<String, dynamic> c) {
    final qrToken = c['qr_token'] ?? '';
    final verificationUrl = '${ApiConfig.baseUrl}/api/documents/verify/$qrToken';
    final clearanceId = c['clearance_id'] as int?;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => DraggableScrollableSheet(
          initialChildSize: 0.9,
          maxChildSize: 0.95,
          minChildSize: 0.5,
          builder: (_, scrollController) => Container(
            decoration: const BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 16),
            child: ListView(
              controller: scrollController,
              children: [
                Center(
                  child: Container(
                    width: 44,
                    height: 5,
                    decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(10)),
                  ),
                ),
                const SizedBox(height: 18),

                // University Letterhead
                const Center(
                  child: Column(
                    children: [
                      Text('PANGASINAN STATE UNIVERSITY', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 2.0, color: Color(0xFF4D6053))),
                      SizedBox(height: 2),
                      Text('CAMPUS INFIRMARY MEDICAL SERVICES', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: primaryGreen)),
                      Text('Lingayen Campus · Republic Act No. 10173 Official Medical Certificate', style: TextStyle(fontSize: 10.5, color: textSub)),
                    ],
                  ),
                ),
                const Divider(color: primaryGreen, height: 28, thickness: 1.5),

                const Center(
                  child: Text('OFFICIAL MEDICAL CLEARANCE', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, letterSpacing: 1.2, color: textMain)),
                ),
                const SizedBox(height: 18),

                // Certificate Body
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(color: const Color(0xFFF7F9F6), borderRadius: BorderRadius.circular(18), border: Border.all(color: borderColor)),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('TO WHOM IT MAY CONCERN:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: textMain)),
                      const SizedBox(height: 8),
                      Text(
                        "This certifies that ${c['patient_first_name'] ?? 'the student'} ${c['patient_last_name'] ?? ''} (${c['student_no'] ?? 'PSU Student'}), enrolled in ${c['course'] ?? 'PSU Lingayen'}, has undergone physical medical evaluation at the University Infirmary and is determined to be:",
                        style: const TextStyle(fontSize: 13, color: textMain, height: 1.5),
                      ),
                      const SizedBox(height: 12),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(color: const Color(0xFFE2EBE1), borderRadius: BorderRadius.circular(12)),
                        child: Text(
                          "PURPOSE: ${c['purpose'] ?? 'General Medical Clearance'}\nSTATUS: PHYSICALLY FIT",
                          style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 13, color: primaryGreen, height: 1.4),
                        ),
                      ),
                      const SizedBox(height: 10),
                      Text("Valid until: ${_formatDate(c['expires_at'])}", style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12.5, color: textMain)),
                    ],
                  ),
                ),
                const SizedBox(height: 20),

                // Verification Seal Box
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(color: const Color(0xFFE2EBE1), borderRadius: BorderRadius.circular(18)),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
                        child: QrImageView(data: verificationUrl, version: QrVersions.auto, size: 90),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('R.A. 10173 DIGITAL SEAL', style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w800, letterSpacing: 1.2, color: primaryGreen)),
                            const SizedBox(height: 4),
                            Text("Dr. ${c['doctor_first_name']} ${c['doctor_last_name']}", style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: textMain)),
                            Text("PRC License: ${c['doctor_license']}", style: const TextStyle(fontSize: 11, color: textSub)),
                            Text("Issued: ${_formatDate(c['issued_at'])}", style: const TextStyle(fontSize: 11, color: textSub)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),

                // ── Primary action: Download signed PDF ──────────
                if (clearanceId != null)
                  SizedBox(
                    width: double.infinity,
                    height: 46,
                    child: ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: primaryGreen,
                        foregroundColor: Colors.white,
                        elevation: 0,
                        shape: const StadiumBorder(),
                      ),
                      onPressed: _downloadingId == clearanceId
                          ? null
                          : () => _downloadAndOpenPdf(
                                documentId: clearanceId,
                                kind: 'clearances',
                              ),
                      icon: _downloadingId == clearanceId
                          ? const SizedBox(
                              width: 16, height: 16,
                              child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                            )
                          : const Icon(Icons.download_rounded, size: 18),
                      label: Text(
                        _downloadingId == clearanceId
                            ? 'Downloading…'
                            : 'Download Signed PDF',
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13.5),
                      ),
                    ),
                  ),
                const SizedBox(height: 10),

                // Secondary actions
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          foregroundColor: primaryGreen,
                          side: const BorderSide(color: primaryGreen),
                          shape: const StadiumBorder(),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                        onPressed: () => launchUrl(Uri.parse(verificationUrl), mode: LaunchMode.externalApplication),
                        icon: const Icon(Icons.open_in_browser, size: 16),
                        label: const Text('Open Web Verify', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: softSage,
                          foregroundColor: primaryGreen,
                          elevation: 0,
                          shape: const StadiumBorder(),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                        onPressed: () => Navigator.pop(ctx),
                        child: const Text('Done', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Header
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 8.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'YOUR RECORDS, ALL TOGETHER',
                style: TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.8,
                  color: textSub,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                'Care you can keep.',
                style: TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.w800,
                  color: textMain,
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(height: 2),
              const Text(
                'Your prescriptions, clearances, and lab imaging.',
                style: TextStyle(fontSize: 13.5, color: textSub),
              ),
              const SizedBox(height: 14),

              // 3-Way Pill Switcher
              Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: softSage,
                  borderRadius: BorderRadius.circular(24),
                ),
                child: Row(
                  children: [
                    _buildSubTabButton(index: 0, title: 'Prescriptions'),
                    _buildSubTabButton(index: 1, title: 'Clearances'),
                    _buildSubTabButton(index: 2, title: 'Lab & Imaging'),
                  ],
                ),
              ),
            ],
          ),
        ),

        Expanded(
          child: _selectedSubTab == 0
              ? _buildPrescriptionsList()
              : _selectedSubTab == 1
                  ? _buildClearancesList()
                  : _buildDiagnosticsList(),
        ),
      ],
    );
  }

  Widget _buildSubTabButton({required int index, required String title}) {
    final isSelected = _selectedSubTab == index;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _selectedSubTab = index),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 9),
          decoration: BoxDecoration(
            color: isSelected ? primaryGreen : Colors.transparent,
            borderRadius: BorderRadius.circular(20),
          ),
          alignment: Alignment.center,
          child: Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: isSelected ? Colors.white : primaryGreen,
            ),
          ),
        ),
      ),
    );
  }

  // --- SUB-VIEW 0: PRESCRIPTIONS LIST ---
  Widget _buildPrescriptionsList() {
    if (_loadingPrescriptions) {
      return const Center(child: CircularProgressIndicator(color: primaryGreen));
    }

    if (_prescriptions.isEmpty) {
      return RefreshIndicator(
        color: primaryGreen,
        onRefresh: _fetchPrescriptions,
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: const [
            SizedBox(height: 60),
            Icon(Icons.medication_outlined, size: 54, color: Color(0xFFA4B0A6)),
            SizedBox(height: 12),
            Center(
              child: Text(
                'No digital prescriptions on record.',
                style: TextStyle(color: textSub, fontSize: 14, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      color: primaryGreen,
      onRefresh: _fetchPrescriptions,
      child: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
        children: [
          ..._prescriptions.map((rx) {
            final items = rx['items'] as List<dynamic>? ?? [];
            final status = (rx['status'] ?? 'active').toString().toLowerCase();

            final firstMed = items.isNotEmpty ? items[0] : null;
            final medName = firstMed?['medicine_name'] ?? 'Prescribed medication';
            final medStrength = firstMed != null
                ? "${firstMed['generic_name']} · ${firstMed['dosage'] ?? '500 mg'}"
                : '';

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
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: const Color(0xFFEDEBF7),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(
                          Icons.medication_liquid_outlined,
                          size: 20,
                          color: Color(0xFF5B4EA1),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: status == 'active'
                              ? const Color(0xFFE5EDE4)
                              : const Color(0xFFE2EBE1),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          status.toUpperCase(),
                          style: TextStyle(
                            fontSize: 10.5,
                            fontWeight: FontWeight.w700,
                            color: status == 'active'
                                ? primaryGreen
                                : const Color(0xFF15803D),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),

                  Text(
                    medName,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: textMain,
                    ),
                  ),
                  if (medStrength.isNotEmpty)
                    Text(
                      medStrength,
                      style: const TextStyle(fontSize: 12.5, color: textSub),
                    ),
                  const SizedBox(height: 10),

                  Row(
                    children: [
                      const Icon(Icons.person_outline, size: 15, color: textSub),
                      const SizedBox(width: 6),
                      Text(
                        "Dr. ${rx['doctor_first_name']} ${rx['doctor_last_name']}",
                        style: const TextStyle(fontSize: 12, color: textSub),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(Icons.event_outlined, size: 15, color: textSub),
                      const SizedBox(width: 6),
                      Text(
                        "Issued ${_formatDate(rx['issued_at'])}",
                        style: const TextStyle(fontSize: 12, color: textSub),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  const Divider(color: borderColor, height: 1),
                  const SizedBox(height: 12),

                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      GestureDetector(
                        onTap: () => _showPrescriptionDocumentModal(rx),
                        child: const Row(
                          children: [
                            Text(
                              'View document',
                              style: TextStyle(
                                color: primaryGreen,
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            SizedBox(width: 4),
                            Icon(Icons.arrow_forward_rounded, size: 15, color: primaryGreen),
                          ],
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.description_outlined, size: 20, color: textSub),
                        onPressed: () => _showPrescriptionDocumentModal(rx),
                      ),
                    ],
                  ),
                ],
              ),
            );
          }),

          _buildSampleDisclaimer(),
          const SizedBox(height: 20),
        ],
      ),
    );
  }

  // --- SUB-VIEW 1: CLEARANCES LIST ---
  Widget _buildClearancesList() {
    if (_loadingClearances) {
      return const Center(child: CircularProgressIndicator(color: primaryGreen));
    }

    if (_clearances.isEmpty) {
      return RefreshIndicator(
        color: primaryGreen,
        onRefresh: _fetchClearances,
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: const [
            SizedBox(height: 60),
            Icon(Icons.verified_user_outlined, size: 54, color: Color(0xFFA4B0A6)),
            SizedBox(height: 12),
            Center(
              child: Text(
                'No medical clearances on record.',
                style: TextStyle(color: textSub, fontSize: 14, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      color: primaryGreen,
      onRefresh: _fetchClearances,
      child: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
        children: [
          ..._clearances.map((c) {
            final rawExpiry = c['expires_at'];
            bool isExpired = false;
            if (rawExpiry != null) {
              try {
                isExpired = DateTime.parse(rawExpiry).isBefore(DateTime.now());
              } catch (_) {}
            }

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
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF7F1E6),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(
                          Icons.description_outlined,
                          size: 20,
                          color: Color(0xFF8C6826),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: isExpired
                              ? const Color(0xFFFDE8E8)
                              : const Color(0xFFE2EBE1),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          isExpired ? 'EXPIRED' : 'APPROVED',
                          style: TextStyle(
                            fontSize: 10.5,
                            fontWeight: FontWeight.w700,
                            color: isExpired
                                ? const Color(0xFF9B1C1C)
                                : const Color(0xFF15803D),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),

                  Text(
                    c['purpose'] ?? 'Medical clearance',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: textMain,
                    ),
                  ),
                  Text(
                    "Valid until ${_formatDate(c['expires_at'])}",
                    style: const TextStyle(fontSize: 12.5, color: textSub),
                  ),
                  const SizedBox(height: 10),

                  Row(
                    children: [
                      const Icon(Icons.person_outline, size: 15, color: textSub),
                      const SizedBox(width: 6),
                      Text(
                        "Dr. ${c['doctor_first_name']} ${c['doctor_last_name']}",
                        style: const TextStyle(fontSize: 12, color: textSub),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(Icons.event_outlined, size: 15, color: textSub),
                      const SizedBox(width: 6),
                      Text(
                        "Issued ${_formatDate(c['issued_at'])}",
                        style: const TextStyle(fontSize: 12, color: textSub),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  const Divider(color: borderColor, height: 1),
                  const SizedBox(height: 12),

                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      GestureDetector(
                        onTap: () => _showClearanceCertificateModal(c),
                        child: const Row(
                          children: [
                            Text(
                              'View document',
                              style: TextStyle(
                                color: primaryGreen,
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            SizedBox(width: 4),
                            Icon(Icons.arrow_forward_rounded, size: 15, color: primaryGreen),
                          ],
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.description_outlined, size: 20, color: textSub),
                        onPressed: () => _showClearanceCertificateModal(c),
                      ),
                    ],
                  ),
                ],
              ),
            );
          }),

          _buildSampleDisclaimer(),
          const SizedBox(height: 20),
        ],
      ),
    );
  }

  // --- SUB-VIEW 2: DIAGNOSTIC & LAB ATTACHMENTS LIST ---
  Widget _buildDiagnosticsList() {
    if (_loadingDiagnostics) {
      return const Center(child: CircularProgressIndicator(color: primaryGreen));
    }

    if (_diagnosticAttachments.isEmpty) {
      return RefreshIndicator(
        color: primaryGreen,
        onRefresh: _fetchDiagnostics,
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: const [
            SizedBox(height: 60),
            Icon(Icons.biotech_outlined, size: 54, color: Color(0xFFA4B0A6)),
            SizedBox(height: 12),
            Center(
              child: Text(
                'No diagnostic reports or lab results uploaded yet.',
                style: TextStyle(color: textSub, fontSize: 14, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      color: primaryGreen,
      onRefresh: _fetchDiagnostics,
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
        itemCount: _diagnosticAttachments.length,
        itemBuilder: (context, index) {
          final doc = _diagnosticAttachments[index];
          final fileName = doc['file_name'] ?? 'Diagnostic File';
          final mime = doc['mime_type'] ?? '';
          final isPdf = mime.contains('pdf') || fileName.toLowerCase().endsWith('.pdf');
          final isImage = mime.contains('image');
          final downloadUrl = '${ApiConfig.baseUrl}/api/documents/attachments/${doc['attachment_id']}/download';

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
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: isPdf ? const Color(0xFFFDE8E8) : const Color(0xFFE0F2FE),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Icon(
                        isPdf
                            ? Icons.picture_as_pdf_outlined
                            : isImage
                                ? Icons.image_outlined
                                : Icons.description_outlined,
                        size: 20,
                        color: isPdf ? const Color(0xFF9B1C1C) : const Color(0xFF0284C7),
                      ),
                    ),
                    Text(
                      _formatDate(doc['created_at'] ?? doc['encounter_date']),
                      style: const TextStyle(
                        fontSize: 12,
                        color: textSub,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  fileName,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: textMain,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  "Uploaded by Dr. ${doc['doctor_first_name']} ${doc['doctor_last_name']} (${doc['doctor_specialty'] ?? 'Campus Physician'})",
                  style: const TextStyle(fontSize: 12, color: textSub),
                ),
                const SizedBox(height: 14),
                const Divider(color: borderColor, height: 1),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
OutlinedButton.icon(
  style: OutlinedButton.styleFrom(
    foregroundColor: primaryGreen,
    side: const BorderSide(color: primaryGreen),
    shape: const StadiumBorder(),
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
  ),
  onPressed: () async {
    // Read the stored JWT token
    final token = await _storage.read(key: 'jwt_token');
    final authenticatedUrl = '$downloadUrl?token=$token';

    launchUrl(
      Uri.parse(authenticatedUrl),
      mode: LaunchMode.externalApplication,
    );
  },
  icon: const Icon(Icons.open_in_new, size: 14),
  label: const Text(
    'Open & View File',
    style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold),
  ),
),
                    Text(
                      "${((doc['file_size'] ?? 1024) / 1024).toStringAsFixed(0)} KB",
                      style: const TextStyle(
                        fontSize: 12,
                        color: textSub,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildSampleDisclaimer() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFE2EBE1),
        borderRadius: BorderRadius.circular(20),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.verified_outlined, size: 18, color: primaryGreen),
          SizedBox(width: 10),
          Expanded(
            child: Text(
              'These are official medical records protected under R.A. 10173. For official credentials or changes to your clinical records, visit the campus infirmary.',
              style: TextStyle(fontSize: 12, color: Color(0xFF424943), height: 1.4),
            ),
          ),
        ],
      ),
    );
  }
}