import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_sign_in_platform_interface/google_sign_in_platform_interface.dart';
import 'package:mobile/services/mobile_sign_in.dart';

class _GooglePicker extends GoogleSignInPlatform {
  int starts = 0;
  int picks = 0;
  int signOuts = 0;

  @override
  Future<void> init(InitParameters params) async {
    if (++starts == 1) throw StateError('Temporary initialization failure');
  }

  @override
  Future<AuthenticationResults> authenticate(
    AuthenticateParameters params,
  ) async {
    if (++picks == 1) {
      throw const GoogleSignInException(
        code: GoogleSignInExceptionCode.canceled,
      );
    }
    return AuthenticationResults(
      user: GoogleSignInUserData(email: 'user$picks@psu.edu.ph', id: '$picks'),
      authenticationTokens: AuthenticationTokenData(idToken: 'token-$picks'),
    );
  }

  @override
  Future<void> signOut(SignOutParams params) async {
    signOuts++;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  test('Google initialization retries, cancellation returns to login and the next user gets a fresh token', () async {
    final previous = GoogleSignInPlatform.instance;
    final picker = _GooglePicker();
    GoogleSignInPlatform.instance = picker;
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    addTearDown(() {
      GoogleSignInPlatform.instance = previous;
      debugDefaultTargetPlatformOverride = null;
    });
    await expectLater(MobileSignIn.googleIdToken(), throwsStateError);
    if (const String.fromEnvironment('GOOGLE_OAUTH_CLIENT_ID').isEmpty) {
      expect(picker.starts, 0);
      return;
    }
    expect(await MobileSignIn.googleIdToken(), isNull);
    expect(await MobileSignIn.googleIdToken(), 'token-2');
    expect(await MobileSignIn.googleIdToken(), 'token-3');
    expect(picker.starts, 2);
    expect(picker.signOuts, 3);
  });
}
