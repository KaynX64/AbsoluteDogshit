import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/main.dart';
import 'package:mobile/screens/consultation_scheduler_screen.dart';
import 'package:mobile/theme/account_theme_controller.dart';
import 'package:mobile/theme/app_palette.dart';
import 'package:mobile/widgets/account_settings_button.dart';

http.Client bookingFixtureClient() => MockClient((request) async {
  if (request.url.path.endsWith('/doctors')) {
    return http.Response(
      jsonEncode([
        {
          'user_id': 1,
          'first_name': 'Carmela',
          'last_name': 'Reyes',
          'specialty': 'Dentistry & Oral Health',
        },
        {
          'user_id': 2,
          'first_name': 'Juan',
          'last_name': 'Mata',
          'specialty': 'General Medicine',
        },
      ]),
      200,
    );
  }
  if (request.url.path.endsWith('/slots')) {
    const purposes = [
      'Dental Checkup',
      'Tooth Extraction',
      'Oral Prophylaxis',
      'Toothache Emergency',
    ];
    return http.Response(
      jsonEncode({
        'rules': {'appointmentTypes': purposes},
        'slots': [
          for (final time in ['08:00', '08:15', '13:00', '13:15'])
            {
              'time': time,
              'availabilityByType': {
                for (final purpose in purposes)
                  purpose: {'available': time != '08:15'},
              },
            },
        ],
      }),
      200,
    );
  }
  return http.Response('[]', 200);
});

double contrastRatio(Color foreground, Color background) {
  final first = Color.alphaBlend(foreground, background).computeLuminance();
  final second = background.computeLuminance();
  return ((first > second ? first : second) + 0.05) /
      ((first < second ? first : second) + 0.05);
}

/// Check the actual rendered card behind a label, including animated choices.
Color paintedBackground(WidgetTester tester, Finder label) {
  Color? background;
  tester.element(label).visitAncestorElements((element) {
    final widget = element.widget;
    if (widget is DecoratedBox && widget.decoration is BoxDecoration) {
      background = (widget.decoration as BoxDecoration).color;
    } else if (widget is Material) {
      background = widget.color;
    }
    return background == null || background!.a == 0;
  });
  return background!;
}

