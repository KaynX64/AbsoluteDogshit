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
import '../utils/responsive.dart';

class DocumentsViewerScreen extends StatefulWidget {
  const DocumentsViewerScreen({super.key});

  @override
  State<DocumentsViewerScreen> createState() => _DocumentsViewerScreenState();
}

class _DocumentsViewerScreenState extends State<DocumentsViewerScreen> {
  final _storage = const FlutterSecureStorage();

  int _selectedSubTab = 0;

  List<dynamic> _prescriptions = [];
  bool _loadingPrescriptions = false;

  List<dynamic> _clearances = [];
  bool _loadingClearances = false;

  List<dynamic> _diagnosticAttachments = [];
  bool _loadingDiagnostics = false;
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

  Future<void> _downloadAndOpenPdf({
    required int documentId,
    required String kind,
  }) async {
    if (_downloadingId != null) return;

    setState(() => _downloadingId = documentId);

    try {
      final token = await _storage.read(key: 'jwt_token');
      final url = Uri.parse(
          '${ApiConfig.baseUrl}/api/documents/$kind/$documentId/pdf');

      final res = await http.get(url, headers: {'Authorization': 'Bearer $token'});

      if (res.statusCode != 200) {
        String msg = 'Server returned ${res.statusCode}';
        try {
          final decoded = jsonDecode(res.body);
          if (decoded is Map && decoded['error'] != null) msg = decoded['error'];
        } catch (_) {}
        throw Exception(msg);
      }

      final dir = await getApplicationDocumentsDirectory();
      final fileName = kind == 'prescriptions'
          ? 'prescription-$documentId.pdf'
          : 'clearance-$documentId.pdf';
      final file = File('${dir.path}/$fileName');
      await file.writeAsBytes(res.bodyBytes, flush: true);

      if (!mounted) return;

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

  // ── MODAL 1: PRESCRIPTION ─────────────────────────────────
  void _showPrescriptionDocumentModal(Map<String, dynamic> rx) {
    final rs = Rs.of(context);
    final qrToken = rx['qr_token'] ?? '';
    final verificationUrl = '${ApiConfig.baseUrl}/api/documents/verify/$qrToken';
    final items = rx['items'] as List<dynamic>? ?? [];
    final prescriptionId = rx['prescription_id'] as int?;

    final qrSealSize = rs.w(90).clamp(76.0, 110.0);

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
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.vertical(top: Radius.circular(rs.r(28))),
            ),
            padding: EdgeInsets.symmetric(
              horizontal: rs.w(22),
              vertical: rs.h(16),
            ),
            child: ListView(
              controller: scrollController,
              children: [
                Center(
                  child: Container(
                    width: rs.w(44),
                    height: rs.h(5),
                    decoration: BoxDecoration(
                      color: Colors.grey.shade300,
                      borderRadius: BorderRadius.circular(rs.r(10)),
                    ),
                  ),
                ),
                SizedBox(height: rs.h(18)),

                // University Letterhead
                Center(
                  child: Column(
                    children: [
                      Text(
                        'PANGASINAN STATE UNIVERSITY',
                        style: TextStyle(
                          fontSize: rs.sp(11),
                          fontWeight: FontWeight.w800,
                          letterSpacing: 2.0,
                          color: const Color(0xFF4D6053),
                        ),
                        textAlign: TextAlign.center,
                      ),
                      SizedBox(height: rs.h(2)),
                      Text(
                        'CAMPUS INFIRMARY MEDICAL SERVICES',
                        style: TextStyle(
                          fontSize: rs.sp(16),
                          fontWeight: FontWeight.w900,
                          color: primaryGreen,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      Text(
                        'Lingayen Campus · Republic Act No. 10173 Verified E-Prescription',
                        style: TextStyle(fontSize: rs.sp(10.5), color: textSub),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ),
                Divider(color: primaryGreen, height: rs.h(28), thickness: 1.5),

                // Rx emblem
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      '℞',
                      style: TextStyle(
                        fontSize: rs.sp(38),
                        fontWeight: FontWeight.w900,
                        color: primaryGreen,
                        fontFamily: 'serif',
                      ),
                    ),
                    Flexible(
                      child: Text(
                        'OFFICIAL DIGITAL PRESCRIPTION',
                        style: TextStyle(
                          fontSize: rs.sp(12),
                          fontWeight: FontWeight.bold,
                          letterSpacing: 1.0,
                          color: textSub,
                        ),
                        textAlign: TextAlign.end,
                      ),
                    ),
                  ],
                ),
                SizedBox(height: rs.h(10)),

                Text(
                  'PRESCRIBED FORMULARY MEDICATION:',
                  style: TextStyle(
                    fontSize: rs.sp(11),
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.0,
                    color: textSub,
                  ),
                ),
                SizedBox(height: rs.h(8)),
                if (items.isEmpty)
                  Text(
                    'No line items recorded.',
                    style: TextStyle(
                      fontSize: rs.sp(13),
                      fontStyle: FontStyle.italic,
                      color: textSub,
                    ),
                  )
                else
                  ...items.map(
                    (it) => Container(
                      margin: EdgeInsets.only(bottom: rs.h(8)),
                      padding: EdgeInsets.all(rs.w(12)),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF7F9F6),
                        borderRadius: BorderRadius.circular(rs.r(14)),
                        border: Border.all(color: borderColor),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Expanded(
                                child: Text(
                                  "${it['medicine_name']} (${it['generic_name']})",
                                  style: TextStyle(
                                    fontWeight: FontWeight.w800,
                                    fontSize: rs.sp(14),
                                    color: textMain,
                                  ),
                                ),
                              ),
                              SizedBox(width: rs.w(6)),
                              Text(
                                "${it['dosage'] ?? '500mg'}",
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: rs.sp(12),
                                  color: primaryGreen,
                                ),
                              ),
                            ],
                          ),
                          SizedBox(height: rs.h(4)),
                          Text(
                            "Sig: ${it['instructions'] ?? 'Take as directed'} • ${it['frequency'] ?? 'Daily'}",
                            style: TextStyle(fontSize: rs.sp(12), color: textSub),
                          ),
                          Text(
                            "Duration: ${it['duration_days'] ?? 3} days (Qty: ${it['quantity_dispensed'] ?? 10} pcs)",
                            style: TextStyle(fontSize: rs.sp(11.5), color: textSub),
                          ),
                        ],
                      ),
                    ),
                  ),

