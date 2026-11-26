import 'dart:convert';

import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/screens/responder_qualification_screen.dart';

Map<String, dynamic> overview({bool approved = false}) => {
  'actor': {'userId': approved ? 5 : 12},
  'enforced': true,
  'access': {
    'authorized': approved,
    'appointmentLevel': approved ? 'community' : null,
    'expiresAt': approved ? '2027-11-24T00:00:00Z' : null,
  },
  'applications': [
    {
      'application_id': 1,
      'status': approved ? 'approved' : 'submitted',
      'application_type': 'initial',
      'created_at': '2026-11-24T00:00:00Z',
    },
  ],
  'appointments': approved
      ? [
          {'appointment_id': 1},
        ]
      : [],
  'notices': [],
};
Map<String, dynamic> detail({
  String status = 'submitted',
  String source = 'self',
  int revision = 1,
}) => {
  'application_id': 1,
  'status': status,
  'source': source,
  'application_type': 'initial',
  'revision': revision,
  'requested_level': 'community',
  'form': {
    'affiliation': 'PSU synthetic campus',
    'trainingHistory': 'Requesting clinic assessment',
  },
  'assessment': null,
  'responsibilities_accepted_at': source == 'nomination'
      ? null
      : '2026-11-24T00:00:00Z',
  'nomination_accepted_at': null,
  'decision_reason': null,
  'fixture_key': 'synthetic-demo',
  'evidence': [],
  'events': [],
};
void main() {
  testWidgets(
    'Rachelle sees pending application without responder access at large text scale',
    (tester) async {
      final client = MockClient(
        (request) async => http.Response(
          jsonEncode(request.url.path.endsWith('/me') ? overview() : detail()),
          200,
        ),
      );
      await tester.pumpWidget(
        MaterialApp(
          theme: ThemeData.dark(),
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context)
                .copyWith(textScaler: const TextScaler.linear(2)),
            child: child!,
          ),
          home: ResponderQualificationScreen(
            token: 'synthetic',
            client: client,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('No active responder appointment'), findsOneWidget);
      await tester.ensureVisible(
        find.textContaining('Application #1 · submitted'),
      );
      await tester.tap(find.textContaining('Application #1 · submitted'));
      await tester.pumpAndSettle();
      expect(find.text('Synthetic demo data'), findsOneWidget);
      expect(find.text('Submit for clinic review'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'Daniella keeps her approved responder status and can request renewal',
    (tester) async {
      var created = false;
      final client = MockClient((request) async {
        if (request.method == 'POST') {
          created = true;
          return http.Response(jsonEncode({'applicationId': 2}), 201);
        }
        if (request.url.path.endsWith('/me')) {
          return http.Response(jsonEncode(overview(approved: true)), 200);
        }
        return http.Response(
          jsonEncode({...detail(status: 'draft'), 'application_id': 2}),
          200,
        );
      });
      await tester.pumpWidget(
        MaterialApp(
          home: ResponderQualificationScreen(
            token: 'synthetic',
            client: client,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Qualified Responder'), findsOneWidget);
      await tester.tap(find.text('Request renewal'));
      await tester.pumpAndSettle();
      expect(created, isTrue);
      expect(find.text('Qualified Responder'), findsOneWidget);
      expect(find.text('Submit for clinic review'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'nomination acceptance sends responsibility consent and preserves server revision',
    (tester) async {
      Map<String, dynamic>? change;
      final client = MockClient((request) async {
        if (request.method == 'PATCH') {
          change = jsonDecode(request.body) as Map<String, dynamic>;
          return http.Response('{}', 200);
        }
        return http.Response(
          jsonEncode(
            request.url.path.endsWith('/me')
                ? overview()
                : detail(status: 'draft', source: 'nomination', revision: 3),
          ),
          200,
        );
      });
      await tester.pumpWidget(
        MaterialApp(
          home: ResponderQualificationScreen(
            token: 'synthetic',
            client: client,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.textContaining('Application #1 · submitted'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byType(Checkbox));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(Checkbox));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Accept nomination'));
      await tester.tap(find.text('Accept nomination'));
      await tester.pumpAndSettle();
      expect(change?['action'], 'accept_nomination');
      expect(change?['revision'], 3);
      expect(change?['acceptResponsibilities'], true);
    },
  );
}
