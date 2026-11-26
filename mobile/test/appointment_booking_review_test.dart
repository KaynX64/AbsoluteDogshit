import 'dart:async';
import 'dart:convert';

import 'package:material_ui/material_ui.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/screens/consultation_scheduler_screen.dart';
import 'package:mobile/theme/account_theme_controller.dart';
import 'package:mobile/theme/app_palette.dart';
import 'package:mobile/widgets/appointment_booking_review.dart';

import 'mobile_appearance_test.dart' show expectReadable;

class _BookingFixture {
  final posts = <Map<String, dynamic>>[];
  final response = Completer<http.Response>();
  String? date;
  late final client = MockClient((request) async {
    if (request.method == 'POST') {
      posts.add(jsonDecode(request.body) as Map<String, dynamic>);
      return response.future;
    }
    if (request.url.path.endsWith('/doctors')) {
      return http.Response(
        jsonEncode([
          {
            'user_id': 7,
            'first_name': 'Carmela',
            'last_name': 'Reyes',
            'specialty': 'Dentistry & Oral Health',
          },
        ]),
        200,
      );
    }
    if (request.url.path.endsWith('/slots')) {
      date = request.url.queryParameters['date'];
      return http.Response(
        jsonEncode({
          'rules': {
            'appointmentTypes': ['Dental Checkup'],
          },
          'slots': [
            {
              'time': '08:00',
              'availabilityByType': {
                'Dental Checkup': {'available': true},
              },
            },
          ],
        }),
        200,
      );
    }
    return http.Response('[]', 200);
  });
}

