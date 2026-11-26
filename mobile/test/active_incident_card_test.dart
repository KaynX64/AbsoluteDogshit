import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/services/emergency_alert_service.dart';
import 'package:mobile/services/responder_roster.dart';
import 'package:mobile/theme/account_theme_controller.dart';
import 'package:mobile/theme/app_palette.dart';
import 'package:mobile/widgets/active_incident_card.dart';
import 'package:mobile/widgets/responder_hub.dart';
import 'package:mobile/widgets/responder_style.dart';

Map<String, dynamic> alert() => {
  'alert_id': 9,
  'user_id': 5,
  'status': 'triggered',
  'patientName': 'Fixture Member',
  'roleLabel': 'Campus member',
  'formattedAddress': 'Campus science building, east entrance',
  'latitude': 16.1,
  'longitude': 120.3,
  'medicalDetailsRedacted': true,
};

void main() {
  testWidgets(
    'quick actions follow live staff workflow and prevent duplicate updates',
    (tester) async {
      final calls = <String>[];
      final held = Completer<http.Response>();
      final original = debugDefaultTargetPlatformOverride;
      debugDefaultTargetPlatformOverride = TargetPlatform.linux;
      final service = EmergencyAlertService.test(
        MockClient((request) async {
          if (request.url.path.endsWith('/responder-access')) {
            return http.Response('{"authorized":true,"tier":"clinical"}', 200);
          }
          if (request.url.path.endsWith('/active')) {
            return http.Response(jsonEncode([alert()]), 200);
          }
          if (request.method == 'PATCH') {
            final status = jsonDecode(request.body)['status'] as String;
            calls.add(status);
            return status == 'acknowledged'
                ? held.future
                : http.Response('{}', 200);
          }
          return http.Response(
            '{"pending":0,"overdue":0,"drafts":0,"canViewFiled":true}',
            200,
          );
        }),
      );
      service.beginSession('fixture-card', 10);
      await tester.pump();
      await service.refreshAccess();
      await service.refreshIncidents(manual: true);
      debugDefaultTargetPlatformOverride = original;
      addTearDown(service.endSession);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ResponderStyle(child: ResponderHub(service: service)),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('SOS-9'), findsNothing);
      expect(find.text('Active campus incident'), findsNothing);
      expect(find.text('Fixture Member'), findsOneWidget);
      expect(
        find.text('Campus science building, east entrance'),
        findsOneWidget,
      );
      expect(find.text('Dispatch to location'), findsNothing);
      await tester.ensureVisible(find.text('Acknowledge'));
      await tester.tap(find.text('Acknowledge'));
      await tester.pump();
      await tester.tap(find.text('Acknowledge'));
      await tester.pump();
      expect(calls, ['acknowledged']);
      held.complete(http.Response('{}', 200));
      await tester.pumpAndSettle();
      expect(find.text('Acknowledged'), findsOneWidget);
      await tester.tap(find.text('Dispatch to location'));
      await tester.pumpAndSettle();
      expect(find.text('Dispatched'), findsOneWidget);
      await tester.tap(find.text('Resolve'));
      await tester.pumpAndSettle();
      expect(calls, ['acknowledged', 'dispatched']);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(service.roster[9], isNotNull);
      await tester.tap(find.text('Resolve'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Resolve incident'));
      await tester.pumpAndSettle();
      expect(calls, ['acknowledged', 'dispatched', 'resolved']);
      expect(find.text('Fixture Member'), findsNothing);
      await tester.pumpWidget(const SizedBox());
    },
  );

  for (final dark in [false, true]) {
    testWidgets(
      'community cards and compact banners stay accessible in ${dark ? 'dark' : 'light'} mode',
      (tester) async {
        tester.view.physicalSize = const Size(320, 640);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final service = EmergencyAlertService.test(
          MockClient((_) async => http.Response('{}', 500)),
        );
        service.roster
          ..begin(10)
          ..setAccess('community', true)
          ..accept(Incident.parse(alert())!);
        var opened = false;
        await tester.pumpWidget(
          MaterialApp(
            theme: buildAccountTheme(AccountThemeSelection(dark: dark)),
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context)
                  .copyWith(textScaler: TextScaler.linear(2)),
              child: child!,
            ),
            home: Scaffold(
              body: ResponderStyle(
                child: SingleChildScrollView(
                  child: ListenableBuilder(
                    listenable: service.roster,
                    builder: (context, _) => ActiveIncidentCard(
                      incident: service.roster[9]!,
                      service: service,
                      onDetails: () => opened = true,
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('Acknowledge'), findsOneWidget);
        expect(find.text('Resolve'), findsNothing);
        expect(find.text('Dispatch to location'), findsNothing);
        await tester.ensureVisible(find.text('View details'));
        await tester.tap(find.text('View details'));
        expect(opened, isTrue);
        expect(
          tester
              .widget<OutlinedButton>(
                find.widgetWithText(OutlinedButton, 'Navigate'),
              )
              .onPressed,
          isNotNull,
        );
        service.roster.toggleMute(9);
        await tester.pumpAndSettle();
        expect(find.byTooltip('Unmute incident siren'), findsOneWidget);
        service.roster.statusChanged(9, IncidentStatus.acknowledged);
        await tester.pumpAndSettle();
        expect(find.text('Acknowledge'), findsNothing);
        await tester.pumpWidget(
          MaterialApp(
            theme: buildAccountTheme(AccountThemeSelection(dark: dark)),
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context)
                  .copyWith(textScaler: TextScaler.linear(2)),
              child: child!,
            ),
            home: Scaffold(
              body: Column(
                children: [
                  ActiveIncidentBanner(service: service),
                  const Expanded(
                    child: Center(child: Text('Records remain reachable')),
                  ),
                ],
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.byType(ActiveIncidentCard), findsNothing);
        expect(find.text('Campus alert'), findsOneWidget);
        expect(find.text('SOS-9'), findsNothing);
        expect(find.text('Navigate'), findsNothing);
        expect(find.text('Dispatch to location'), findsNothing);
        expect(
          tester.getSize(find.byType(ActiveIncidentBanner)).height,
          lessThanOrEqualTo(130),
        );
        expect(
          find.text('Records remain reachable').hitTestable(),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox());
      },
    );
  }

  testWidgets(
    'cards disable navigation without coordinates and never expose medical fields',
    (tester) async {
      final service = EmergencyAlertService.test(
        MockClient((_) async => http.Response('{}', 500)),
      );
      final incident = Incident.parse({
        ...alert(),
        'latitude': null,
        'longitude': null,
        'blood_type': 'Private fixture',
      })!;
      service.roster
        ..begin(10)
        ..setAccess('community', true)
        ..accept(incident);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ActiveIncidentCard(
              incident: incident,
              service: service,
              onDetails: () {},
            ),
          ),
        ),
      );
      final map = tester.widget<OutlinedButton>(
        find.widgetWithText(OutlinedButton, 'Navigate'),
      );
      expect(map.onPressed, isNull);
      expect(find.text('Private fixture'), findsNothing);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'main card secondary buttons have equal size and consistent action spacing',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final service = EmergencyAlertService.test(
        MockClient((_) async => http.Response('{}', 500)),
      );
      final incident = Incident.parse(alert())!;
      service.roster
        ..begin(10)
        ..setAccess('community', true)
        ..accept(incident);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ResponderStyle(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: ActiveIncidentCard(
                  incident: incident,
                  service: service,
                  onDetails: () {},
                ),
              ),
            ),
          ),
        ),
      );
      final details = tester.getRect(
        find.widgetWithText(OutlinedButton, 'View details'),
      );
      final maps = tester.getRect(
        find.widgetWithText(OutlinedButton, 'Navigate'),
      );
      final acknowledge = tester.getRect(
        find.widgetWithText(FilledButton, 'Acknowledge'),
      );
      expect(details.width, maps.width);
      expect(details.height, maps.height);
      expect(details.height, greaterThanOrEqualTo(48));
      expect(maps.left - details.right, 12);
      expect(acknowledge.top - details.bottom, 12);
      expect(acknowledge.width, details.width + maps.width + 12);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
