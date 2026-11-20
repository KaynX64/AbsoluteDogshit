// mobile/lib/screens/documents_viewer_screen.dart
import 'dart:convert';

import '../models/prescription_item.dart';

import '../services/mobile_session_data.dart';
import '../services/document_download.dart';
import '../widgets/lazy_card_columns.dart';

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import '../theme/app_palette.dart';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path_provider/path_provider.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:open_filex/open_filex.dart';

import '../config/api_config.dart';
import '../utils/responsive.dart';

class DocumentsViewerScreen extends StatefulWidget {
  const DocumentsViewerScreen({super.key, this.client});
  final http.Client? client;

  @override
  State<DocumentsViewerScreen> createState() => _DocumentsViewerScreenState();
}

class _DocumentsViewerScreenState extends State<DocumentsViewerScreen> {
  final _storage = const FlutterSecureStorage();
  http.Client get _client => widget.client ?? ApiConfig.client;

  int _selectedSubTab = 0;
  bool _isGridView = false;

  List<dynamic> _prescriptions = [];
  bool _loadingPrescriptions = false;

  List<dynamic> _clearances = [];
  bool _loadingClearances = false;

  List<dynamic> _diagnosticAttachments = [];
  bool _loadingDiagnostics = false;
  int? _downloadingId;

  Color get primaryGreen => AppPalette.of(context).color(0xFF284E3A);
  Color get softSage => AppPalette.of(context).color(0xFFE5EDE4);
  Color get textMain => AppPalette.of(context).color(0xFF191C1A);
  Color get textSub => AppPalette.of(context).color(0xFF5A635B);
  Color get borderColor => AppPalette.of(context).color(0xFFE2EBE2);

  final _data = MobileSessionData.instance;
  late final int _generation;

  @override
  void initState() {
    super.initState();
    _generation = _data.generation;
    _selectedSubTab = _data.documentsState['tab'] as int? ?? 0;
    _isGridView = _data.documentsState['grid'] as bool? ?? false;
    _loadSelected();
  }

  @override
  void dispose() {
    if (_data.isCurrent(_generation)) {
      _data.documentsState.addAll({
        'tab': _selectedSubTab,
        'grid': _isGridView,
      });
    }
    super.dispose();
  }

  void _loadSelected() {
    switch (_selectedSubTab) {
      case 1:
        _fetchClearances(force: false);
      case 2:
        _fetchDiagnostics(force: false);
      default:
        _fetchPrescriptions(force: false);
    }
  }

