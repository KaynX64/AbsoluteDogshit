import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:google_sign_in/google_sign_in.dart';

class MobileSignIn {
  static const allowDemo =
      kDebugMode && bool.fromEnvironment('ALLOW_MOBILE_DEMO_LOGIN');
  static const _serverClientId = String.fromEnvironment(
    'GOOGLE_OAUTH_CLIENT_ID',
  );
  static const _iosClientId = String.fromEnvironment('GOOGLE_IOS_CLIENT_ID');

  static Future<void>? _initialization;

  /// Accepts saved Google sessions and demo sessions in opted-in debug builds.
  static bool acceptsSavedSession(Object? method) =>
      method == 'mobile_google' || (allowDemo && method == 'mobile_demo');

  /// Opens the account picker and returns the Google ID token for HealthLink.
  /// Returns null when the user cancels.
  static Future<String?> googleIdToken() async {
    if (kIsWeb ||
        (defaultTargetPlatform != TargetPlatform.android &&
            defaultTargetPlatform != TargetPlatform.iOS)) {
      throw StateError('PSU sign-in is available in the Android and iOS apps.');
    }
    if (_serverClientId.isEmpty) {
      throw StateError('PSU Google sign-in is unavailable in this build.');
    }

    // Share initialization across attempts and let the next attempt retry after a failure.
    final google = GoogleSignIn.instance;
    _initialization ??= google.initialize(
      clientId:
          defaultTargetPlatform == TargetPlatform.iOS && _iosClientId.isNotEmpty
          ? _iosClientId
          : null,
      serverClientId: _serverClientId,
    );
    final attempt = _initialization;
    try {
      await attempt;
    } catch (_) {
      if (identical(attempt, _initialization)) _initialization = null;
      rethrow;
    }
    try {
      final account = await google.authenticate();
      return account.authentication.idToken ??
          (throw StateError('Google did not return a sign-in token.'));
    } on GoogleSignInException catch (error) {
      if (error.code == GoogleSignInExceptionCode.canceled) return null;
      rethrow;
    } finally {
      // Start the next attempt with the account picker again.
      try {
        await google.signOut();
      } catch (error) {
        if (error is! GoogleSignInException && error is! PlatformException) {
          rethrow;
        }
      }
    }
  }
}
