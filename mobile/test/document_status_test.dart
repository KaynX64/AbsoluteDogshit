import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/screens/documents_viewer_screen.dart';
import 'package:mobile/services/mobile_session_data.dart';

void main() {
  final session = MobileSessionData.instance;

  Future<void> open(
    WidgetTester tester,
    MockClient client, {
    int tab = 0,
    bool grid = false,
  }) async {
    FlutterSecureStorage.setMockInitialValues({'jwt_token': 'fixture'});
    session.begin('fixture');
    session.documentsState.addAll({'tab': tab, 'grid': grid});
    addTearDown(session.clear);
    addTearDown(client.close);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: DocumentsViewerScreen(client: client)),
      ),
    );
    await tester.pumpAndSettle();
  }

  for (final grid in [false, true]) {
    testWidgets('future-dated revoked clearance remains revoked, grid=$grid', (
      tester,
    ) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(800, 1000);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final client = MockClient(
        (_) async => http.Response(
          jsonEncode([
            {
              'clearance_id': 1,
              'purpose': 'Fixture clearance',
              'status': 'revoked',
              'issued_at': '2026-11-16',
              'expires_at': '2099-11-16',
            },
          ]),
          200,
        ),
      );
      await open(tester, client, tab: 1, grid: grid);
      expect(find.text('REVOKED'), findsOneWidget);
      expect(find.text('APPROVED'), findsNothing);
      final button = find.text(grid ? 'View clearance' : 'View document').first;
      await tester.ensureVisible(button);
      await tester.pumpAndSettle();
      await tester.tap(button);
      await tester.pumpAndSettle();
      expect(find.textContaining('STATUS: REVOKED'), findsOneWidget);
      expect(find.textContaining('PHYSICALLY FIT'), findsNothing);
    });
  }

  testWidgets('failed documents show retry, then genuine empty history', (
    tester,
  ) async {
    var requests = 0;
    final client = MockClient(
      (_) async =>
          ++requests == 1 ? http.Response('{}', 500) : http.Response('[]', 200),
    );
    await open(tester, client);
    expect(find.text('Could not load these documents.'), findsOneWidget);
    expect(find.text('No digital prescriptions on record.'), findsNothing);
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.text('No digital prescriptions on record.'), findsOneWidget);
  });

  testWidgets('a visible prescriptions list reloads on a dataset update', (
    tester,
  ) async {
    var status = 'active';
    final client = MockClient(
      (_) async => http.Response(
        jsonEncode([
          {
            'prescription_id': 10,
            'status': status,
            'issued_at': '2026-11-16',
            'items': [],
          },
        ]),
        200,
      ),
    );
    await open(tester, client);
    expect(find.text('ACTIVE'), findsOneWidget);
    status = 'cancelled';
    session.invalidate('/api/documents/prescriptions/my', notify: true);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 160));
    await tester.pumpAndSettle();
    expect(find.text('CANCELLED'), findsOneWidget);
  });
}
