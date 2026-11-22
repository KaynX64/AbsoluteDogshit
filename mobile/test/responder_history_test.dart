import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/services/emergency_alert_service.dart';
import 'package:mobile/services/responder_roster.dart';
import 'package:mobile/screens/responder_records_view.dart';
import 'package:mobile/widgets/responder_workspace.dart';
import 'package:mobile/theme/app_palette.dart';
import 'package:mobile/theme/account_theme_controller.dart';

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
    Future<http.Response>? secondPage,
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
        if (pages == 2 && secondPage != null) return secondPage;
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

  testWidgets(
    'report tabs and destinations reuse results; hidden views defer refresh',
    (tester) async {
      final requests = <http.Request>[];
      final service = await session(tester, requests);
      await tester.pumpWidget(
        MaterialApp(
          theme: buildAccountTheme(const AccountThemeSelection()),
          home: Scaffold(body: ResponderWorkspace(service: service)),
        ),
      );
      Future<void> destination(String label) async {
        await tester.tap(
          find.descendant(
            of: find.byType(NavigationBar),
            matching: find.text(label),
          ),
        );
        await tester.pumpAndSettle();
      }

      int reads(String path) =>
          requests.where((r) => r.url.path.endsWith(path)).length;
      await destination('Reports');
      await tester.tap(find.text('Filed'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Pending'));
      await tester.pumpAndSettle();
      final pending = reads('/report-worklist'), filed = reads('/reports');
      await tester.tap(find.text('Pending'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Filed'));
      await tester.pumpAndSettle();
      expect(reads('/report-worklist'), pending);
      expect(reads('/reports'), filed);
      await destination('History');
      final history = reads('/history');
      expect(
        Theme.of(tester.element(find.text('Alert history')))
            .textTheme
            .headlineSmall
            ?.fontWeight,
        FontWeight.w800,
      );
      await destination('Reports');
      service.incidentReportChanges.value++;
      await tester.pump(const Duration(milliseconds: 250));
      await tester.pumpAndSettle();
      expect(
        reads('/history'),
        history,
        reason: 'Hidden history does not make background requests',
      );
      expect(reads('/reports'), filed + 1);
      await destination('History');
      expect(
        reads('/history'),
        history + 1,
        reason: 'Hidden changes are refreshed when that destination becomes visible',
      );
      await destination('Reports');
      final after = reads('/reports');
      await destination('History');
      await destination('Reports');
      expect(reads('/reports'), after);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'background refresh keeps cards visible until the new snapshot arrives',
    (tester) async {
      final next = Completer<http.Response>(), requests = <http.Request>[];
      final service = await session(tester, requests, secondPage: next.future);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: ResponderRecordsView(service: service)),
        ),
      );
      await tester.pumpAndSettle();
      service.incidentReportChanges.value++;
      await tester.pump(const Duration(milliseconds: 250));
      expect(find.text('Fixture Member'), findsOneWidget);
      next.complete(http.Response('{"records":[],"nextCursor":null}', 200));
      await tester.pumpAndSettle();
      expect(find.text('Fixture Member'), findsNothing);
      await tester.pumpWidget(const SizedBox());
    },
  );

  for (final dark in [false, true]) {
    testWidgets(
      'icon filters support narrow enlarged text in ${dark ? 'dark' : 'light'} mode',
      (tester) async {
        tester.view.physicalSize = const Size(320, 700);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final requests = <http.Request>[];
        final service = await session(tester, requests);
        await tester.pumpWidget(
          MaterialApp(
            theme: buildAccountTheme(AccountThemeSelection(dark: dark)),
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context)
                  .copyWith(textScaler: TextScaler.linear(2)),
              child: child!,
            ),
            home: Scaffold(body: ResponderWorkspace(service: service)),
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(
          find.descendant(
            of: find.byType(NavigationBar),
            matching: find.text('History'),
          ),
        );
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.byTooltip('Filter by date'));
        await tester.tap(find.byTooltip('Filter by date'));
        await tester.pumpAndSettle();
        await tester.tap(find.widgetWithText(ListTile, 'All time'));
        await tester.pumpAndSettle();
        expect(
          requests
              .lastWhere((r) => r.url.path.endsWith('/history'))
              .url
              .queryParameters['period'],
          'all',
        );
        await tester.ensureVisible(find.byTooltip('Filter by outcome'));
        await tester.tap(find.byTooltip('Filter by outcome'));
        await tester.pumpAndSettle();
        await tester.tap(find.widgetWithText(ListTile, 'False alarms'));
        await tester.pumpAndSettle();
        expect(
          requests
              .lastWhere((r) => r.url.path.endsWith('/history'))
              .url
              .queryParameters['status'],
          'false_alarm',
        );
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox());
      },
    );
  }

  if (const bool.fromEnvironment('RESPONDER_PREVIEWS')) {
    testWidgets('render responder UI previews with the account font', (
      tester,
    ) async {
      final root = Platform.environment['FLUTTER_ROOT']!;
      await tester.runAsync(() async {
        for (final entry in [
          ('Roboto', 'roboto-regular.ttf'),
          ('MaterialIcons', 'MaterialIcons-Regular.otf'),
        ]) {
          final loader = FontLoader(entry.$1)
            ..addFont(
              File('$root/bin/cache/artifacts/material_fonts/${entry.$2}')
                  .readAsBytes()
                  .then((bytes) => ByteData.sublistView(bytes)),
            );
          await loader.load();
        }
      });
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final service = await session(tester, <http.Request>[]);
      for (final dark in [false, true]) {
        final alertId = dark ? 13 : 12;
        service.roster.accept(Incident.parse({
          'alert_id': alertId, 'user_id': 5, 'status': 'acknowledged',
          'patientName': 'Fixture Member', 'roleLabel': 'Campus member',
          'formattedAddress': 'Campus science building, east entrance',
          'latitude': 16.1, 'longitude': 120.3, 'medicalDetailsRedacted': true,
        })!);
        final key = GlobalKey();
        await tester.pumpWidget(
          RepaintBoundary(
            key: key,
            child: MaterialApp(
              debugShowCheckedModeBanner: false,
              theme: buildAccountTheme(AccountThemeSelection(dark: dark)),
              home: Scaffold(
                appBar: AppBar(
                  title: const Text(
                    'LeoVital',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
                  ),
                ),
                body: ResponderWorkspace(service: service),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        for (final label in ['Alerts', 'History', 'Reports']) {
          await tester.tap(
            find.descendant(
              of: find.byType(NavigationBar),
              matching: find.text(label),
            ),
          );
          await tester.pumpAndSettle();
          final boundary =
              key.currentContext!.findRenderObject() as RenderRepaintBoundary;
          await tester.runAsync(() async {
            final image = await boundary
                .toImage(pixelRatio: 2)
                .timeout(const Duration(seconds: 10));
            final bytes = await image.toByteData(
              format: ui.ImageByteFormat.png,
            );
            final file = File(
              'build/responder-ui/${label.toLowerCase()}-${dark ? 'dark' : 'light'}.png',
            );
            await file.parent.create(recursive: true);
            await file.writeAsBytes(bytes!.buffer.asUint8List());
            image.dispose();
          });
          if (label == 'History') {
            service.roster.statusChanged(alertId, IncidentStatus.resolved);
          }
        }
        await tester.pumpWidget(const SizedBox());
      }
    });
  }
}
