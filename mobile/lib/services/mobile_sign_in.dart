import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:google_sign_in/google_sign_in.dart';

class _MobileSignInError extends StateError {
  _MobileSignInError(super.message);
}

class MobileSignIn {
  static const _serverClientId = String.fromEnvironment(
    'GOOGLE_OAUTH_CLIENT_ID',
  );
  static const _iosClientId = String.fromEnvironment('GOOGLE_IOS_CLIENT_ID');

  static Future<void>? _initialization;

  /// Identifies mobile sessions that the app can validate with the API.
  static bool acceptsSavedSession(Object? method) =>
      method == 'mobile_google' || method == 'mobile_demo';

  static String failureMessage(Object error) {
    if (error is _MobileSignInError) return error.message;
    final code = error is GoogleSignInException ? error.code : null;
    return switch (code) {
      GoogleSignInExceptionCode.clientConfigurationError => 'PSU Google sign-in is misconfigured in this app build. Contact the clinic administrator.',
      GoogleSignInExceptionCode.providerConfigurationError => 'Google sign-in services are unavailable on this device. Update the device’s Google sign-in services or contact the clinic.',
      GoogleSignInExceptionCode.interrupted ||
      GoogleSignInExceptionCode.uiUnavailable => 'The Google account picker could not finish. Keep the app open and try again.',
      GoogleSignInExceptionCode.userMismatch => 'Google could not switch accounts. Try again and select your PSU account.',
      _ => 'Google could not complete sign-in. Check your internet connection and try again.',
    };
  }

  /// Opens the account picker and returns the Google ID token for HealthLink.
  /// Returns null when the user cancels.
  static Future<String?> googleIdToken() async {
    if (kIsWeb ||
        (defaultTargetPlatform != TargetPlatform.android &&
            defaultTargetPlatform != TargetPlatform.iOS)) {
      throw _MobileSignInError(
        'PSU Google sign-in is available in the Android and iOS apps.',
      );
    }
    if (defaultTargetPlatform == TargetPlatform.iOS &&
        _serverClientId.isEmpty) {
      throw _MobileSignInError(
        'PSU Google sign-in is missing its iOS configuration. Contact the clinic administrator.',
      );
    }

    // Share initialization across attempts and let the next attempt retry after a failure.
    final google = GoogleSignIn.instance;
    _initialization ??= google.initialize(
      clientId:
          defaultTargetPlatform == TargetPlatform.iOS && _iosClientId.isNotEmpty
          ? _iosClientId
          : null,
      // Android falls back to the Web client ID generated from google-services.json.
      serverClientId: _serverClientId.isEmpty ? null : _serverClientId,
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
          (throw _MobileSignInError(
            'Google did not complete verification. Try selecting your PSU account again.',
          ));
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