  Future<void> _fetchPrescriptions({bool force = true}) async {
    if (!mounted) return;
    final cached = force ? null : _data.peek('/api/documents/prescriptions/my');
    if (cached is List && _data.isCurrent(_generation)) {
      setState(() => _prescriptions = cached);
      return;
    }
    setState(() => _loadingPrescriptions = true);
    try {
      final token = await _storage.read(key: 'jwt_token');
      if (!mounted || !_data.isCurrent(_generation)) return;
      final value = await _data.get(
        '/api/documents/prescriptions/my',
        token,
        force: force,
        client: _client,
      );
      if (mounted && _data.isCurrent(_generation)) {
        setState(() => _prescriptions = value as List<dynamic>);
      }
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loadingPrescriptions = false);
    }
  }

  Future<void> _fetchClearances({bool force = true}) async {
    if (!mounted) return;
    final cached = force ? null : _data.peek('/api/documents/clearances/my');
    if (cached is List && _data.isCurrent(_generation)) {
      setState(() => _clearances = cached);
      return;
    }
    setState(() => _loadingClearances = true);
    try {
      final token = await _storage.read(key: 'jwt_token');
      if (!mounted || !_data.isCurrent(_generation)) return;
      final value = await _data.get(
        '/api/documents/clearances/my',
        token,
        force: force,
        client: _client,
      );
      if (mounted && _data.isCurrent(_generation)) {
        setState(() => _clearances = value as List<dynamic>);
      }
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loadingClearances = false);
    }
  }

  Future<void> _fetchDiagnostics({bool force = true}) async {
    if (!mounted) return;
    final cached = force ? null : _data.peek('/api/documents/attachments/my');
    if (cached is List && _data.isCurrent(_generation)) {
      setState(() => _diagnosticAttachments = cached);
      return;
    }
    setState(() => _loadingDiagnostics = true);
    try {
      final token = await _storage.read(key: 'jwt_token');
      if (!mounted || !_data.isCurrent(_generation)) return;
      final value = await _data.get(
        '/api/documents/attachments/my',
        token,
        force: force,
        client: _client,
      );
      if (mounted && _data.isCurrent(_generation)) {
        setState(() => _diagnosticAttachments = value as List<dynamic>);
      }
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loadingDiagnostics = false);
    }
  }

  String _formatDate(String? rawDate, {bool compact = false}) {
    if (rawDate == null || rawDate.isEmpty) return 'N/A';
    try {
      final dt = DateTime.parse(rawDate).toLocal();
      if (compact) {
        final month = dt.month.toString().padLeft(2, '0');
        final day = dt.day.toString().padLeft(2, '0');
        return '$month/$day/${dt.year}';
      }
      const months = [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
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
        '${ApiConfig.baseUrl}/api/documents/$kind/$documentId/pdf',
      );

      final dir = await getApplicationDocumentsDirectory();
      final fileName = kind == 'prescriptions'
          ? 'prescription-$documentId.pdf'
          : 'clearance-$documentId.pdf';
      final file = File('${dir.path}/$fileName');
      await downloadDocument(
        client: _client,
        url: url,
        token: token,
        destination: file,
      );

      if (!mounted || !_data.isCurrent(_generation)) return;

      final result = await OpenFilex.open(file.path);
      if (result.type != ResultType.done && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Saved to ${file.path}\nCould not open automatically.',
            ),
            backgroundColor: primaryGreen,
            duration: const Duration(seconds: 5),
          ),
        );
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('✅ PDF downloaded and opened.'),
            backgroundColor: primaryGreen,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Download failed: $e'),
            backgroundColor: AppPalette.of(context).background(0xFF7A2E26),
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
    final verificationUrl =
        '${ApiConfig.baseUrl}/api/documents/verify/$qrToken';
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
              color: AppPalette.of(context).surface,
              borderRadius: BorderRadius.vertical(
                top: Radius.circular(rs.r(28)),
              ),
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
                          color: AppPalette.of(context).color(0xFF4D6053),
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
                        'Lingayen Campus · Digital Prescription',
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
                  items.any(
                        (it) =>
                            (it['is_outside'] == true || it['is_outside'] == 1),
                      )
                      ? 'PRESCRIBED MEDICATION (INCLUDES OUTSIDE-PHARMACY ITEMS):'
                      : 'PRESCRIBED FORMULARY MEDICATION:',
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
                        color: AppPalette.of(context).color(0xFFF7F9F6),
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
                                  PrescriptionItemView(it).name,
                                  style: TextStyle(
                                    fontWeight: FontWeight.w800,
                                    fontSize: rs.sp(14),
                                    color: textMain,
                                  ),
                                ),
                              ),
                              SizedBox(width: rs.w(6)),
                              Text(
                                PrescriptionItemView.recorded(it['dosage']),
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: rs.sp(12),
                                  color: primaryGreen,
                                ),
                              ),
                            ],
                          ),
                          SizedBox(height: rs.h(4)),
                          if (PrescriptionItemView(it).structured)
                            Text(
                              PrescriptionItemView(it).preparation,
                              style: TextStyle(
                                fontSize: rs.sp(12),
                                color: textSub,
                              ),
                            ),
                          Text(
                            '${PrescriptionItemView(it).administration}\n${PrescriptionItemView(it).schedule}\n${PrescriptionItemView(it).directions}',
                            style: TextStyle(
                              fontSize: rs.sp(12),
                              color: textSub,
                            ),
                          ),
                          Text(
                            '${PrescriptionItemView(it).course}\n${PrescriptionItemView(it).supply}',
                            style: TextStyle(
                              fontSize: rs.sp(11.5),
                              color: textSub,
                            ),
                          ),
                          if ((it['is_outside'] == true ||
                              it['is_outside'] == 1))
                            Padding(
                              padding: EdgeInsets.only(top: rs.h(4)),
                              child: Text(
                                'External pharmacy — not dispensed by the infirmary',
                                style: TextStyle(
                                  fontSize: rs.sp(11),
                                  fontWeight: FontWeight.w700,
                                  color: AppPalette.of(context)
                                      .color(0xFF8C6826),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),

                if (rx['notes'] != null &&
                    rx['notes'].toString().isNotEmpty) ...[
                  SizedBox(height: rs.h(10)),
                  Text(
                    "${rx['contract_version'] == 2 ? 'Patient advice — printed on prescription' : 'Recorded prescription notes'}: ${rx['notes']}",
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
                    color: AppPalette.of(context).color(0xFFE2EBE1),
                    borderRadius: BorderRadius.circular(rs.r(18)),
                  ),
                  child: Row(
                    children: [
                      Container(
                        padding: EdgeInsets.all(rs.w(8)),
                        decoration: BoxDecoration(
                          color: AppPalette.of(context).surface,
                          borderRadius: BorderRadius.circular(rs.r(12)),
                        ),
                        child: QrImageView(
                          data: verificationUrl,
                          version: QrVersions.auto,
                          size: qrSealSize,
                          backgroundColor: Colors.white,
                        ),
                      ),
                      SizedBox(width: rs.w(14)),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'PRESCRIPTION RECORD VERIFICATION',
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
                              style: TextStyle(
                                fontSize: rs.sp(11),
                                color: textSub,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(
                              "Issued: ${_formatDate(rx['issued_at'])}",
                              style: TextStyle(
                                fontSize: rs.sp(11),
                                color: textSub,
                              ),
                            ),
                            if (rx['expires_at'] != null)
                              Text(
                                "Valid until: ${_formatDate(rx['expires_at'])}",
                                style: TextStyle(
                                  fontSize: rs.sp(11),
                                  fontWeight: FontWeight.w600,
                                  color: textSub,
                                ),
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
                        foregroundColor: AppPalette.of(context).onPrimary,
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
                          ? SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(
                                color: AppPalette.of(context).onPrimary,
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
    final verificationUrl =
        '${ApiConfig.baseUrl}/api/documents/verify/$qrToken';
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
              color: AppPalette.of(context).surface,
              borderRadius: BorderRadius.vertical(
                top: Radius.circular(rs.r(28)),
              ),
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
                          color: AppPalette.of(context).color(0xFF4D6053),
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
                    color: AppPalette.of(context).color(0xFFF7F9F6),
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
                          color: AppPalette.of(context).color(0xFFE2EBE1),
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
                    color: AppPalette.of(context).color(0xFFE2EBE1),
                    borderRadius: BorderRadius.circular(rs.r(18)),
                  ),
                  child: Row(
                    children: [
                      Container(
                        padding: EdgeInsets.all(rs.w(8)),
                        decoration: BoxDecoration(
                          color: AppPalette.of(context).surface,
                          borderRadius: BorderRadius.circular(rs.r(12)),
                        ),
                        child: QrImageView(
                          data: verificationUrl,
                          version: QrVersions.auto,
                          size: qrSealSize,
                          backgroundColor: Colors.white,
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
                              style: TextStyle(
                                fontSize: rs.sp(11),
                                color: textSub,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(
                              "Issued: ${_formatDate(c['issued_at'])}",
                              style: TextStyle(
                                fontSize: rs.sp(11),
                                color: textSub,
                              ),
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
                        foregroundColor: AppPalette.of(context).onPrimary,
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
                          ? SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(
                                color: AppPalette.of(context).onPrimary,
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
                        _buildSubTabButton(
                          rs: rs,
                          index: 0,
                          title: 'Prescriptions',
                        ),
                        _buildSubTabButton(
                          rs: rs,
                          index: 1,
                          title: 'Clearances',
                        ),
                        _buildSubTabButton(
                          rs: rs,
                          index: 2,
                          title: 'Lab & Imaging',
                        ),
                      ],
                    ),
                  ),
                  SizedBox(height: rs.h(8)),
                  Align(
                    alignment: Alignment.centerRight,
                    child: _buildLayoutSelector(rs),
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
        onTap: () {
          setState(() => _selectedSubTab = index);
          _loadSelected();
        },
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
              color: isSelected
                  ? AppPalette.of(context).onPrimary
                  : primaryGreen,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildLayoutSelector(Rs rs) {
    return Container(
      padding: EdgeInsets.all(rs.w(3)),
      decoration: BoxDecoration(
        color: AppPalette.of(context).color(0xFFF4F6F3),
        border: Border.all(color: borderColor),
        borderRadius: BorderRadius.circular(rs.r(14)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _buildLayoutOption(rs, isGrid: false),
          _buildLayoutOption(rs, isGrid: true),
        ],
      ),
    );
  }

  Widget _buildLayoutOption(Rs rs, {required bool isGrid}) {
    final selected = _isGridView == isGrid;
    return Semantics(
      button: true,
      selected: selected,
      label: isGrid ? 'Grid layout' : 'List layout',
      child: GestureDetector(
        onTap: () => setState(() => _isGridView = isGrid),
        behavior: HitTestBehavior.opaque,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          padding: EdgeInsets.symmetric(
            horizontal: rs.w(10),
            vertical: rs.h(7),
          ),
          decoration: BoxDecoration(
            color: selected
                ? AppPalette.of(context).surface
                : Colors.transparent,
            borderRadius: BorderRadius.circular(rs.r(11)),
            boxShadow: selected
                ? [
                    BoxShadow(
                      color: AppPalette.of(context).color(0x12000000),
                      blurRadius: 4,
                      offset: const Offset(0, 1),
                    ),
                  ]
                : null,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                isGrid ? Icons.grid_view_rounded : Icons.view_agenda_outlined,
                size: rs.w(16),
                color: selected ? primaryGreen : textSub,
              ),
              SizedBox(width: rs.w(5)),
              Text(
                isGrid ? 'Grid' : 'List',
                style: TextStyle(
                  fontSize: rs.sp(11.5),
                  fontWeight: FontWeight.w700,
                  color: selected ? primaryGreen : textSub,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDocumentGrid({
    required Rs rs,
    required int itemCount,
    required Widget Function(BuildContext, int) itemBuilder,
    required Future<void> Function() onRefresh,
    bool includeDisclaimer = false,
  }) {
    final columnCount = rs.isTablet ? 3 : 2;
    return RefreshIndicator(
      color: primaryGreen,
      onRefresh: onRefresh,
      child: CustomScrollView(
        key: PageStorageKey('documents-$_selectedSubTab-grid'),
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverPadding(
            padding: EdgeInsets.fromLTRB(rs.w(20), rs.h(8), rs.w(20), 0),
            sliver: LazyCardColumns(
              columnCount: columnCount,
              itemCount: itemCount,
              gap: rs.w(12),
              itemBuilder: itemBuilder,
            ),
          ),
          if (includeDisclaimer)
            SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.fromLTRB(rs.w(20), rs.h(16), rs.w(20), 0),
                child: _buildSampleDisclaimer(rs),
              ),
            ),
          SliverToBoxAdapter(child: SizedBox(height: rs.h(20))),
        ],
      ),
    );
  }

  Widget _buildPrescriptionGridCard(dynamic rx, Rs rs) {
    final items = rx['items'] as List<dynamic>? ?? [];
    final status = (rx['status'] ?? 'active').toString().toLowerCase();
    final firstMed = items.isNotEmpty ? items[0] : null;
    final medName = (firstMed?['medicine_name'] ?? 'Prescribed medication')
        .toString();
    final medStrength = firstMed == null
        ? ''
        : firstMed['is_outside'] == true
        ? 'Outside Rx · ${firstMed['dosage'] ?? '—'}'
        : '${firstMed['generic_name'] ?? ''} · ${firstMed['dosage'] ?? 'Not recorded'}';

    return _buildDocumentGridCard(
      rs: rs,
      icon: Icons.medication_liquid_outlined,
      iconColor: AppPalette.of(context).color(0xFF5B4EA1),
      iconBackground: AppPalette.of(context).color(0xFFEDEBF7),
      status: status.toUpperCase(),
      statusColor: primaryGreen,
      title: medName,
      subtitle: medStrength,
      details: [
        'Dr. ${rx['doctor_first_name'] ?? ''} ${rx['doctor_last_name'] ?? ''}',
        'Issued ${_formatDate(rx['issued_at'])}',
        if (rx['expires_at'] != null)
          'Valid until ${_formatDate(rx['expires_at'])}',
      ],
      actionLabel: 'View prescription',
      onAction: () => _showPrescriptionDocumentModal(rx),
    );
  }

  Widget _buildClearanceGridCard(dynamic clearance, Rs rs) {
    final rawExpiry = clearance['expires_at'];
    var isExpired = false;
    if (rawExpiry != null) {
      try {
        isExpired = DateTime.parse(rawExpiry).isBefore(DateTime.now());
      } catch (_) {}
    }

    return _buildDocumentGridCard(
      rs: rs,
      icon: Icons.description_outlined,
      iconColor: AppPalette.of(context).color(0xFF8C6826),
      iconBackground: AppPalette.of(context).color(0xFFF7F1E6),
      status: isExpired ? 'EXPIRED' : 'APPROVED',
      statusColor: isExpired
          ? AppPalette.of(context).color(0xFF9B1C1C)
          : primaryGreen,
      title: (clearance['purpose'] ?? 'Medical clearance').toString(),
      subtitle: 'Valid until ${_formatDate(clearance['expires_at'])}',
      details: [
        'Dr. ${clearance['doctor_first_name'] ?? ''} ${clearance['doctor_last_name'] ?? ''}',
        'Issued ${_formatDate(clearance['issued_at'])}',
      ],
      actionLabel: 'View clearance',
      onAction: () => _showClearanceCertificateModal(clearance),
    );
  }

  Widget _buildDocumentGridCard({
    required Rs rs,
    required IconData icon,
    required Color iconColor,
    required Color iconBackground,
    required String status,
    required Color statusColor,
    required String title,
    required String subtitle,
    required List<String> details,
    required String actionLabel,
    required VoidCallback onAction,
  }) {
    return Container(
      padding: EdgeInsets.all(rs.w(13)),
      decoration: BoxDecoration(
        color: AppPalette.of(context).surface,
        borderRadius: BorderRadius.circular(rs.r(18)),
        border: Border.all(color: borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: EdgeInsets.all(rs.w(7)),
                decoration: BoxDecoration(
                  color: iconBackground,
                  borderRadius: BorderRadius.circular(rs.r(9)),
                ),
                child: Icon(icon, size: rs.w(18), color: iconColor),
              ),
              SizedBox(width: rs.w(6)),
              Expanded(
                child: Align(
                  alignment: Alignment.centerRight,
                  child: Container(
                    padding: EdgeInsets.symmetric(
                      horizontal: rs.w(7),
                      vertical: rs.h(4),
                    ),
                    decoration: BoxDecoration(
                      color: statusColor.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(rs.r(10)),
                    ),
                    child: Text(
                      status,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: rs.sp(10),
                        fontWeight: FontWeight.w800,
                        color: statusColor,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
          SizedBox(height: rs.h(10)),
          Text(
            title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: rs.sp(16),
              fontWeight: FontWeight.w800,
              color: textMain,
            ),
          ),
          if (subtitle.isNotEmpty) ...[
            SizedBox(height: rs.h(3)),
            Text(
              subtitle,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: rs.sp(12.5), color: textSub),
            ),
          ],
          SizedBox(height: rs.h(7)),
          ...details.map(
            (detail) => Padding(
              padding: EdgeInsets.only(bottom: rs.h(3)),
              child: Text(
                detail,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: rs.sp(12), color: textSub),
              ),
            ),
          ),
          SizedBox(height: rs.h(8)),
          SizedBox(
            width: double.infinity,
            child: TextButton.icon(
              onPressed: onAction,
              style: TextButton.styleFrom(
                foregroundColor: primaryGreen,
                padding: EdgeInsets.symmetric(vertical: rs.h(5)),
                visualDensity: VisualDensity.compact,
              ),
              icon: Icon(Icons.open_in_new_rounded, size: rs.w(14)),
              label: Text(
                actionLabel,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: rs.sp(12),
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPrescriptionsList(Rs rs) {
    if (_loadingPrescriptions) {
      return Center(child: CircularProgressIndicator(color: primaryGreen));
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
              color: AppPalette.of(context).color(0xFFA4B0A6),
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

    if (_isGridView) {
      return _buildDocumentGrid(
        rs: rs,
        itemCount: _prescriptions.length,
        onRefresh: _fetchPrescriptions,
        includeDisclaimer: true,
        itemBuilder: (context, index) =>
            _buildPrescriptionGridCard(_prescriptions[index], rs),
      );
    }

    return RefreshIndicator(
      color: primaryGreen,
      onRefresh: _fetchPrescriptions,
      child: ListView.builder(
        key: PageStorageKey('documents-$_selectedSubTab-list'),
        padding: EdgeInsets.symmetric(horizontal: rs.w(20), vertical: rs.h(8)),
        itemCount: _prescriptions.length + 2,
        itemBuilder: (context, index) {
          if (index == _prescriptions.length) return _buildSampleDisclaimer(rs);
          if (index > _prescriptions.length) return SizedBox(height: rs.h(20));
          final rx = _prescriptions[index];
          final items = rx['items'] as List<dynamic>? ?? [];
          final status = (rx['status'] ?? 'active').toString().toLowerCase();

          final firstMed = items.isNotEmpty ? items[0] : null;
          final isFirstOutside = firstMed?['is_outside'] == true;
          final medName = firstMed?['medicine_name'] ?? 'Prescribed medication';
          final medStrength = firstMed != null
              ? (isFirstOutside
                    ? "OUTSIDE Rx · ${firstMed['dosage'] ?? '—'} · buy at an external pharmacy"
                    : "${firstMed['generic_name']} · ${firstMed['dosage'] ?? 'Not recorded'}")
              : '';

          return Container(
            margin: EdgeInsets.only(bottom: rs.h(14)),
            padding: EdgeInsets.all(rs.w(18)),
            decoration: BoxDecoration(
              color: AppPalette.of(context).surface,
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
                        color: AppPalette.of(context).color(0xFFEDEBF7),
                        borderRadius: BorderRadius.circular(rs.r(10)),
                      ),
                      child: Icon(
                        Icons.medication_liquid_outlined,
                        size: rs.w(20),
                        color: AppPalette.of(context).color(0xFF5B4EA1),
                      ),
                    ),
                    Container(
                      padding: EdgeInsets.symmetric(
                        horizontal: rs.w(10),
                        vertical: rs.h(4),
                      ),
                      decoration: BoxDecoration(
                        color: status == 'active'
                            ? AppPalette.of(context).color(0xFFE5EDE4)
                            : AppPalette.of(context).color(0xFFE2EBE1),
                        borderRadius: BorderRadius.circular(rs.r(12)),
                      ),
                      child: Text(
                        status.toUpperCase(),
                        style: TextStyle(
                          fontSize: rs.sp(10.5),
                          fontWeight: FontWeight.w700,
                          color: status == 'active'
                              ? primaryGreen
                              : AppPalette.of(context).color(0xFF15803D),
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
                        rx['expires_at'] != null
                            ? "Issued ${_formatDate(rx['issued_at'])} · Valid until ${_formatDate(rx['expires_at'])}"
                            : "Issued ${_formatDate(rx['issued_at'])}",
                        style: TextStyle(fontSize: rs.sp(12), color: textSub),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
                SizedBox(height: rs.h(14)),
                Divider(color: borderColor, height: 1),
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
                          Icon(
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
        },
      ),
    );
  }

  Widget _buildClearancesList(Rs rs) {
    if (_loadingClearances) {
      return Center(child: CircularProgressIndicator(color: primaryGreen));
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
              color: AppPalette.of(context).color(0xFFA4B0A6),
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

    if (_isGridView) {
      return _buildDocumentGrid(
        rs: rs,
        itemCount: _clearances.length,
        onRefresh: _fetchClearances,
        includeDisclaimer: true,
        itemBuilder: (context, index) =>
            _buildClearanceGridCard(_clearances[index], rs),
      );
    }

    return RefreshIndicator(
      color: primaryGreen,
      onRefresh: _fetchClearances,
      child: ListView.builder(
        key: PageStorageKey('documents-$_selectedSubTab-list'),
        padding: EdgeInsets.symmetric(horizontal: rs.w(20), vertical: rs.h(8)),
        itemCount: _clearances.length + 2,
        itemBuilder: (context, index) {
          if (index == _clearances.length) return _buildSampleDisclaimer(rs);
          if (index > _clearances.length) return SizedBox(height: rs.h(20));
          final c = _clearances[index];
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
              color: AppPalette.of(context).surface,
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
                        color: AppPalette.of(context).color(0xFFF7F1E6),
                        borderRadius: BorderRadius.circular(rs.r(10)),
                      ),
                      child: Icon(
                        Icons.description_outlined,
                        size: rs.w(20),
                        color: AppPalette.of(context).color(0xFF8C6826),
                      ),
                    ),
                    Container(
                      padding: EdgeInsets.symmetric(
                        horizontal: rs.w(10),
                        vertical: rs.h(4),
                      ),
                      decoration: BoxDecoration(
                        color: isExpired
                            ? AppPalette.of(context).color(0xFFFDE8E8)
                            : AppPalette.of(context).color(0xFFE2EBE1),
                        borderRadius: BorderRadius.circular(rs.r(12)),
                      ),
                      child: Text(
                        isExpired ? 'EXPIRED' : 'APPROVED',
                        style: TextStyle(
                          fontSize: rs.sp(10.5),
                          fontWeight: FontWeight.w700,
                          color: isExpired
                              ? AppPalette.of(context).color(0xFF9B1C1C)
                              : AppPalette.of(context).color(0xFF15803D),
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
                Divider(color: borderColor, height: 1),
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
                          Icon(
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
        },
      ),
    );
  }

  Widget _buildDiagnosticsList(Rs rs) {
    if (_loadingDiagnostics) {
      return Center(child: CircularProgressIndicator(color: primaryGreen));
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
              color: AppPalette.of(context).color(0xFFA4B0A6),
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

    if (_isGridView) {
      return _buildDocumentGrid(
        rs: rs,
        itemCount: _diagnosticAttachments.length,
        onRefresh: _fetchDiagnostics,
        itemBuilder: (context, index) =>
            _buildDiagnosticGridCard(_diagnosticAttachments[index], rs),
      );
    }

    return RefreshIndicator(
      color: primaryGreen,
      onRefresh: _fetchDiagnostics,
      child: ListView.builder(
        key: const PageStorageKey('documents-diagnostics-list'),
        padding: EdgeInsets.symmetric(horizontal: rs.w(20), vertical: rs.h(8)),
        itemCount: _diagnosticAttachments.length,
        itemBuilder: (context, index) {
          final doc = _diagnosticAttachments[index];
          final fileName = doc['file_name'] ?? 'Diagnostic File';
          final mime = doc['mime_type'] ?? '';
          final isPdf =
              mime.contains('pdf') || fileName.toLowerCase().endsWith('.pdf');
          final isImage = mime.contains('image');
          final downloadUrl =
              '${ApiConfig.baseUrl}/api/documents/attachments/${doc['attachment_id']}/download';

          return Container(
            margin: EdgeInsets.only(bottom: rs.h(14)),
            padding: EdgeInsets.all(rs.w(18)),
            decoration: BoxDecoration(
              color: AppPalette.of(context).surface,
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
                            ? AppPalette.of(context).color(0xFFFDE8E8)
                            : AppPalette.of(context).color(0xFFE0F2FE),
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
                            ? AppPalette.of(context).color(0xFF9B1C1C)
                            : AppPalette.of(context).color(0xFF0284C7),
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
                Divider(color: borderColor, height: 1),
                SizedBox(height: rs.h(12)),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: primaryGreen,
                        side: BorderSide(color: primaryGreen),
                        shape: const StadiumBorder(),
                        padding: EdgeInsets.symmetric(
                          horizontal: rs.w(16),
                          vertical: rs.h(8),
                        ),
                      ),
                      onPressed: () => _openDiagnosticDocument(downloadUrl),
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

  Widget _buildDiagnosticGridCard(dynamic doc, Rs rs) {
    final fileName = (doc['file_name'] ?? 'Diagnostic File').toString();
    final mime = (doc['mime_type'] ?? '').toString();
    final isPdf =
        mime.contains('pdf') || fileName.toLowerCase().endsWith('.pdf');
    final isImage = mime.contains('image');
    final iconColor = isPdf
        ? AppPalette.of(context).color(0xFF9B1C1C)
        : AppPalette.of(context).color(0xFF0284C7);
    final downloadUrl =
        '${ApiConfig.baseUrl}/api/documents/attachments/${doc['attachment_id']}/download';

    return Container(
      padding: EdgeInsets.all(rs.w(13)),
      decoration: BoxDecoration(
        color: AppPalette.of(context).surface,
        borderRadius: BorderRadius.circular(rs.r(18)),
        border: Border.all(color: borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: EdgeInsets.all(rs.w(7)),
                decoration: BoxDecoration(
                  color: isPdf
                      ? AppPalette.of(context).color(0xFFFDE8E8)
                      : AppPalette.of(context).color(0xFFE0F2FE),
                  borderRadius: BorderRadius.circular(rs.r(9)),
                ),
                child: Icon(
                  isPdf
                      ? Icons.picture_as_pdf_outlined
                      : isImage
                      ? Icons.image_outlined
                      : Icons.description_outlined,
                  size: rs.w(18),
                  color: iconColor,
                ),
              ),
              SizedBox(width: rs.w(7)),
              Expanded(
                child: Text(
                  _formatDate(
                    doc['created_at'] ?? doc['encounter_date'],
                    compact: true,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.end,
                  style: TextStyle(
                    fontSize: rs.sp(11.5),
                    color: textSub,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          SizedBox(height: rs.h(10)),
          Text(
            fileName,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: rs.sp(16),
              fontWeight: FontWeight.w800,
              color: textMain,
            ),
          ),
          SizedBox(height: rs.h(5)),
          Text(
            'Dr. ${doc['doctor_first_name'] ?? ''} ${doc['doctor_last_name'] ?? ''}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: rs.sp(12), color: textSub),
          ),
          Text(
            (doc['doctor_specialty'] ?? 'Campus Physician').toString(),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: rs.sp(12), color: textSub),
          ),
          SizedBox(height: rs.h(10)),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () => _openDiagnosticDocument(downloadUrl),
              style: OutlinedButton.styleFrom(
                foregroundColor: primaryGreen,
                side: BorderSide(color: primaryGreen),
                shape: const StadiumBorder(),
                visualDensity: VisualDensity.compact,
                padding: EdgeInsets.symmetric(vertical: rs.h(5)),
              ),
              icon: Icon(Icons.open_in_new, size: rs.w(13)),
              label: Text(
                'Open file',
                style: TextStyle(
                  fontSize: rs.sp(12),
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _openDiagnosticDocument(String downloadUrl) async {
    final token = await _storage.read(key: 'jwt_token');
    // Keep the session JWT out of URLs; the download token is short-lived.
    try {
      final res = await _client.post(
        Uri.parse('$downloadUrl-token'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
      );

      if (res.statusCode != 200) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: const Text('Could not open file. Please try again.'),
              backgroundColor: AppPalette.of(context).background(0xFF7A2E26),
            ),
          );
        }
        return;
      }

      final data = jsonDecode(res.body) as Map<String, dynamic>;
      final dlToken = data['downloadToken'] as String?;
      if (dlToken == null || dlToken.isEmpty) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: const Text('Could not open file. Please try again.'),
              backgroundColor: AppPalette.of(context).background(0xFF7A2E26),
            ),
          );
        }
        return;
      }

      await launchUrl(
        Uri.parse('$downloadUrl?dlToken=$dlToken'),
        mode: LaunchMode.externalApplication,
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Network error: $e'),
            backgroundColor: AppPalette.of(context).background(0xFF7A2E26),
          ),
        );
      }
    }
  }

  Widget _buildSampleDisclaimer(Rs rs) {
    return Container(
      padding: EdgeInsets.all(rs.w(16)),
      decoration: BoxDecoration(
        color: AppPalette.of(context).color(0xFFE2EBE1),
        borderRadius: BorderRadius.circular(rs.r(20)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.verified_outlined, size: rs.w(18), color: primaryGreen),
          SizedBox(width: rs.w(10)),
          Expanded(
            child: Text(
              'These are official medical records protected under R.A. 10173. For official credentials or changes to your clinical records, visit the campus infirmary.',
              style: TextStyle(
                fontSize: rs.sp(12),
                color: AppPalette.of(context).color(0xFF424943),
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
