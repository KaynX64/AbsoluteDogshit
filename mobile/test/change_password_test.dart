import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/main.dart';
import 'package:mobile/screens/change_password_screen.dart';
import 'package:mobile/screens/login_screen.dart';
import 'package:mobile/theme/account_theme_controller.dart';

const storage = FlutterSecureStorage();
const current = 'Current123!';
const update = 'NewChoice1';
const longUpdate = 'longerpassphrase';

Finder get field => find.byType(TextFormField);
Finder get submit => find.text('Update password');

Future<AccountThemeController> openForm(
  WidgetTester tester,
  MockClient client, {
  double textScale = 1,
}) async {
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
  final controller = AccountThemeController(client: client);
  addTearDown(controller.dispose);
  await controller.bindAccount({
    'user_id': 21,
    'theme_mode': 'dark',
    'theme_preset': 'blossom',
  }, 'session');
  await tester.pumpWidget(
    ValetudoMobileApp(
      themeController: controller,
      home: Builder(
        builder: (context) => Scaffold(
          body: TextButton(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => ChangePasswordScreen(
                  client: client,
                  deviceToken: () async => 'this-device',
                ),
              ),
            ),
            child: const Text('Open password form'),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('Open password form'));
  await tester.pumpAndSettle();
  return controller;
}

Future<void> fill(
  WidgetTester tester,
  String password, {
  String? confirmation,
}) async {
  for (final (index, value) in [
    current,
    password,
    confirmation ?? password,
  ].indexed) {
    await tester.ensureVisible(field.at(index));
    await tester.enterText(field.at(index), value);
  }
}

Future<void> pressSubmit(WidgetTester tester) async {
  await tester.ensureVisible(submit);
  await tester.tap(submit);
  await tester.pumpAndSettle();
}

FocusNode focus(WidgetTester tester, int index) =>
    tester.widget<EditableText>(find.byType(EditableText).at(index)).focusNode;

void main() {
  setUp(
    () => FlutterSecureStorage.setMockInitialValues({
      'jwt_token': 'session',
      'user_data': '{"user_id":21}',
    }),
  );

  testWidgets(
    '8–11 characters need three groups, with one value validated and sent',
    (tester) async {
      final requests = <http.Request>[];
      await openForm(
        tester,
        MockClient((request) async {
          requests.add(request);
          return http.Response('{}', 200);
        }),
      );
      expect(find.textContaining('For 8–11 characters'), findsOneWidget);
      await fill(tester, 'abcdefgh');
      await pressSubmit(tester);
      expect(find.textContaining('Use at least 3 types'), findsOneWidget);
      expect(focus(tester, 1).hasFocus, isTrue);

      await fill(tester, ' $update');
      await pressSubmit(tester);
      expect(find.textContaining('Remove spaces'), findsOneWidget);
      await fill(tester, update, confirmation: 'different');
      await pressSubmit(tester);
      expect(find.text('The new passwords do not match.'), findsOneWidget);
      expect(focus(tester, 2).hasFocus, isTrue);
      expect(requests, isEmpty);

      await fill(tester, update);
      await pressSubmit(tester);
      expect(requests, hasLength(1));
      expect(requests.single.url.path, '/api/auth/change-password');
      expect(requests.single.headers['authorization'], 'Bearer session');
      expect(jsonDecode(requests.single.body), {
        'currentPassword': current,
        'newPassword': update,
        'fcm_token': 'this-device',
      });
      expect(find.byType(LoginScreen), findsOneWidget);
    },
  );

  testWidgets(
    'passphrase succeeds and reauth preserves the account theme cache',
    (tester) async {
      final controller = await openForm(
        tester,
        MockClient((request) async {
          expect(jsonDecode(request.body)['newPassword'], longUpdate);
          return http.Response('{}', 200);
        }),
      );
      await fill(tester, longUpdate);
      await pressSubmit(tester);
      expect(
        find.text('Password changed. Sign in with your new password.'),
        findsOneWidget,
      );
      expect(
        Navigator.of(tester.element(find.byType(LoginScreen))).canPop(),
        isFalse,
      );
      expect(controller.isBound, isFalse);
      expect(controller.selection.dark, isFalse);
      expect(await storage.read(key: 'jwt_token'), isNull);
      expect(await storage.read(key: 'user_data'), isNull);
      final cached = jsonDecode((await storage.read(key: 'account_theme_21'))!);
      expect(cached['theme_mode'], 'dark');
      expect(cached['theme_preset'], 'blossom');
    },
  );

  testWidgets(
    'password visibility is per field and targets remain usable with large text',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(320, 640);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await openForm(
        tester,
        MockClient((_) async => http.Response('{}', 200)),
        textScale: 2,
      );
      final toggle = find.byTooltip('Show current password');
      expect(tester.getSize(toggle).shortestSide, greaterThanOrEqualTo(48));
      await tester.tap(toggle);
      await tester.pump();
      expect(
        tester
            .widgetList<EditableText>(find.byType(EditableText))
            .map((input) => input.obscureText),
        [false, true, true],
      );
      expect(find.byTooltip('Hide current password'), findsOneWidget);
      expect(
        tester
            .widgetList<EditableText>(find.byType(EditableText))
            .map((input) => input.autofillHints?.first),
        ['password', 'newPassword', 'newPassword'],
      );
      await tester.ensureVisible(submit);
      expect(
        tester.getSize(find.byType(FilledButton)).height,
        greaterThanOrEqualTo(48),
      );
      await pressSubmit(tester);
      expect(focus(tester, 0).hasFocus, isTrue);
      tester.view.viewInsets = const FakeViewPadding(bottom: 280);
      addTearDown(tester.view.resetViewInsets);
      await tester.pumpAndSettle();
      await tester.testTextInput.receiveAction(TextInputAction.next);
      await tester.pumpAndSettle();
      expect(focus(tester, 1).hasFocus, isTrue);
      await tester.testTextInput.receiveAction(TextInputAction.next);
      await tester.pumpAndSettle();
      expect(focus(tester, 2).hasFocus, isTrue);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('server errors remain next to the relevant password field', (
    tester,
  ) async {
    var calls = 0;
    await openForm(
      tester,
      MockClient((_) async {
        calls++;
        return calls == 1
            ? http.Response('{"error":"Incorrect current password."}', 400)
            : http.Response(
                '{"code":"WEAK_PASSWORD","issues":["Choose a less common password."]}',
                400,
              );
      }),
    );
    await fill(tester, update);
    await pressSubmit(tester);
    expect(find.text('Current password is incorrect.'), findsOneWidget);
    expect(focus(tester, 0).hasFocus, isTrue);

    await tester.enterText(field.first, 'ActualCurrent123!');
    await tester.pump();
    await pressSubmit(tester);
    expect(find.text('Choose a less common password.'), findsOneWidget);
    expect(focus(tester, 1).hasFocus, isTrue);
    expect(find.text('Current password is incorrect.'), findsNothing);
    expect(await storage.read(key: 'jwt_token'), 'session');
  });

  testWidgets(
    'waiting request cannot be duplicated and timeout gives persistent recovery',
    (tester) async {
      var calls = 0;
      final pending = Completer<http.Response>();
      await openForm(
        tester,
        MockClient((_) {
          calls++;
          return pending.future;
        }),
      );
      await fill(tester, update);
      await pressSubmit(tester);
      final saving = find.widgetWithText(FilledButton, 'Updating password…');
      expect(tester.widget<FilledButton>(saving).onPressed, isNull);
      expect(calls, 1);
      await tester.pump(const Duration(seconds: 15));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('We couldn’t confirm the change'),
        findsOneWidget,
      );
      expect(submit, findsOneWidget);
      expect(calls, 1);
      expect(await storage.read(key: 'jwt_token'), 'session');
      pending.complete(http.Response('{}', 200));
      await tester.pumpAndSettle();
      expect(find.byType(ChangePasswordScreen), findsOneWidget);
    },
  );
}