void expectReadable(WidgetTester tester, Finder label, {required bool dark}) {
  final text = tester.widget<Text>(label);
  final background = paintedBackground(tester, label);
  final foreground =
      text.style?.color ??
      DefaultTextStyle.of(tester.element(label)).style.color!;
  expect(
    contrastRatio(foreground, background),
    greaterThanOrEqualTo(4.5),
    reason: text.data,
  );
  if (dark) {
    expect(
      background,
      isNot(Colors.white),
      reason: 'Unconverted white fill behind ${text.data}',
    );
  }
}

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  for (final initiallyDark in [false, true]) {
    testWidgets(
      'open settings surface follows mode and palette changes from ${initiallyDark ? 'dark' : 'light'}',
      (tester) async {
        tester.view.physicalSize = const Size(390, 844);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final controller = AccountThemeController(
          client: MockClient((_) async => http.Response('{}', 200)),
        );
        addTearDown(controller.dispose);
        await controller.bindAccount({
          'user_id': 1,
          'theme_mode': initiallyDark ? 'dark' : 'light',
        }, 'fixture');
        await tester.pumpWidget(
          ValetudoMobileApp(
            themeController: controller,
            home: const Scaffold(body: AccountSettingsButton(initials: 'DM')),
          ),
        );
        await tester.tap(find.byTooltip('Account settings'));
        await tester.pumpAndSettle();
        final sheet = tester.element(find.byType(AccountSettingsSheet));

        void expectCurrentSurface() {
          expect(
            tester.element(find.byType(AccountSettingsSheet)),
            same(sheet),
          );
          final title = find.text('Account settings');
          final scheme = Theme.of(tester.element(title)).colorScheme;
          expect(
            paintedBackground(tester, title),
            scheme.surface,
            reason: 'The open sheet must not retain the surface captured when it opened.',
          );
          for (final label in [
            'Account settings',
            'Appearance',
            'Appearance and security',
            'Choose how your app looks.',
            'Color palette',
            'Security',
          ]) {
            expectReadable(
              tester,
              find.text(label),
              dark: controller.selection.dark,
            );
          }
          expect(tester.takeException(), isNull);
        }

        expectCurrentSurface();
        for (final preset in [
          ThemePreset.sunrise,
          ThemePreset.blossom,
          ThemePreset.brand,
        ]) {
          await tester.ensureVisible(
            find.byKey(ValueKey('theme-preset-${preset.name}')),
          );
          await tester.tap(find.byKey(ValueKey('theme-preset-${preset.name}')));
          await tester.pumpAndSettle();
          expect(controller.selection.preset, preset);
          expectCurrentSurface();
          for (final dark in [!initiallyDark, initiallyDark]) {
            final option = find.byKey(
              ValueKey('theme-mode-${dark ? 'dark' : 'light'}'),
            );
            await tester.ensureVisible(option);
            await tester.tap(option);
            await tester.pumpAndSettle();
            expect(controller.selection.dark, dark);
            expectCurrentSurface();
          }
        }
        await tester.ensureVisible(find.byTooltip('Close settings'));
        await tester.tap(find.byTooltip('Close settings'));
        await tester.pumpAndSettle();
        expect(find.byType(AccountSettingsSheet), findsNothing);
      },
    );
  }

  for (final preset in ThemePreset.values) {
    for (final dark in [false, true]) {
      testWidgets(
        'booking choices are readable in ${preset.name} ${dark ? 'dark' : 'light'}',
        (tester) async {
          tester.view.physicalSize = const Size(390, 844);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          final client = bookingFixtureClient();
          addTearDown(client.close);
          await tester.pumpWidget(
            MaterialApp(
              theme: buildAccountTheme(
                AccountThemeSelection(preset: preset, dark: dark),
              ),
              home: Scaffold(
                body: SafeArea(
                  child: ConsultationSchedulerScreen(client: client),
                ),
              ),
            ),
          );
          await tester.pumpAndSettle();
          expectReadable(tester, find.text('Book a consultation'), dark: dark);
          expectReadable(tester, find.text('Dr. Carmela Reyes'), dark: dark);
          expectReadable(tester, find.text('Dr. Juan Mata'), dark: dark);
          expectReadable(tester, find.text('Dental Checkup'), dark: dark);
          expectReadable(tester, find.text('Tooth Extraction'), dark: dark);

          final scroll = find.byType(Scrollable).first;
          await tester.scrollUntilVisible(
            find.text('Choose a date'),
            220,
            scrollable: scroll,
          );
          await tester.pumpAndSettle();
          for (final weekday in tester.widgetList<Text>(
            find.textContaining(RegExp(r'^(MON|TUE|WED|THU|FRI)$')),
          )) {
            expectReadable(tester, find.byWidget(weekday), dark: dark);
          }
          await tester.tap(find.byIcon(Icons.arrow_drop_down));
          await tester.pumpAndSettle();
          final pickerContext = tester.element(find.byType(DatePickerDialog));
          expect(
            Theme.of(pickerContext).brightness,
            dark ? Brightness.dark : Brightness.light,
          );
          await tester.tap(find.text('Cancel'));
          await tester.pumpAndSettle();

          await tester.scrollUntilVisible(
            find.text('8:15 AM'),
            180,
            scrollable: scroll,
          );
          await tester.pumpAndSettle();
          expectReadable(tester, find.text('8:00 AM'), dark: dark);
          expectReadable(tester, find.text('8:15 AM'), dark: dark);
          await tester.tap(find.text('8:00 AM'));
          await tester.pumpAndSettle();
          expectReadable(tester, find.text('8:00 AM'), dark: dark);
          await tester.scrollUntilVisible(
            find.text('1:00 PM'),
            180,
            scrollable: scroll,
          );
          await tester.pumpAndSettle();
          expectReadable(tester, find.text('1:00 PM'), dark: dark);
          expect(tester.takeException(), isNull);
        },
      );
    }
  }

  testWidgets(
    'settings previews fit a small phone with larger text and remain interactive',
    (tester) async {
      tester.view.physicalSize = const Size(360, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final controller = AccountThemeController(
        client: MockClient((_) async => http.Response('{}', 200)),
      );
      addTearDown(controller.dispose);
      await controller.bindAccount({
        'user_id': 1,
        'theme_mode': 'dark',
      }, 'fixture');
      await tester.pumpWidget(
        AccountThemeScope(
          controller: controller,
          child: ListenableBuilder(
            listenable: controller,
            builder: (context, _) => MaterialApp(
              theme: buildAccountTheme(controller.selection),
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(context)
                    .copyWith(textScaler: TextScaler.linear(1.4)),
                child: child!,
              ),
              home: const Scaffold(body: AccountSettingsButton(initials: 'DM')),
            ),
          ),
        ),
      );
      await tester.tap(find.byTooltip('Account settings'));
      await tester.pumpAndSettle();
      for (final preset in ThemePreset.values) {
        await tester.ensureVisible(
          find.byKey(ValueKey('theme-preset-${preset.name}')),
        );
        await tester.tap(find.byKey(ValueKey('theme-preset-${preset.name}')));
        await tester.pumpAndSettle();
        expect(controller.selection.preset, preset);
        expect(tester.takeException(), isNull);
      }
      await tester.ensureVisible(find.text('Change password'));
      expect(find.text('Change password'), findsOneWidget);
    },
  );
}
