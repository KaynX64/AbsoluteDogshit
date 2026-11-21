import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/services/emergency_alert_service.dart';
import 'package:mobile/screens/responder_records_view.dart';
import 'package:mobile/widgets/responder_workspace.dart';

Map<String, dynamic> fixtureRecord() => {
  'alertId': 9,
  'status': 'resolved',
  'patient': {'userId': 5, 'name': 'Fixture Member', 'identifier': 'FIX-9'},
  'location': 'Fixture campus gate',
  'createdAt': DateTime.now()
      .subtract(const Duration(days: 3))
      .toUtc()
      .toIso8601String(),
  'resolvedAt': DateTime.now()
      .subtract(const Duration(days: 2))
      .toUtc()
      .toIso8601String(),
  'needsReport': true,
  'hasDraft': true,
  'reportId': null,
  'timeline': [
    {
      'status': 'resolved',
      'at': DateTime.now().toUtc().toIso8601String(),
      'actor': 'Fixture Staff',
    },
  ],
};

void main() {
  Future<EmergencyAlertService> session(
    WidgetTester tester,
    List<http.Request> requests, {
    Future<http.Response>? firstPage,
  }) async {
    var pages = 0;
    final service = EmergencyAlertService.test(
      MockClient((request) async {
        requests.add(request);
        if (request.url.path.endsWith('/responder-access')) {
          return http.Response(
            '{"authorized":true,"tier":"clinical","isQualifiedResponder":false}',
            200,
          );
        }
        if (request.url.path.endsWith('/active')) {
          return http.Response('[]', 200);
        }
        if (request.url.path.endsWith('/report-summary')) {
          return http.Response(
            '{"pending":1,"overdue":1,"drafts":1,"canViewFiled":true}',
            200,
          );
        }
        if (request.url.path.endsWith('/history/9')) {
          return http.Response(jsonEncode(fixtureRecord()), 200);
        }
        if (request.url.path.endsWith('/reports/3')) {
          return http.Response(
            '{"reportId":3,"incidentDetails":"Filed fixture narrative","documentedByName":"Fixture Staff"}',
            200,
          );
        }
        if (request.url.path.endsWith('/reports')) {
          return http.Response(
            jsonEncode({
              'records': [
                {...fixtureRecord(), 'needsReport': false, 'reportId': 3},
              ],
              'nextCursor': null,
            }),
            200,
          );
        }
        if (++pages == 1 && firstPage != null) return firstPage;
        return http.Response(
          jsonEncode({
            'records': request.url.queryParameters['search'] == 'nomatch'
                ? []
                : [fixtureRecord()],
            'nextCursor': null,
          }),
          200,
        );
      }),
    );
    final originalPlatform = debugDefaultTargetPlatformOverride;
    debugDefaultTargetPlatformOverride = TargetPlatform.linux;
    service.beginSession('fixture-history-session', 10);
    await tester.pump();
    await service.refreshAccess();
    debugDefaultTargetPlatformOverride = originalPlatform;
    addTearDown(service.endSession);
    return service;
  }

  testWidgets(
    'pending reports remain read-only, display attention and desktop draft metadata',
    (tester) async {
      final requests = <http.Request>[];
      final service = await session(tester, requests);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: ResponderRecordsView(service: service)),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Draft saved on desktop'), findsOneWidget);
      expect(find.text('Over 24 hours'), findsOneWidget);
      expect(
        find.text('Complete this report in the desktop app.'),
        findsOneWidget,
      );
      expect(find.byType(TextFormField), findsNothing);
      await tester.tap(find.text('SOS-9'));
      await tester.pumpAndSettle();
      expect(find.text('Report pending'), findsOneWidget);
      expect(
        find.text('Complete this report in the desktop app.'),
        findsOneWidget,
      );
      expect(find.text('File report'), findsNothing);
      expect(requests.every((request) => request.method == 'GET'), isTrue);
      expect(
        requests.any(
          (request) => request.url.path.contains('incident-report-draft'),
        ),
        isFalse,
      );
      service.roster.setAccess('community', true);
      await tester.pumpAndSettle();
      expect(
        find.text('You no longer have access to these records.'),
        findsOneWidget,
      );
      expect(find.text('Fixture Member'), findsNothing);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'search and filed details use reads only and retain accessible narrow layouts',
    (tester) async {
      tester.view.physicalSize = const Size(320, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final requests = <http.Request>[];
      final service = await session(tester, requests);
      await tester.pumpWidget(
        MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context)
                .copyWith(textScaler: TextScaler.linear(2)),
            child: child!,
          ),
          home: Scaffold(body: ResponderRecordsView(service: service)),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.enterText(find.byType(TextField), 'nomatch');
      await tester.pumpAndSettle();
      FocusManager.instance.primaryFocus?.unfocus();
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('No matching records. Try another search or date range.'),
        250,
        scrollable: find
            .descendant(
              of: find.byType(CustomScrollView),
              matching: find.byType(Scrollable),
            )
            .first,
      );
      expect(
        find.text('No matching records. Try another search or date range.'),
        findsOneWidget,
      );
      await tester.ensureVisible(find.byTooltip('Clear search'));
      await tester.tap(find.byTooltip('Clear search'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Filed'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Filed'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('SOS-9 · IR-3'),
        250,
        scrollable: find
            .descendant(
              of: find.byType(CustomScrollView),
              matching: find.byType(Scrollable),
            )
            .first,
      );
      await tester.tap(find.text('SOS-9 · IR-3'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Filed fixture narrative'),
        250,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Filed fixture narrative'), findsOneWidget);
      expect(find.byType(TextFormField), findsNothing);
      expect(requests.every((request) => request.method == 'GET'), isTrue);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'staff navigate Alerts History and Reports while community accounts keep Alerts only',
    (tester) async {
      final requests = <http.Request>[];
      final service = await session(tester, requests);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: ResponderWorkspace(service: service)),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(NavigationBar), findsOneWidget);
      await tester.tap(
        find.descendant(
          of: find.byType(NavigationBar),
          matching: find.text('Reports'),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.text('Read-only on mobile · complete reports on desktop'),
        findsOneWidget,
      );
      await tester.tap(
        find.descendant(
          of: find.byType(NavigationBar),
          matching: find.text('History'),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Alert history'), findsOneWidget);
      service.roster.setAccess('community', true);
      await tester.pumpAndSettle();
      expect(find.byType(NavigationBar), findsNothing);
      expect(find.text('Alert history'), findsNothing);
      expect(requests.every((request) => request.method == 'GET'), isTrue);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets('stale record requests cannot replace the latest search', (
    tester,
  ) async {
    final first = Completer<http.Response>(), requests = <http.Request>[];
    final service = await session(tester, requests, firstPage: first.future);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: ResponderRecordsView(service: service)),
      ),
    );
    await tester.pump();
    await tester.enterText(find.byType(TextField), 'nomatch');
    await tester.pump(const Duration(milliseconds: 400));
    first.complete(
      http.Response(
        jsonEncode({
          'records': [fixtureRecord()],
          'nextCursor': null,
        }),
        200,
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Fixture Member'), findsNothing);
    expect(
      find.text('No matching records. Try another search or date range.'),
      findsOneWidget,
    );
    await tester.pumpWidget(const SizedBox());
  });
}
