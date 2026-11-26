import 'dart:async';
import 'dart:convert';

import 'package:material_ui/material_ui.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/main.dart';
import 'package:mobile/screens/change_password_screen.dart';
import 'package:mobile/screens/patient_portal_screen.dart';
import 'package:mobile/screens/responder_screen.dart';
import 'package:mobile/services/emergency_alert_service.dart';
import 'package:mobile/theme/account_theme_controller.dart';
import 'package:mobile/theme/app_palette.dart';
import 'package:mobile/widgets/account_settings_button.dart';

Map<String, dynamic> account(
  int id, {
  String mode = 'light',
  String preset = 'brand',
}) => {'user_id': id, 'theme_mode': mode, 'theme_preset': preset};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  test(
    'uses validated account values and saves the shared desktop API contract',
    () async {
      final requests = <http.Request>[];
      final controller = AccountThemeController(
        client: MockClient((request) async {
          requests.add(request);
          return http.Response('{}', 200);
        }),
      );
      addTearDown(controller.dispose);
      await controller.bindAccount(
        account(21, mode: 'dark', preset: 'sunrise'),
        'student-token',
      );
      expect(controller.selection.dark, isTrue);
      expect(controller.selection.preset, ThemePreset.sunrise);
      await controller.select(preset: ThemePreset.blossom);
      expect(requests.single.method, 'PUT');
      expect(requests.single.url.path, '/api/profile/theme');
      expect(requests.single.headers['Authorization'], 'Bearer student-token');
      expect(jsonDecode(requests.single.body), {
        'theme_mode': 'dark',
        'theme_preset': 'blossom',
      });
      expect(controller.state, ThemeSaveState.saved);
      final cache = await const FlutterSecureStorage().read(
        key: 'account_theme_21',
      );
      expect(jsonDecode(cache!)['pending'], isFalse);
      await controller.bindAccount(
        account(22, mode: 'unknown', preset: 'unknown'),
        'other-token',
      );
      expect(controller.selection.dark, isFalse);
      expect(controller.selection.preset, ThemePreset.brand);
    },
  );

  test('offline selection survives restart, retries, and stays scoped to its account', () async {
    final offline = AccountThemeController(
      client: MockClient((_) async => throw Exception('offline')),
    );
    await offline.bindAccount(account(21), 'student-token');
    await offline.select(dark: true, preset: ThemePreset.blossom);
    expect(offline.state, ThemeSaveState.pending);
    offline.dispose();

    final requests = <http.Request>[];
    final restored = AccountThemeController(
      client: MockClient((request) async {
        requests.add(request);
        return http.Response('{}', 200);
      }),
    );
    addTearDown(restored.dispose);
    await restored.bindAccount(account(22), 'other-token');
    expect(restored.selection.preset, ThemePreset.brand);
    expect(requests, isEmpty);
    await restored.bindAccount(account(21), 'student-token-new');
    await restored.retry();
    expect(restored.selection.dark, isTrue);
    expect(restored.selection.preset, ThemePreset.blossom);
    expect(restored.state, ThemeSaveState.saved);
    expect(
      requests.single.headers['Authorization'],
      'Bearer student-token-new',
    );
  });

  test(
    'serializes rapid changes and ignores a response after account switching',
    () async {
      final firstResponse = Completer<http.Response>();
      final started = Completer<void>();
      final requests = <http.Request>[];
      final controller = AccountThemeController(
        client: MockClient((request) async {
          requests.add(request);
          if (requests.length == 1) {
            started.complete();
            return firstResponse.future;
          }
          return http.Response('{}', 200);
        }),
      );
      addTearDown(controller.dispose);
      await controller.bindAccount(account(21), 'first-token');
      final first = controller.select(dark: true);
      await started.future;
      final second = controller.select(preset: ThemePreset.sunrise);
      firstResponse.complete(http.Response('{}', 200));
      await Future.wait([first, second]);
      expect(requests.length, 2);
      expect(jsonDecode(requests.last.body)['theme_preset'], 'sunrise');
      expect(controller.state, ThemeSaveState.saved);

      controller.reset();
      expect(controller.selection.dark, isFalse);
      await controller.bindAccount(
        account(22, preset: 'blossom'),
        'second-token',
      );
      expect(controller.selection.preset, ThemePreset.blossom);
      expect(controller.selection.dark, isFalse);
    },
  );

  test('late writes do not change a different signed-in account', () async {
    final response = Completer<http.Response>();
    final started = Completer<void>();
    final controller = AccountThemeController(
      client: MockClient((_) {
        started.complete();
        return response.future;
      }),
    );
    addTearDown(controller.dispose);
    await controller.bindAccount(account(21), 'first');
    final save = controller.select(dark: true);
    await started.future;
    controller.reset();
    await controller.bindAccount(account(22, preset: 'sunrise'), 'second');
    response.complete(http.Response('{}', 200));
    await save;
    expect(controller.selection.preset, ThemePreset.sunrise);
    expect(controller.selection.dark, isFalse);
    expect(controller.state, ThemeSaveState.saved);
  });

  test('refresh reads changes saved by desktop without overwriting newer local edits', () async {
    final response = Completer<http.Response>();
    final controller = AccountThemeController(
      client: MockClient((request) async {
        if (request.method == 'GET') return response.future;
        return http.Response('{}', 200);
      }),
    );
    addTearDown(controller.dispose);
    await controller.bindAccount(account(21), 'student');
    final refresh = controller.refresh();
    await controller.select(preset: ThemePreset.blossom);
    response.complete(
      http.Response(
        jsonEncode({'theme_mode': 'dark', 'theme_preset': 'sunrise'}),
        200,
      ),
    );
    await refresh;
    expect(controller.selection.preset, ThemePreset.blossom);
    expect(controller.selection.dark, isFalse);
  });

  test('saved local appearance survives an offline restart and refresh picks up desktop changes', () async {
    final controller = AccountThemeController(
      client: MockClient(
        (request) async => http.Response(
          request.method == 'GET'
              ? jsonEncode({'theme_mode': 'dark', 'theme_preset': 'sunrise'})
              : '{}',
          200,
        ),
      ),
    );
    addTearDown(controller.dispose);
    await controller.bindAccount(account(21), 'student');
    await controller.select(preset: ThemePreset.blossom);
    controller.reset();
    await controller.bindAccount(account(21), 'student', fromCache: true);
    expect(controller.selection.preset, ThemePreset.blossom);
    await controller.refresh();
    expect(controller.selection.dark, isTrue);
    expect(controller.selection.preset, ThemePreset.sunrise);
  });

  test(
    'all six appearances have contrasting primary labels and semantic surfaces',
    () {
      for (final preset in ThemePreset.values) {
        for (final dark in [false, true]) {
          final theme = buildAccountTheme(
            AccountThemeSelection(preset: preset, dark: dark),
          );
          final p = theme.colorScheme.primary.computeLuminance();
          final t = theme.colorScheme.onPrimary.computeLuminance();
          final ratio = ((p > t ? p : t) + 0.05) / ((p < t ? p : t) + 0.05);
          expect(
            ratio,
            greaterThanOrEqualTo(4.5),
            reason: '$preset / dark=$dark',
          );
          expect(theme.brightness, dark ? Brightness.dark : Brightness.light);
          expect(
            AppPalette(theme).color(0xFF191C1A),
            theme.colorScheme.onSurface,
          );
        }
      }
    },
  );

  testWidgets(
    'the Responder Hub is below the badge on the health pass and profile',
    (tester) async {
      tester.view.physicalSize = const Size(800, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final roster = EmergencyAlertService().roster;
      roster.begin(21);
      roster.setAccess('clinical', false);
      addTearDown(() => roster.begin(null));
      await tester.pumpWidget(
        ValetudoMobileApp(
          home: PatientPortalScreen(
            user: {
              ...account(21),
              'first_name': 'Test',
              'roles': ['NURSE'],
            },
          ),
        ),
      );
      final badge = find.text('Qualified Responder');
      final hub = find.text('Responder Hub · On duty');
      expect(badge, findsNothing);
      expect(hub, findsOneWidget);

      roster.setAccess('clinical', true);
      await tester.pump();
      expect(find.text('Campus health pass'), findsOneWidget);
      expect(badge, findsOneWidget);
      expect(hub, findsOneWidget);
      expect(
        tester.getTopLeft(hub).dy,
        greaterThan(tester.getBottomLeft(badge).dy),
      );

      await tester.tap(find.text('Profile'));
      await tester.pump();
      expect(find.text('Campus emergency support'), findsOneWidget);
      expect(badge, findsOneWidget);
      expect(
        tester.getTopLeft(hub).dy,
        greaterThan(tester.getBottomLeft(badge).dy),
      );
      await tester.tap(hub);
      await tester.pumpAndSettle();
      expect(find.text('Responder Hub'), findsOneWidget);
      await tester.pageBack();
      await tester.pumpAndSettle();

      roster.setAccess('clinical', false);
      await tester.pump();
      expect(badge, findsNothing);
      expect(hub, findsOneWidget);
    },
  );

  for (final responder in [false, true]) {
    testWidgets(
      '${responder ? 'Responder' : 'Patient'} gear opens the shared drawer and password returns there',
      (tester) async {
        tester.view.physicalSize = responder
            ? const Size(390, 844)
            : const Size(800, 900);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final controller = AccountThemeController(
          client: MockClient((_) async => http.Response('{}', 200)),
        );
        addTearDown(controller.dispose);
        await controller.bindAccount(account(21), 'student');
        final user = {
          ...account(21),
          'first_name': 'Test',
          'roles': [responder ? 'EMERGENCY_RESPONDER' : 'STUDENT'],
        };
        await tester.pumpWidget(
          ValetudoMobileApp(
            themeController: controller,
            home: responder
                ? ResponderScreen(user: user)
                : PatientPortalScreen(user: user),
          ),
        );
        final gear = find.byTooltip('Account settings');
        expect(tester.getSize(gear).shortestSide, greaterThanOrEqualTo(48));
        expect(
          find.widgetWithIcon(IconButton, Icons.settings_outlined),
          findsOneWidget,
        );
        await tester.tap(gear);
        await tester.pumpAndSettle();
        expect(find.byType(BottomSheet), findsOneWidget);
        expect(find.byType(AccountSettingsSheet), findsOneWidget);
        expect(
          tester.getTopLeft(find.byType(AccountSettingsSheet)).dy,
          greaterThan(0),
        );
        expect(find.text('Appearance'), findsOneWidget);
        expect(find.byKey(const ValueKey('appearance-preview')), findsNothing);
        expect(find.text('Preview'), findsNothing);
        await tester.ensureVisible(find.text('Blossom'));
        await tester.tap(find.text('Blossom'));
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.text('Dark'));
        await tester.tap(find.text('Dark'));
        await tester.pumpAndSettle();
        expect(controller.selection.preset, ThemePreset.blossom);
        expect(controller.selection.dark, isTrue);
        final app = tester.widget<MaterialApp>(find.byType(MaterialApp));
        expect(app.theme!.brightness, Brightness.dark);
        expect(find.text('Saved to your account'), findsOneWidget);
        await tester.ensureVisible(find.text('Change password'));
        await tester.tap(find.text('Change password'));
        await tester.pumpAndSettle();
        expect(find.byType(ChangePasswordScreen), findsOneWidget);
        await tester.pageBack();
        await tester.pumpAndSettle();
        expect(find.byType(AccountSettingsSheet), findsOneWidget);
        await tester.tap(find.byTooltip('Close settings'));
        await tester.pumpAndSettle();
        expect(find.byType(AccountSettingsSheet), findsNothing);
        await tester.pumpWidget(const SizedBox());
        await tester.pump();
      },
    );
  }
}