Future<void> _openReview(WidgetTester tester, _BookingFixture fixture) async {
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(fixture.client.close);
  await tester.pumpWidget(
    MaterialApp(
      theme: buildAccountTheme(const AccountThemeSelection()),
      home: Scaffold(
        body: SafeArea(
          child: ConsultationSchedulerScreen(client: fixture.client),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  final scroll = find.byType(Scrollable).first;
  await tester.scrollUntilVisible(
    find.text('8:00 AM'),
    180,
    scrollable: scroll,
  );
  await tester.pumpAndSettle();
  await tester.tap(find.text('8:00 AM'));
  await tester.pumpAndSettle();
  await tester.scrollUntilVisible(
    find.byType(TextField),
    180,
    scrollable: scroll,
  );
  await tester.pumpAndSettle();
  await tester.enterText(
    find.byType(TextField),
    '  Sensitive teeth when drinking cold water.  ',
  );
  await tester.testTextInput.receiveAction(TextInputAction.done);
  await tester.scrollUntilVisible(
    find.text('Review appointment'),
    180,
    scrollable: scroll,
  );
  await tester.pumpAndSettle();
  await tester.tap(find.text('Review appointment'));
  await tester.pumpAndSettle();
  expect(find.byType(AppointmentBookingReview), findsOneWidget);
  expect(fixture.posts, isEmpty);
}

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  testWidgets(
    'review summarizes the selection; edit, back and dismissal preserve the draft',
    (tester) async {
      final fixture = _BookingFixture();
      await _openReview(tester, fixture);
      final dialog = find.byType(AppointmentBookingReview);
      for (final label in [
        'Dr. Carmela Reyes',
        'Dentistry & Oral Health',
        'Dental Checkup',
        '8:00 AM',
        'PSU Lingayen Campus Infirmary',
        'Sensitive teeth when drinking cold water.',
      ]) {
        expect(
          find.descendant(of: dialog, matching: find.text(label)),
          findsOneWidget,
        );
      }
      final summary = tester.widget<AppointmentBookingReview>(dialog);
      expect(summary.date, DateTime.parse(fixture.date!));
      await tester.ensureVisible(find.text('Edit details'));
      await tester.tap(find.text('Edit details'));
      await tester.pumpAndSettle();
      expect(find.byType(AppointmentBookingReview), findsNothing);
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller!.text,
        '  Sensitive teeth when drinking cold water.  ',
      );
      expect(fixture.posts, isEmpty);

      for (final useBack in [true, false]) {
        await tester.tap(find.text('Review appointment'));
        await tester.pumpAndSettle();
        if (useBack) {
          await tester.binding.handlePopRoute();
        } else {
          await tester.tapAt(const Offset(4, 4));
        }
        await tester.pumpAndSettle();
        expect(find.byType(AppointmentBookingReview), findsNothing);
        expect(fixture.posts, isEmpty);
      }
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'explicit confirmation sends reviewed values once and recovers from a conflict',
    (tester) async {
      final fixture = _BookingFixture();
      await _openReview(tester, fixture);
      await tester.ensureVisible(find.text('Confirm appointment'));
      await tester.tap(find.text('Confirm appointment'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(fixture.posts, [
        {
          'doctor_user_id': 7,
          'date_time': '${fixture.date} 08:00:00',
          'appointment_type': 'Dental Checkup',
          'notes': 'Sensitive teeth when drinking cold water.',
        },
      ]);
      final button = tester.widget<ElevatedButton>(
        find.ancestor(
          of: find.byType(CircularProgressIndicator),
          matching: find.byType(ElevatedButton),
        ),
      );
      expect(button.onPressed, isNull);
      fixture.response.complete(
        http.Response('{"error":"This time is no longer available."}', 409),
      );
      await tester.pumpAndSettle();
      expect(find.text('This time is no longer available.'), findsOneWidget);
      expect(fixture.posts, hasLength(1));
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller!.text,
        contains('Sensitive teeth'),
      );
      await tester.scrollUntilVisible(
        find.text('8:00 AM'),
        -180,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('8:00 AM'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Review appointment'),
        180,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Review appointment'));
      await tester.pumpAndSettle();
      expect(find.byType(AppointmentBookingReview), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'availability refresh during review requires a new slot selection',
    (tester) async {
      final fixture = _BookingFixture();
      await _openReview(tester, fixture);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Confirm appointment'));
      await tester.tap(find.text('Confirm appointment'));
      await tester.pumpAndSettle();
      expect(fixture.posts, isEmpty);
      expect(
        find.text(
          'Availability has updated. Please select a time and review your appointment again.',
        ),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    },
  );

  for (final preset in ThemePreset.values) {
    for (final dark in [false, true]) {
      testWidgets(
        'review is readable at 320dp and 200% text in ${preset.name} ${dark ? 'dark' : 'light'}',
        (tester) async {
          tester.view.physicalSize = const Size(320, 640);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          var result = false;
          await tester.pumpWidget(
            MaterialApp(
              theme: buildAccountTheme(
                AccountThemeSelection(preset: preset, dark: dark),
              ),
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(context)
                    .copyWith(textScaler: TextScaler.linear(2)),
                child: child!,
              ),
              home: Scaffold(
                body: Builder(
                  builder: (context) => TextButton(
                    onPressed: () async {
                      result =
                          await showDialog<bool>(
                            context: context,
                            builder: (_) => AppointmentBookingReview(
                              clinician:
                                  'Dr. Carmela Reyes with a longer family name',
                              specialty: 'Dentistry & Oral Health',
                              purpose: 'Dental Checkup',
                              date: DateTime(2026, 11, 17),
                              time: '8:00 AM',
                              notes: List.filled(
                                12,
                                'Sensitive teeth when drinking cold water.',
                              ).join('\n'),
                            ),
                          ) ??
                          false;
                    },
                    child: const Text('Open review'),
                  ),
                ),
              ),
            ),
          );
          await tester.tap(find.text('Open review'));
          await tester.pumpAndSettle();
          for (final label in [
            'Review your appointment',
            'Your care team',
            'Dr. Carmela Reyes with a longer family name',
            'Visit purpose',
            'Dental Checkup',
            'Date',
            'Time',
            '8:00 AM',
            'Location',
            'PSU Lingayen Campus Infirmary',
            'Notes for your care team',
          ]) {
            expectReadable(tester, find.text(label), dark: dark);
          }
          await tester.ensureVisible(find.text('Edit details'));
          await tester.pumpAndSettle();
          expect(find.text('Edit details').hitTestable(), findsOneWidget);
          await tester.ensureVisible(find.text('Confirm appointment'));
          await tester.pumpAndSettle();
          final confirm = find.widgetWithText(
            FilledButton,
            'Confirm appointment',
          );
          expect(tester.getSize(confirm).height, greaterThanOrEqualTo(48));
          final colors = Theme.of(tester.element(confirm)).colorScheme;
          expect(
            colors.onPrimary.computeLuminance(),
            isNot(colors.primary.computeLuminance()),
          );
          expect(tester.takeException(), isNull);
          await tester.tap(confirm);
          await tester.pumpAndSettle();
          expect(result, isTrue);
        },
      );
    }
  }
}
