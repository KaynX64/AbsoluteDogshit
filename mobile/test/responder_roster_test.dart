import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/services/emergency_alert_service.dart';
import 'package:mobile/services/responder_roster.dart';
import 'package:mobile/widgets/responder_hub.dart';
import 'package:mobile/widgets/sos_alert_actions.dart';
import 'package:mobile/screens/incident_reports_screen.dart';

Map<String, Object> incidentData(int id, {int user = 11}) => {
  'alert_id': id,
  'user_id': user,
  'status': 'triggered',
  'first_name': 'Fixture',
  'last_name': 'Member',
  'formattedAddress': 'Campus main entrance and information desk',
  'medicalDetailsRedacted': true,
};

Incident incident(int id, {int user = 11}) =>
    Incident.parse(incidentData(id, user: user))!;

ResponderRoster roster() => ResponderRoster()
  ..begin(10)
  ..setAccess('community', true);

void main() {
  test('action permissions depend on access tier rather than the qualification flag', () {
    final state = roster();
    final allowed = <String?, List<IncidentStatus>>{
      'community': [IncidentStatus.acknowledged],
      'clinical': [
        IncidentStatus.acknowledged,
        IncidentStatus.dispatched,
        IncidentStatus.resolved,
        IncidentStatus.falseAlarm,
      ],
      null: [],
    };
    for (final entry in allowed.entries) {
      state.setAccess(entry.key, true);
      expect(
        IncidentStatus.values.where(state.canUpdateStatus).toList(),
        entry.value,
      );
    }
    state.setAccess('clinical', false);
    expect(state.canManageIncidents, isTrue);
  });

  testWidgets(
    'community acknowledgment keeps the incident active and staff actions follow live access',
    (tester) async {
      final state = roster()..accept(incident(1));
      final submitted = <IncidentStatus>[];
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ListenableBuilder(
              listenable: state,
              builder: (_, _) => SosAlertActions(
                roster: state,
                incident: state[1] ?? incident(1),
                onUpdate: (id, status) async {
                  submitted.add(status);
                  state.statusChanged(id, status);
                  return null;
                },
              ),
            ),
          ),
        ),
      );
      expect(find.text('Acknowledge'), findsOneWidget);
      expect(find.text('Dispatch to location'), findsNothing);
      expect(find.text('Resolve'), findsNothing);
      expect(find.text('False alarm'), findsNothing);
      await tester.tap(find.text('Acknowledge'));
      await tester.pumpAndSettle();
      expect(state[1]?.status, IncidentStatus.acknowledged);
      expect(find.text('Acknowledge'), findsNothing);
      state.setAccess('clinical', true);
      await tester.pumpAndSettle();
      expect(find.text('Resolve'), findsOneWidget);
      await tester.tap(find.text('Resolve'));
      await tester.pumpAndSettle();
      state.setAccess('community', true);
      await tester.pump();
      await tester.tap(find.text('Resolve incident'));
      await tester.pumpAndSettle();
      expect(
        state.incidents,
        isEmpty,
      ); // Tier change clears the previous snapshot.
      expect(find.text('Resolve'), findsNothing);
      state.setAccess(null, false);
      await tester.pumpAndSettle();
      expect(find.text('Acknowledge'), findsNothing);
      expect(submitted, [IncidentStatus.acknowledged]);
    },
  );

  testWidgets('community report routes cannot load or submit staff reports', (
    tester,
  ) async {
    final service = EmergencyAlertService.test(
      MockClient((_) async {
        fail('Community report screen must not issue a request');
      }),
    );
    service.roster
      ..begin(10)
      ..setAccess('community', true);
    await tester.pumpWidget(
      MaterialApp(home: IncidentReportsScreen(service: service)),
    );
    await tester.pumpAndSettle();
    expect(
      find.text('History and reports are restricted to response staff.'),
      findsOneWidget,
    );
    expect(find.byType(TextFormField), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('report entry follows the current responder tier', (
    tester,
  ) async {
    final service = EmergencyAlertService();
    addTearDown(() => service.roster.setAccess(null, false));
    service.roster
      ..begin(10)
      ..setAccess('clinical', false);
    await tester.pumpWidget(
      const MaterialApp(home: Scaffold(body: ResponderHub())),
    );
    await tester.pumpAndSettle();
    expect(find.text('Pending incident reports'), findsOneWidget);
    service.roster.setAccess('community', true);
    await tester.pumpAndSettle();
    expect(find.text('Pending incident reports'), findsNothing);
    expect(find.text('Refresh incidents'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  for (final deniedAction in ['none', 'status', 'report']) {
    testWidgets(
      'service guards requests and recovers live access after $deniedAction denial',
      (tester) async {
        final original = debugDefaultTargetPlatformOverride;
        debugDefaultTargetPlatformOverride = TargetPlatform.linux;
        final calls = <http.Request>[];
        var tier = deniedAction == 'none' ? 'community' : 'clinical';
        final service = EmergencyAlertService.test(
          MockClient((request) async {
            calls.add(request);
            if (request.url.path.endsWith('/responder-access')) {
              return http.Response(
                jsonEncode({
                  'authorized': true,
                  'tier': tier,
                  'isQualifiedResponder': true,
                }),
                200,
              );
            }
            if (request.url.path.endsWith('/active')) {
              return http.Response(jsonEncode([incidentData(9)]), 200);
            }
            if (request.method == 'PATCH' ||
                request.url.path.contains('incident-report')) {
              if (deniedAction != 'none') {
                tier = 'community';
                return http.Response(
                  '{"code":"RESPONDER_ACTION_FORBIDDEN"}',
                  403,
                );
              }
              return http.Response('{}', 200);
            }
            return http.Response('{}', 200);
          }),
        );
        try {
          service.beginSession('fixture-token', 10);
          await tester.pump();
          await service.refreshAccess();
          await service.refreshIncidents(manual: true);
          calls.clear();
          if (deniedAction == 'status') {
            expect(
              await service.updateStatus(9, IncidentStatus.resolved),
              isNotNull,
            );
          } else if (deniedAction == 'report') {
            await expectLater(
              service.pendingIncidentReports(),
              throwsStateError,
            );
          }
          expect(service.roster.tier, 'community');
          expect(service.roster[9], isNotNull);
          final sent = calls.length;
          for (final status in [
            IncidentStatus.dispatched,
            IncidentStatus.resolved,
            IncidentStatus.falseAlarm,
          ]) {
            expect(await service.updateStatus(9, status), isNotNull);
          }
          await expectLater(service.pendingIncidentReports(), throwsStateError);
          await expectLater(
            service.readResponderRecords('/history'),
            throwsStateError,
          );
          expect(calls.length, sent);
          if (deniedAction == 'none') {
            expect(
              await service.updateStatus(9, IncidentStatus.acknowledged),
              isNull,
            );
            expect(service.roster[9]?.status, IncidentStatus.acknowledged);
          }
        } finally {
          service.endSession();
          await tester.pump();
          debugDefaultTargetPlatformOverride = original;
        }
      },
    );
  }

  test('deduplicates alerts, keeps every incident and mutes by alert ID', () {
    final state = roster();
    state.accept(incident(1));
    state.accept(incident(1));
    expect(state.incidents.map((alert) => alert.id), [1]);
    state.toggleMute(1);
    expect(state.shouldRing, isFalse);
    expect(state[1], isNotNull);
    state.accept(incident(2));
    expect(state.incidents.map((alert) => alert.id), [2, 1]);
    expect(state.shouldRing, isTrue);
    state.statusChanged(2, IncidentStatus.dispatched);
    expect(state.shouldRing, isFalse);
    expect(state[1], isNotNull);
  });

  test('reconnect snapshots preserve status events and ignore self-SOS', () {
    final state = roster();
    state.accept(incident(1));
    final requestedAt = state.revision;
    state.statusChanged(1, IncidentStatus.resolved);
    state.statusChanged(2, IncidentStatus.dispatched);
    state.accept(incident(3));
    state.accept(incident(4, user: 10));
    state.reconcile([
      incident(1),
      incident(2),
      incident(4, user: 10),
    ], requestedAt);
    expect(state[1], isNull);
    expect(state[2]?.status, IncidentStatus.dispatched);
    expect(state[3], isNotNull);
    expect(state[4], isNull);
    state.statusChanged(2, IncidentStatus.acknowledged);
    expect(state[2]?.status, IncidentStatus.dispatched);
  });

  test('Off duty allows snapshots on demand and access loss clears state', () {
    final state = roster();
    state.setMode(ResponderDutyMode.offDuty);
    state.accept(incident(1));
    expect(state.incidents, isEmpty);
    state.reconcile([incident(1), incident(2)], state.revision);
    expect(state.incidents, hasLength(2));
    expect(state.shouldRing, isFalse);
    state.setAccess(null, false);
    expect(state.incidents, isEmpty);
    state.reconcile([incident(1)], state.revision);
    expect(state.incidents, isEmpty);
  });

  testWidgets(
    'a cold notification tap resolves only after live access and roster checks',
    (tester) async {
      final originalPlatform = debugDefaultTargetPlatformOverride;
      debugDefaultTargetPlatformOverride = TargetPlatform.linux;
      try {
        final calls = <String>[];
        var allowed = true;
        final service = EmergencyAlertService.test(
          MockClient((request) async {
            calls.add(request.url.path);
            if (request.url.path.endsWith('responder-access')) {
              return http.Response(
                jsonEncode({
                  'authorized': allowed,
                  'tier': allowed ? 'community' : null,
                  'isQualifiedResponder': allowed,
                }),
                200,
              );
            }
            return http.Response(
              jsonEncode([
                {...incidentData(9), 'status': 'acknowledged'},
              ]),
              200,
            );
          }),
        );
        service.handleNotificationTap('9');
        service.setForeground(true);
        await tester.pump();
        expect(calls, isEmpty);
        expect(service.notificationOpen.value, isNull);

        service.beginSession('fixture-session', 10);
        await tester.pump();
        expect(calls.first, '/api/emergency/responder-access');
        expect(calls, contains('/api/emergency/active'));
        expect(service.notificationOpen.value, 9);
        service.notificationOpen.value = null;

        allowed = false;
        service.handleNotificationTap('9');
        await tester.pump();
        expect(service.notificationOpen.value, -1);
        expect(service.roster.incidents, isEmpty);
        service.endSession();
        await tester.pump();
      } finally {
        debugDefaultTargetPlatformOverride = originalPlatform;
      }
    },
  );

  testWidgets(
    'close actions require confirmation and block repeated submissions',
    (tester) async {
      final results = <IncidentStatus>[];
      final request = Completer<String?>();
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SosAlertActions(
              incident: incident(1),
              roster: roster()..setAccess('clinical', true),
              onUpdate: (_, status) {
                results.add(status);
                return request.future;
              },
            ),
          ),
        ),
      );
      final acknowledge = tester.getRect(
        find.widgetWithText(FilledButton, 'Acknowledge'),
      );
      final dispatch = tester.getRect(
        find.widgetWithText(OutlinedButton, 'Dispatch to location'),
      );
      final resolve = tester.getRect(
        find.widgetWithText(TextButton, 'Resolve'),
      );
      final falseAlarmBounds = tester.getRect(
        find.widgetWithText(TextButton, 'False alarm'),
      );
      expect(dispatch.top - acknowledge.bottom, greaterThanOrEqualTo(12));
      expect(resolve.top - dispatch.bottom, greaterThanOrEqualTo(12));
      expect(falseAlarmBounds.left - resolve.right, greaterThanOrEqualTo(12));
      await tester.tap(find.text('False alarm'));
      await tester.pumpAndSettle();
      expect(results, isEmpty);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(results, isEmpty);
      await tester.tap(find.text('Resolve'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Resolve incident'));
      await tester.pump(const Duration(milliseconds: 300));
      expect(results, [IncidentStatus.resolved]);
      final falseAlarm = tester.widget<TextButton>(
        find.widgetWithText(TextButton, 'False alarm'),
      );
      expect(falseAlarm.onPressed, isNull);
      request.complete(null);
      await tester.pumpAndSettle();
    },
  );

  testWidgets(
    'incident detail keeps mute reachable at 320 dp and 200 percent text',
    (tester) async {
      tester.view.physicalSize = const Size(320, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final service = EmergencyAlertService.test(
        MockClient((_) async => http.Response('', 500)),
      );
      service.roster
        ..begin(10)
        ..setAccess('community', true)
        ..accept(incident(9));
      await tester.pumpWidget(
        MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context)
                .copyWith(textScaler: TextScaler.linear(2)),
            child: child!,
          ),
          home: Scaffold(
            body: ResponderIncidentDetail(id: 9, service: service),
          ),
        ),
      );
      expect(find.byTooltip('Mute incident siren'), findsOneWidget);
      await tester.tap(find.byTooltip('Mute incident siren'));
      await tester.pumpAndSettle();
      expect(find.byTooltip('Unmute incident siren'), findsOneWidget);
      expect(find.text('Reported location'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}
