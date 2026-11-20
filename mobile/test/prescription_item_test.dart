import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/models/prescription_item.dart';
import 'package:mobile/screens/documents_viewer_screen.dart';
import 'package:mobile/services/mobile_session_data.dart';

void main() {
  test('missing legacy clinical fields remain Not recorded', () {
    final item = PrescriptionItemView({});
    expect(item.dosage, 'Not recorded');
    expect(item.administration, 'Dose: Not recorded • Route: Not recorded');
    expect(item.schedule, 'Schedule: Not recorded');
    expect(item.supply, 'Supply: Not recorded unit not recorded');
    expect(item.course, 'Duration: Not recorded');
    expect(item.directions, 'Directions: Not recorded');
  });
  final recorded = <String, dynamic>{
    'contract_version': 2,
    'medicine_name': 'Fixture generic',
    'strength': '10 mg/5 mL',
    'form': 'Suspension',
    'dosage': '2.5 mL',
    'route': 'Oral',
    'frequency': 'As needed for fixture reason; fixture limits',
    'duration_days': null,
    'review_on': '2099-11-19',
    'quantity_prescribed': 1.5,
    'quantity_dispensed': 0,
    'quantity_unit': 'bottle',
    'pack_size': '60 mL',
    'instructions': 'Fixture patient directions',
    'is_outside': true,
  };
  test('structured units, fractional amounts and review dates are read without inference', () {
    final item = PrescriptionItemView(recorded);
    expect(item.external, true);
    expect(item.supply, 'Supply: 1.5 bottle (60 mL)');
    expect(item.course, 'Review on: 2099-11-19');
    expect(item.administration, 'Dose: 2.5 mL • Route: Oral');
    expect(item.directions, 'Directions: Fixture patient directions');
  });
  testWidgets(
    'mobile prescription preview shows recorded directions, course, supply and neutral verification',
    (tester) async {
      FlutterSecureStorage.setMockInitialValues({
        'jwt_token': 'prescription-fixture',
      });
      final data = MobileSessionData.instance..begin('prescription-fixture');
      addTearDown(data.clear);
      final client = MockClient(
        (request) async => http.Response(
          jsonEncode([
            {
              'prescription_id': 10,
              'contract_version': 2,
              'issued_at': '2026-11-16',
              'expires_at': '2099-11-23',
              'doctor_first_name': 'Fixture',
              'doctor_last_name': 'Clinician',
              'doctor_license': 'FIXTURE',
              'status': 'active',
              'qr_token': 'fixture-token',
              'items': [recorded],
              'notes': 'Fixture patient advice',
            },
          ]),
          200,
        ),
      );
      addTearDown(client.close);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: DocumentsViewerScreen(client: client)),
        ),
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('View document').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('View document').first);
      await tester.pumpAndSettle();
      expect(find.textContaining('Dose: 2.5 mL'), findsOneWidget);
      expect(find.textContaining('Fixture patient directions'), findsOneWidget);
      expect(find.textContaining('Supply: 1.5 bottle (60 mL)'), findsOneWidget);
      expect(find.textContaining('Review on: 2099-11-19'), findsOneWidget);
      final scrollable = find
          .descendant(
            of: find.byType(DraggableScrollableSheet),
            matching: find.byType(Scrollable),
          )
          .first;
      await tester.scrollUntilVisible(
        find.textContaining('Patient advice — printed on prescription'),
        200,
        scrollable: scrollable,
      );
      expect(
        find.textContaining('Patient advice — printed on prescription'),
        findsOneWidget,
      );
      await tester.scrollUntilVisible(
        find.text('PRESCRIPTION RECORD VERIFICATION'),
        200,
        scrollable: scrollable,
      );
      expect(find.text('PRESCRIPTION RECORD VERIFICATION'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
