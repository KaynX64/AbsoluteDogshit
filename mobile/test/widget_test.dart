import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:material_ui/material_ui.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/main.dart';
import 'package:mobile/screens/login_screen.dart';
import 'package:mobile/screens/patient_portal_screen.dart';
import 'package:mobile/screens/splash_screen.dart';
import 'package:mobile/services/emergency_alert_service.dart';
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
    final fields = find.byType(TextFormField);
    final passwordSignIn = find.widgetWithText(ElevatedButton, 'Sign in');
    final googleSignIn = find.widgetWithText(
      OutlinedButton,
      'Sign in with Google',
    );
    final googleLogo = find.descendant(
      of: googleSignIn,
      matching: find.byType(Image),
    );
    expect(
      tester.widget<Image>(googleLogo).image,
      const AssetImage('assets/google_sign_in_logo.png'),
    );
    expect(fields, findsNWidgets(2));
    expect(
      tester.getBottomLeft(fields.last).dy,
      lessThan(tester.getTopLeft(passwordSignIn).dy),
    );
    expect(
      tester.getBottomLeft(passwordSignIn).dy,
      lessThan(tester.getTopLeft(googleSignIn).dy),
    );
  });

  testWidgets('Validates and submits seeded credentials to synthetics', (
    tester,
  ) async {
    final response = Completer<http.Response>();
    final requests = <http.Request>[];
    final client = MockClient((request) {
      requests.add(request);
      return response.future;
    });
    await tester.pumpWidget(MaterialApp(home: LoginScreen(client: client)));
    final fields = find.byType(TextFormField);
    final passwordSignIn = find.byType(ElevatedButton);
    final googleSignIn = find.byType(OutlinedButton);
    await tester.ensureVisible(passwordSignIn);
    await tester.tap(passwordSignIn);
    await tester.pump();
    expect(requests, isEmpty);
    expect(find.text('Enter your email.'), findsOneWidget);
    expect(find.text('Enter your password.'), findsOneWidget);

    await tester.enterText(fields.first, '  student@psu.edu.ph ');
    await tester.enterText(fields.last, ' test password ');
    final passwordInput = find.descendant(
      of: fields.last,
      matching: find.byType(EditableText),
    );
    expect(tester.widget<EditableText>(passwordInput).obscureText, isTrue);
    await tester.tap(find.byTooltip('Show password'));
    await tester.pump();
    expect(tester.widget<EditableText>(passwordInput).obscureText, isFalse);

    await tester.ensureVisible(passwordSignIn);
    await tester.tap(passwordSignIn);
    await tester.pump();
    expect(requests.single.method, 'POST');
    expect(requests.single.url.path, '/api/auth/mobile/synthetics');
    expect(jsonDecode(requests.single.body), {
      'email': 'student@psu.edu.ph',
      'password': ' test password ',
    });
    expect(tester.widget<ElevatedButton>(passwordSignIn).onPressed, isNull);
    expect(tester.widget<OutlinedButton>(googleSignIn).onPressed, isNull);
    expect(
      find.descendant(
        of: passwordSignIn,
        matching: find.byType(CircularProgressIndicator),
      ),
      findsOneWidget,
    );
    expect(find.text('Sign in with Google'), findsOneWidget);

    response.complete(http.Response('{"error":"Incorrect credentials."}', 401));
    await tester.pumpAndSettle();
    expect(find.text('Incorrect credentials.'), findsOneWidget);
    expect(tester.widget<ElevatedButton>(passwordSignIn).onPressed, isNotNull);
    expect(tester.widget<OutlinedButton>(googleSignIn).onPressed, isNotNull);
  });

  testWidgets('Google cancellation and retry work with empty password fields', (
    tester,
  ) async {
    final picker = Completer<String?>();
    var pickerAttempts = 0;
    final requests = <http.Request>[];
    final client = MockClient((request) async {
      requests.add(request);
      return http.Response('{"error":"Google sign-in was rejected."}', 401);
    });
    await tester.pumpWidget(
      MaterialApp(
        home: LoginScreen(
          client: client,
          googleIdToken: () async {
            if (++pickerAttempts == 1) return picker.future;
            return 'fixture-google-token';
          },
        ),
      ),
    );
    final googleSignIn = find.byType(OutlinedButton);
    final passwordSignIn = find.byType(ElevatedButton);
    await tester.ensureVisible(googleSignIn);
    await tester.tap(googleSignIn);
    await tester.pump();
    expect(tester.widget<OutlinedButton>(googleSignIn).onPressed, isNull);
    expect(tester.widget<ElevatedButton>(passwordSignIn).onPressed, isNull);
    expect(
      find.descendant(
        of: googleSignIn,
        matching: find.byType(CircularProgressIndicator),
      ),
      findsOneWidget,
    );
    expect(find.text('Sign in'), findsOneWidget);

    picker.complete(null);
    await tester.pumpAndSettle();
    expect(requests, isEmpty);
    expect(find.text('Enter your email.'), findsNothing);
    expect(find.text('Enter your password.'), findsNothing);
    expect(tester.widget<ElevatedButton>(passwordSignIn).onPressed, isNotNull);

    await tester.ensureVisible(googleSignIn);
    await tester.tap(googleSignIn);
    await tester.pumpAndSettle();
    expect(requests.single.method, 'POST');
    expect(requests.single.url.path, '/api/auth/mobile/google');
    expect(jsonDecode(requests.single.body), {
      'idToken': 'fixture-google-token',
    });
    expect(find.text('Google sign-in was rejected.'), findsOneWidget);
    expect(tester.widget<OutlinedButton>(googleSignIn).onPressed, isNotNull);
  });

  testWidgets('Sign-in explains TLS, gateway, and response failures', (
    tester,
  ) async {
    var attempts = 0;
    final client = MockClient((_) async {
      switch (++attempts) {
        case 1:
          throw const HandshakeException(
            'Handshake error in client',
            OSError('CERTIFICATE_VERIFY_FAILED: self signed certificate', 1),
          );
        case 2:
          return http.Response('<html>Private gateway details</html>', 503);
        default:
          return http.Response('{"user":null}', 200);
      }
    });
    await tester.pumpWidget(MaterialApp(home: LoginScreen(client: client)));
    final fields = find.byType(TextFormField);
    await tester.enterText(fields.first, 'student@psu.edu.ph');
    await tester.enterText(fields.last, 'test password');
    final signIn = find.widgetWithText(ElevatedButton, 'Sign in');

    for (final message in [
      'does not trust the clinic server certificate',
      'temporarily unavailable (HTTP 503)',
      'sent an unreadable response',
    ]) {
      await tester.ensureVisible(signIn);
      await tester.tap(signIn);
      await tester.pumpAndSettle();
      expect(find.textContaining(message), findsOneWidget);
      expect(find.textContaining('Private gateway details'), findsNothing);
    }
  });

  testWidgets('Google setup failure is distinct from a clinic server error', (
    tester,
  ) async {
    final client = MockClient((_) async {
      fail('Clinic API should not be called when Google setup fails.');
    });
    await tester.pumpWidget(
      MaterialApp(
        home: LoginScreen(
          client: client,
          googleIdToken: () async => throw const GoogleSignInException(
            code: GoogleSignInExceptionCode.clientConfigurationError,
            description: 'Private platform detail',
          ),
        ),
      ),
    );
    final signIn = find.widgetWithText(OutlinedButton, 'Sign in with Google');
    await tester.ensureVisible(signIn);
    await tester.tap(signIn);
    await tester.pumpAndSettle();
    expect(
      find.textContaining('misconfigured in this app build'),
      findsOneWidget,
    );
    expect(find.textContaining('Private platform detail'), findsNothing);
  });

  testWidgets('Both sign-in options are reachable at 200% text scaling', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(320, 420);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);
    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(2)),
          child: child!,
        ),
        home: const LoginScreen(),
      ),
    );

    for (final control in [
      find.byType(TextFormField).first,
      find.byType(TextFormField).last,
      find.widgetWithText(ElevatedButton, 'Sign in'),
      find.widgetWithText(OutlinedButton, 'Sign in with Google'),
    ]) {
      await tester.ensureVisible(control);
      await tester.pumpAndSettle();
      expect(control.hitTestable(), findsOneWidget);
    }
  });

  testWidgets(
    'Restores a server-validated seeded session without a build flag',
    (tester) async {
      const storage = FlutterSecureStorage();
      FlutterSecureStorage.setMockInitialValues({
        'jwt_token': 'seeded-session',
        'user_data':
            '{"user_id":5,"roles":["STUDENT"],"auth_method":"mobile_demo"}',
      });
      final client = MockClient((request) async {
        expect(request.url.path, '/api/auth/mobile/session');
        expect(request.headers['Authorization'], 'Bearer seeded-session');
        return http.Response(
          '{"user_id":5,"roles":["FACULTY"],"auth_method":"mobile_demo","is_qualified_responder":false}',
          200,
        );
      });
      final controller = AccountThemeController(
        storage: storage,
        client: MockClient((_) async => http.Response('{}', 200)),
      );
      addTearDown(controller.dispose);
      addTearDown(EmergencyAlertService().endSession);
      await tester.pumpWidget(
        ValetudoMobileApp(
          themeController: controller,
          home: SplashScreen(client: client),
        ),
      );
      await tester.pumpAndSettle();
      final portal = tester.widget<PatientPortalScreen>(
        find.byType(PatientPortalScreen),
      );
      expect(portal.user['roles'], ['FACULTY']);
      expect(controller.isBound, isTrue);
      expect(await storage.read(key: 'jwt_token'), 'seeded-session');
      EmergencyAlertService().endSession();
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('Clears a session saved by the old password flow', (
    tester,
  ) async {
    const storage = FlutterSecureStorage();
    FlutterSecureStorage.setMockInitialValues({
      'jwt_token': 'old-password-session',
      'user_data': '{"user_id":12,"roles":["STUDENT"]}',
      'account_theme_12': 'saved-theme',
    });
    final client = MockClient((request) async {
      throw StateError(
        'Legacy sessions should clear before fetching a profile',
      );
    });
    await tester.pumpWidget(
      ValetudoMobileApp(home: SplashScreen(client: client)),
    );
    await tester.pumpAndSettle();
    expect(await storage.read(key: 'jwt_token'), isNull);
    expect(await storage.read(key: 'user_data'), isNull);
    expect(await storage.read(key: 'account_theme_12'), 'saved-theme');
    expect(find.text("Let's get started"), findsOneWidget);
  });

  testWidgets(
    'Starts validation promptly and clears a rejected saved session',
    (tester) async {
      const storage = FlutterSecureStorage();
      FlutterSecureStorage.setMockInitialValues({
        'jwt_token': 'saved-session',
        'user_data':
            '{"user_id":12,"roles":["STUDENT"],"auth_method":"mobile_google"}',
      });
      final response = Completer<http.Response>();
      var attempts = 0;
      final client = MockClient((request) {
        expect(request.url.path, '/api/auth/mobile/session');
        expect(request.headers['Authorization'], 'Bearer saved-session');
        if (attempts++ == 0) return Future.value(http.Response('', 503));
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
      expect(controller.isBound, isFalse);
      await tester.pumpAndSettle();
      expect(await storage.read(key: 'jwt_token'), 'saved-session');
      expect(
        find.textContaining('temporarily unavailable (HTTP 503)'),
        findsOneWidget,
      );
      await tester.tap(find.text('Retry'));
      await tester.pump();
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
