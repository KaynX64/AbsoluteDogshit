import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/main.dart';
import 'package:mobile/screens/login_screen.dart';
import 'package:mobile/screens/splash_screen.dart';
import 'package:mobile/theme/account_theme_controller.dart';

void main() {
  testWidgets('LeoVital app smoke test', (WidgetTester tester) async {
    FlutterSecureStorage.setMockInitialValues({});
    await tester.pumpWidget(const ValetudoMobileApp());
    await tester.pump();

    final app = tester.widget<MaterialApp>(find.byType(MaterialApp));
    expect(app.title, 'LeoVital HealthLink');
    expect(find.text('LeoVital'), findsOneWidget);
    expect(find.text('H E A L T H L I N K'), findsOneWidget);
    expect(find.text("Let's get started"), findsOneWidget);

    await tester.tap(find.text("Let's get started"));
    await tester.pumpAndSettle();
    expect(find.byType(LoginScreen), findsOneWidget);
  });

  testWidgets(
    'Starts validation promptly and clears a rejected saved session',
    (tester) async {
      const storage = FlutterSecureStorage();
      FlutterSecureStorage.setMockInitialValues({
        'jwt_token': 'saved-session',
        'user_data': '{"user_id":12,"roles":["STUDENT"]}',
      });
      final response = Completer<http.Response>();
      final client = MockClient((request) {
        expect(request.url.path, '/api/profile/me');
        expect(request.headers['Authorization'], 'Bearer saved-session');
        return response.future;
      });
      final controller = AccountThemeController(
        storage: storage,
        client: client,
      );
      addTearDown(controller.dispose);

      await tester.pumpWidget(
        ValetudoMobileApp(
          themeController: controller,
          home: SplashScreen(client: client),
        ),
      );
      await tester.pump();
      expect(controller.isBound, isTrue);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text("Let's get started"), findsNothing);

      response.complete(http.Response('{"error":"TOKEN_REVOKED"}', 401));
      await tester.pumpAndSettle();
      expect(controller.isBound, isFalse);
      expect(await storage.read(key: 'jwt_token'), isNull);
      expect(find.text("Let's get started"), findsOneWidget);
    },
  );
}