                if (rx['notes'] != null && rx['notes'].toString().isNotEmpty) ...[
                  SizedBox(height: rs.h(10)),
                  Text(
                    "Doctor Dietary Notes: ${rx['notes']}",
                    style: TextStyle(
                      fontSize: rs.sp(12.5),
                      fontStyle: FontStyle.italic,
                      color: textSub,
                    ),
                  ),
                ],

                SizedBox(height: rs.h(20)),

                // Verification QR Seal
                Container(
                  padding: EdgeInsets.all(rs.w(14)),
                  decoration: BoxDecoration(
                    color: const Color(0xFFE2EBE1),
                    borderRadius: BorderRadius.circular(rs.r(18)),
                  ),
                  child: Row(
                    children: [
                      Container(
                        padding: EdgeInsets.all(rs.w(8)),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(rs.r(12)),
                        ),
                        child: QrImageView(
                          data: verificationUrl,
                          version: QrVersions.auto,
                          size: qrSealSize,
                        ),
                      ),
                      SizedBox(width: rs.w(14)),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'R.A. 10173 DIGITAL SEAL',
                              style: TextStyle(
                                fontSize: rs.sp(9.5),
                                fontWeight: FontWeight.w800,
                                letterSpacing: 1.2,
                                color: primaryGreen,
                              ),
                            ),
                            SizedBox(height: rs.h(4)),
                            Text(
                              "Dr. ${rx['doctor_first_name']} ${rx['doctor_last_name']}",
                              style: TextStyle(
                                fontSize: rs.sp(13),
                                fontWeight: FontWeight.bold,
                                color: textMain,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(
                              "PRC License: ${rx['doctor_license']}",
                              style: TextStyle(fontSize: rs.sp(11), color: textSub),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(
                              "Issued: ${_formatDate(rx['issued_at'])}",
                              style: TextStyle(fontSize: rs.sp(11), color: textSub),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                SizedBox(height: rs.h(20)),

                // ── Primary action: Download signed PDF ──────────
                if (prescriptionId != null)
                  SizedBox(
                    width: double.infinity,
                    height: rs.h(46).clamp(42.0, 52.0),
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
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(
                                color: Colors.white,
                                strokeWidth: 2,
                              ),
                            )
                          : const Icon(Icons.download_rounded, size: 18),
                      label: Text(
                        _downloadingId == prescriptionId
                            ? 'Downloading…'
                            : 'Download Signed PDF',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: rs.sp(13.5),
                        ),
                      ),
                    ),
                  ),
                SizedBox(height: rs.h(10)),

                // Single full-width Done button. The "Open Web Verify"
                // button was removed because the patient already sees the
                // full document in this modal, and the public /verify route
                // deliberately hides the medicine list. External verifiers
                // (pharmacies, deans) can still scan the QR on the printed
                // PDF — that opens the public route directly.
                SizedBox(
                  width: double.infinity,
                  height: rs.h(46).clamp(42.0, 52.0),
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: softSage,
                      foregroundColor: primaryGreen,
                      elevation: 0,
                      shape: const StadiumBorder(),
                    ),
                    onPressed: () => Navigator.pop(ctx),
                    child: Text(
                      'Done',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: rs.sp(13.5),
                      ),
                    ),
                  ),
                ),
                SizedBox(height: rs.h(12)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ── MODAL 2: CLEARANCE ─────────────────────────────────────
  void _showClearanceCertificateModal(Map<String, dynamic> c) {
    final rs = Rs.of(context);
    final qrToken = c['qr_token'] ?? '';
    final verificationUrl = '${ApiConfig.baseUrl}/api/documents/verify/$qrToken';
    final clearanceId = c['clearance_id'] as int?;

    final qrSealSize = rs.w(90).clamp(76.0, 110.0);

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
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.vertical(top: Radius.circular(rs.r(28))),
            ),
            padding: EdgeInsets.symmetric(
              horizontal: rs.w(22),
              vertical: rs.h(16),
            ),
            child: ListView(
              controller: scrollController,
              children: [
                Center(
                  child: Container(
                    width: rs.w(44),
                    height: rs.h(5),
                    decoration: BoxDecoration(
                      color: Colors.grey.shade300,
                      borderRadius: BorderRadius.circular(rs.r(10)),
                    ),
                  ),
                ),
                SizedBox(height: rs.h(18)),

                Center(
                  child: Column(
                    children: [
                      Text(
                        'PANGASINAN STATE UNIVERSITY',
                        style: TextStyle(
                          fontSize: rs.sp(11),
                          fontWeight: FontWeight.w800,
                          letterSpacing: 2.0,
                          color: const Color(0xFF4D6053),
                        ),
                        textAlign: TextAlign.center,
                      ),
                      SizedBox(height: rs.h(2)),
                      Text(
                        'CAMPUS INFIRMARY MEDICAL SERVICES',
                        style: TextStyle(
                          fontSize: rs.sp(16),
                          fontWeight: FontWeight.w900,
                          color: primaryGreen,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      Text(
                        'Lingayen Campus · Republic Act No. 10173 Official Medical Certificate',
                        style: TextStyle(fontSize: rs.sp(10.5), color: textSub),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ),
                Divider(color: primaryGreen, height: rs.h(28), thickness: 1.5),

                Center(
                  child: Text(
                    'OFFICIAL MEDICAL CLEARANCE',
                    style: TextStyle(
                      fontSize: rs.sp(16),
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.2,
                      color: textMain,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ),
                SizedBox(height: rs.h(18)),

                Container(
                  padding: EdgeInsets.all(rs.w(16)),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF7F9F6),
                    borderRadius: BorderRadius.circular(rs.r(18)),
                    border: Border.all(color: borderColor),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'TO WHOM IT MAY CONCERN:',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: rs.sp(13),
                          color: textMain,
                        ),
                      ),
                      SizedBox(height: rs.h(8)),
                      Text(
                        "This certifies that ${c['patient_first_name'] ?? 'the student'} ${c['patient_last_name'] ?? ''} (${c['student_no'] ?? 'PSU Student'}), enrolled in ${c['course'] ?? 'PSU Lingayen'}, has undergone physical medical evaluation at the University Infirmary and is determined to be:",
                        style: TextStyle(
                          fontSize: rs.sp(13),
                          color: textMain,
                          height: 1.5,
                        ),
                      ),
                      SizedBox(height: rs.h(12)),
                      Container(
                        width: double.infinity,
                        padding: EdgeInsets.all(rs.w(12)),
                        decoration: BoxDecoration(
                          color: const Color(0xFFE2EBE1),
                          borderRadius: BorderRadius.circular(rs.r(12)),
                        ),
                        child: Text(
                          "PURPOSE: ${c['purpose'] ?? 'General Medical Clearance'}\nSTATUS: PHYSICALLY FIT",
                          style: TextStyle(
                            fontWeight: FontWeight.w900,
                            fontSize: rs.sp(13),
                            color: primaryGreen,
                            height: 1.4,
                          ),
                        ),
                      ),
                      SizedBox(height: rs.h(10)),
                      Text(
                        "Valid until: ${_formatDate(c['expires_at'])}",
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: rs.sp(12.5),
                          color: textMain,
                        ),
                      ),
                    ],
                  ),
                ),
                SizedBox(height: rs.h(20)),

                Container(
                  padding: EdgeInsets.all(rs.w(14)),
                  decoration: BoxDecoration(
                    color: const Color(0xFFE2EBE1),
                    borderRadius: BorderRadius.circular(rs.r(18)),
                  ),
                  child: Row(
                    children: [
                      Container(
                        padding: EdgeInsets.all(rs.w(8)),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(rs.r(12)),
                        ),
                        child: QrImageView(
                          data: verificationUrl,
                          version: QrVersions.auto,
                          size: qrSealSize,
                        ),
                      ),
                      SizedBox(width: rs.w(14)),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'R.A. 10173 DIGITAL SEAL',
                              style: TextStyle(
                                fontSize: rs.sp(9.5),
                                fontWeight: FontWeight.w800,
                                letterSpacing: 1.2,
                                color: primaryGreen,
                              ),
                            ),
                            SizedBox(height: rs.h(4)),
                            Text(
                              "Dr. ${c['doctor_first_name']} ${c['doctor_last_name']}",
                              style: TextStyle(
                                fontSize: rs.sp(13),
                                fontWeight: FontWeight.bold,
                                color: textMain,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(
                              "PRC License: ${c['doctor_license']}",
                              style: TextStyle(fontSize: rs.sp(11), color: textSub),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(
                              "Issued: ${_formatDate(c['issued_at'])}",
                              style: TextStyle(fontSize: rs.sp(11), color: textSub),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                SizedBox(height: rs.h(20)),

                // ── Primary action: Download signed PDF ──────────
                if (clearanceId != null)
                  SizedBox(
                    width: double.infinity,
                    height: rs.h(46).clamp(42.0, 52.0),
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
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(
                                color: Colors.white,
                                strokeWidth: 2,
                              ),
                            )
                          : const Icon(Icons.download_rounded, size: 18),
                      label: Text(
                        _downloadingId == clearanceId
                            ? 'Downloading…'
                            : 'Download Signed PDF',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: rs.sp(13.5),
                        ),
                      ),
                    ),
                  ),
                SizedBox(height: rs.h(10)),

                // Single full-width Done button. See note in the prescription
                // modal for why "Open Web Verify" was removed.
                SizedBox(
                  width: double.infinity,
                  height: rs.h(46).clamp(42.0, 52.0),
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: softSage,
                      foregroundColor: primaryGreen,
                      elevation: 0,
                      shape: const StadiumBorder(),
                    ),
                    onPressed: () => Navigator.pop(ctx),
                    child: Text(
                      'Done',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: rs.sp(13.5),
                      ),
                    ),
                  ),
                ),
                SizedBox(height: rs.h(12)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final rs = Rs.of(context);
    final maxContentWidth = rs.isTablet ? 640.0 : double.infinity;

    return Center(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxContentWidth),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: EdgeInsets.symmetric(
                horizontal: rs.w(20),
                vertical: rs.h(8),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'YOUR RECORDS, ALL TOGETHER',
                    style: TextStyle(
                      fontSize: rs.sp(10.5),
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1.8,
                      color: textSub,
                    ),
                  ),
                  SizedBox(height: rs.h(4)),
                  Text(
                    'Care you can keep.',
                    style: TextStyle(
                      fontSize: rs.sp(28),
                      fontWeight: FontWeight.w800,
                      color: textMain,
                      letterSpacing: -0.5,
                    ),
                  ),
                  SizedBox(height: rs.h(2)),
                  Text(
                    'Your prescriptions, clearances, and lab imaging.',
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
                        _buildSubTabButton(rs: rs, index: 0, title: 'Prescriptions'),
                        _buildSubTabButton(rs: rs, index: 1, title: 'Clearances'),
                        _buildSubTabButton(rs: rs, index: 2, title: 'Lab & Imaging'),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            Expanded(
              child: _selectedSubTab == 0
                  ? _buildPrescriptionsList(rs)
                  : _selectedSubTab == 1
                      ? _buildClearancesList(rs)
                      : _buildDiagnosticsList(rs),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSubTabButton({
    required Rs rs,
    required int index,
    required String title,
  }) {
    final isSelected = _selectedSubTab == index;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _selectedSubTab = index),
        child: Container(
          padding: EdgeInsets.symmetric(vertical: rs.h(9)),
          decoration: BoxDecoration(
            color: isSelected ? primaryGreen : Colors.transparent,
            borderRadius: BorderRadius.circular(rs.r(20)),
          ),
          alignment: Alignment.center,
          child: Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: rs.sp(12),
              fontWeight: FontWeight.w700,
              color: isSelected ? Colors.white : primaryGreen,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildPrescriptionsList(Rs rs) {
    if (_loadingPrescriptions) {
      return const Center(child: CircularProgressIndicator(color: primaryGreen));
    }

    if (_prescriptions.isEmpty) {
      return RefreshIndicator(
        color: primaryGreen,
        onRefresh: _fetchPrescriptions,
        child: ListView(
          padding: EdgeInsets.all(rs.w(24)),
          children: [
            SizedBox(height: rs.h(60)),
            Icon(
              Icons.medication_outlined,
              size: rs.w(54).clamp(44.0, 60.0),
              color: const Color(0xFFA4B0A6),
            ),
            SizedBox(height: rs.h(12)),
            Center(
              child: Text(
                'No digital prescriptions on record.',
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
      onRefresh: _fetchPrescriptions,
      child: ListView(
        padding: EdgeInsets.symmetric(
          horizontal: rs.w(20),
          vertical: rs.h(8),
        ),
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
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Container(
                        padding: EdgeInsets.all(rs.w(8)),
                        decoration: BoxDecoration(
                          color: const Color(0xFFEDEBF7),
                          borderRadius: BorderRadius.circular(rs.r(10)),
                        ),
                        child: Icon(
                          Icons.medication_liquid_outlined,
                          size: rs.w(20),
                          color: const Color(0xFF5B4EA1),
                        ),
                      ),
                      Container(
                        padding: EdgeInsets.symmetric(
                          horizontal: rs.w(10),
                          vertical: rs.h(4),
                        ),
                        decoration: BoxDecoration(
                          color: status == 'active'
                              ? const Color(0xFFE5EDE4)
                              : const Color(0xFFE2EBE1),
                          borderRadius: BorderRadius.circular(rs.r(12)),
                        ),
                        child: Text(
                          status.toUpperCase(),
                          style: TextStyle(
                            fontSize: rs.sp(10.5),
                            fontWeight: FontWeight.w700,
                            color: status == 'active'
                                ? primaryGreen
                                : const Color(0xFF15803D),
                          ),
                        ),
                      ),
                    ],
                  ),
                  SizedBox(height: rs.h(14)),

                  Text(
                    medName,
                    style: TextStyle(
                      fontSize: rs.sp(18),
                      fontWeight: FontWeight.w800,
                      color: textMain,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (medStrength.isNotEmpty)
                    Text(
                      medStrength,
                      style: TextStyle(fontSize: rs.sp(12.5), color: textSub),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  SizedBox(height: rs.h(10)),

                  Row(
                    children: [
                      Icon(Icons.person_outline, size: rs.w(15), color: textSub),
                      SizedBox(width: rs.w(6)),
                      Expanded(
                        child: Text(
                          "Dr. ${rx['doctor_first_name']} ${rx['doctor_last_name']}",
                          style: TextStyle(fontSize: rs.sp(12), color: textSub),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  SizedBox(height: rs.h(4)),
                  Row(
                    children: [
                      Icon(Icons.event_outlined, size: rs.w(15), color: textSub),
                      SizedBox(width: rs.w(6)),
                      Expanded(
                        child: Text(
                          "Issued ${_formatDate(rx['issued_at'])}",
                          style: TextStyle(fontSize: rs.sp(12), color: textSub),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  SizedBox(height: rs.h(14)),
                  const Divider(color: borderColor, height: 1),
                  SizedBox(height: rs.h(12)),

                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      GestureDetector(
                        onTap: () => _showPrescriptionDocumentModal(rx),
                        child: Row(
                          children: [
                            Text(
                              'View document',
                              style: TextStyle(
                                color: primaryGreen,
                                fontSize: rs.sp(13),
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            SizedBox(width: rs.w(4)),
                            const Icon(
                              Icons.arrow_forward_rounded,
                              size: 15,
                              color: primaryGreen,
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        icon: Icon(
                          Icons.description_outlined,
                          size: rs.w(20),
                          color: textSub,
                        ),
                        onPressed: () => _showPrescriptionDocumentModal(rx),
                      ),
                    ],
                  ),
                ],
              ),
            );
          }),

          _buildSampleDisclaimer(rs),
          SizedBox(height: rs.h(20)),
        ],
      ),
    );
  }

  Widget _buildClearancesList(Rs rs) {
    if (_loadingClearances) {
      return const Center(child: CircularProgressIndicator(color: primaryGreen));
    }

    if (_clearances.isEmpty) {
      return RefreshIndicator(
        color: primaryGreen,
        onRefresh: _fetchClearances,
        child: ListView(
          padding: EdgeInsets.all(rs.w(24)),
          children: [
            SizedBox(height: rs.h(60)),
            Icon(
              Icons.verified_user_outlined,
              size: rs.w(54).clamp(44.0, 60.0),
              color: const Color(0xFFA4B0A6),
            ),
            SizedBox(height: rs.h(12)),
            Center(
              child: Text(
                'No medical clearances on record.',
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
      onRefresh: _fetchClearances,
      child: ListView(
        padding: EdgeInsets.symmetric(
          horizontal: rs.w(20),
          vertical: rs.h(8),
        ),
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
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Container(
                        padding: EdgeInsets.all(rs.w(8)),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF7F1E6),
                          borderRadius: BorderRadius.circular(rs.r(10)),
                        ),
                        child: Icon(
                          Icons.description_outlined,
                          size: rs.w(20),
                          color: const Color(0xFF8C6826),
                        ),
                      ),
                      Container(
                        padding: EdgeInsets.symmetric(
                          horizontal: rs.w(10),
                          vertical: rs.h(4),
                        ),
                        decoration: BoxDecoration(
                          color: isExpired
                              ? const Color(0xFFFDE8E8)
                              : const Color(0xFFE2EBE1),
                          borderRadius: BorderRadius.circular(rs.r(12)),
                        ),
                        child: Text(
                          isExpired ? 'EXPIRED' : 'APPROVED',
                          style: TextStyle(
                            fontSize: rs.sp(10.5),
                            fontWeight: FontWeight.w700,
                            color: isExpired
                                ? const Color(0xFF9B1C1C)
                                : const Color(0xFF15803D),
                          ),
                        ),
                      ),
                    ],
                  ),
                  SizedBox(height: rs.h(14)),

                  Text(
                    c['purpose'] ?? 'Medical clearance',
                    style: TextStyle(
                      fontSize: rs.sp(18),
                      fontWeight: FontWeight.w800,
                      color: textMain,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  Text(
                    "Valid until ${_formatDate(c['expires_at'])}",
                    style: TextStyle(fontSize: rs.sp(12.5), color: textSub),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  SizedBox(height: rs.h(10)),

                  Row(
                    children: [
                      Icon(Icons.person_outline, size: rs.w(15), color: textSub),
                      SizedBox(width: rs.w(6)),
                      Expanded(
                        child: Text(
                          "Dr. ${c['doctor_first_name']} ${c['doctor_last_name']}",
                          style: TextStyle(fontSize: rs.sp(12), color: textSub),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  SizedBox(height: rs.h(4)),
                  Row(
                    children: [
                      Icon(Icons.event_outlined, size: rs.w(15), color: textSub),
                      SizedBox(width: rs.w(6)),
                      Expanded(
                        child: Text(
                          "Issued ${_formatDate(c['issued_at'])}",
                          style: TextStyle(fontSize: rs.sp(12), color: textSub),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  SizedBox(height: rs.h(14)),
                  const Divider(color: borderColor, height: 1),
                  SizedBox(height: rs.h(12)),

                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      GestureDetector(
                        onTap: () => _showClearanceCertificateModal(c),
                        child: Row(
                          children: [
                            Text(
                              'View document',
                              style: TextStyle(
                                color: primaryGreen,
                                fontSize: rs.sp(13),
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            SizedBox(width: rs.w(4)),
                            const Icon(
                              Icons.arrow_forward_rounded,
                              size: 15,
                              color: primaryGreen,
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        icon: Icon(
                          Icons.description_outlined,
                          size: rs.w(20),
                          color: textSub,
                        ),
                        onPressed: () => _showClearanceCertificateModal(c),
                      ),
                    ],
                  ),
                ],
              ),
            );
          }),

          _buildSampleDisclaimer(rs),
          SizedBox(height: rs.h(20)),
        ],
      ),
    );
  }

  Widget _buildDiagnosticsList(Rs rs) {
    if (_loadingDiagnostics) {
      return const Center(child: CircularProgressIndicator(color: primaryGreen));
    }

    if (_diagnosticAttachments.isEmpty) {
      return RefreshIndicator(
        color: primaryGreen,
        onRefresh: _fetchDiagnostics,
        child: ListView(
          padding: EdgeInsets.all(rs.w(24)),
          children: [
            SizedBox(height: rs.h(60)),
            Icon(
              Icons.biotech_outlined,
              size: rs.w(54).clamp(44.0, 60.0),
              color: const Color(0xFFA4B0A6),
            ),
            SizedBox(height: rs.h(12)),
            Center(
              child: Text(
                'No diagnostic reports or lab results uploaded yet.',
                style: TextStyle(
                  color: textSub,
                  fontSize: rs.sp(14),
                  fontWeight: FontWeight.w600,
                ),
                textAlign: TextAlign.center,
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
        padding: EdgeInsets.symmetric(
          horizontal: rs.w(20),
          vertical: rs.h(8),
        ),
        itemCount: _diagnosticAttachments.length,
        itemBuilder: (context, index) {
          final doc = _diagnosticAttachments[index];
          final fileName = doc['file_name'] ?? 'Diagnostic File';
          final mime = doc['mime_type'] ?? '';
          final isPdf = mime.contains('pdf') ||
              fileName.toLowerCase().endsWith('.pdf');
          final isImage = mime.contains('image');
          final downloadUrl =
              '${ApiConfig.baseUrl}/api/documents/attachments/${doc['attachment_id']}/download';

          return Container(
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
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Container(
                      padding: EdgeInsets.all(rs.w(8)),
                      decoration: BoxDecoration(
                        color: isPdf
                            ? const Color(0xFFFDE8E8)
                            : const Color(0xFFE0F2FE),
                        borderRadius: BorderRadius.circular(rs.r(10)),
                      ),
                      child: Icon(
                        isPdf
                            ? Icons.picture_as_pdf_outlined
                            : isImage
                                ? Icons.image_outlined
                                : Icons.description_outlined,
                        size: rs.w(20),
                        color: isPdf
                            ? const Color(0xFF9B1C1C)
                            : const Color(0xFF0284C7),
                      ),
                    ),
                    Flexible(
                      child: Text(
                        _formatDate(doc['created_at'] ?? doc['encounter_date']),
                        style: TextStyle(
                          fontSize: rs.sp(12),
                          color: textSub,
                          fontWeight: FontWeight.bold,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.end,
                      ),
                    ),
                  ],
                ),
                SizedBox(height: rs.h(12)),
                Text(
                  fileName,
                  style: TextStyle(
                    fontSize: rs.sp(16),
                    fontWeight: FontWeight.w800,
                    color: textMain,
                  ),
                ),
                SizedBox(height: rs.h(4)),
                Text(
                  "Uploaded by Dr. ${doc['doctor_first_name']} ${doc['doctor_last_name']} (${doc['doctor_specialty'] ?? 'Campus Physician'})",
                  style: TextStyle(fontSize: rs.sp(12), color: textSub),
                ),
                SizedBox(height: rs.h(14)),
                const Divider(color: borderColor, height: 1),
                SizedBox(height: rs.h(12)),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: primaryGreen,
                        side: const BorderSide(color: primaryGreen),
                        shape: const StadiumBorder(),
                        padding: EdgeInsets.symmetric(
                          horizontal: rs.w(16),
                          vertical: rs.h(8),
                        ),
                      ),
                      onPressed: () async {
                        final token = await _storage.read(key: 'jwt_token');
                        final authenticatedUrl = '$downloadUrl?token=$token';

                        launchUrl(
                          Uri.parse(authenticatedUrl),
                          mode: LaunchMode.externalApplication,
                        );
                      },
                      icon: const Icon(Icons.open_in_new, size: 14),
                      label: Text(
                        'Open & View File',
                        style: TextStyle(
                          fontSize: rs.sp(12.5),
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    Text(
                      "${((doc['file_size'] ?? 1024) / 1024).toStringAsFixed(0)} KB",
                      style: TextStyle(
                        fontSize: rs.sp(12),
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

  Widget _buildSampleDisclaimer(Rs rs) {
    return Container(
      padding: EdgeInsets.all(rs.w(16)),
      decoration: BoxDecoration(
        color: const Color(0xFFE2EBE1),
        borderRadius: BorderRadius.circular(rs.r(20)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            Icons.verified_outlined,
            size: rs.w(18),
            color: primaryGreen,
          ),
          SizedBox(width: rs.w(10)),
          Expanded(
            child: Text(
              'These are official medical records protected under R.A. 10173. For official credentials or changes to your clinical records, visit the campus infirmary.',
              style: TextStyle(
                fontSize: rs.sp(12),
                color: const Color(0xFF424943),
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}