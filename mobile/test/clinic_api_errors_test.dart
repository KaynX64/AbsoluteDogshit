import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/services/clinic_api_errors.dart';

void main() {
  for (final (error, expected) in <(Object, String)>[
    (
      const HandshakeException(
        'Handshake error in client',
        OSError('CERTIFICATE_VERIFY_FAILED: self signed certificate', 1),
      ),
      'does not trust the clinic server certificate',
    ),
    (
      const HandshakeException('CERTIFICATE_VERIFY_FAILED: hostname mismatch'),
      'does not match the configured server address',
    ),
    (
      const HandshakeException(
        'CERTIFICATE_VERIFY_FAILED: IP address mismatch',
      ),
      'does not match the configured server address',
    ),
    (
      const HandshakeException(
        'CERTIFICATE_VERIFY_FAILED: certificate has expired',
      ),
      'certificate has expired',
    ),
    (
      const HandshakeException(
        'CERTIFICATE_VERIFY_FAILED: certificate is not yet valid',
      ),
      'certificate is not valid yet',
    ),
    (
      const HandshakeException('CERTIFICATE_VERIFY_FAILED: native detail'),
      'could not verify the clinic server certificate',
    ),
    (
      const HandshakeException('WRONG_VERSION_NUMBER'),
      'did not respond with compatible HTTPS',
    ),
    (const HandshakeException('native detail'), 'ended while setting up HTTPS'),
    (
      const SocketException('Failed host lookup: native detail'),
      'server name could not be found',
    ),
    (
      const SocketException(
        'native detail',
        osError: OSError('Connection refused', 111),
      ),
      'server refused the connection',
    ),
    (
      const SocketException('Network is unreachable'),
      'cannot reach the clinic server on this network',
    ),
    (TimeoutException('native detail'), 'took too long to respond'),
    (
      http.ClientException('native detail'),
      'connection to the clinic server failed',
    ),
    (const ClinicApiException(503), 'temporarily unavailable (HTTP 503)'),
    (const FormatException('native detail'), 'sent an unreadable response'),
  ]) {
    test('explains $expected without exposing native details', () {
      final message = clinicFailureMessage(error, operation: 'sign in');
      expect(message, contains(expected));
      expect(message, isNot(contains('native detail')));
    });
  }

  test('keeps usable request feedback and discards invalid error bodies', () {
    expect(
      clinicClientError(
        http.Response('{"error":"Incorrect credentials."}', 401),
      ),
      'Incorrect credentials.',
    );
    for (final response in [
      http.Response('<html>Private gateway details</html>', 403),
      http.Response('{"error":"TOKEN_REVOKED"}', 401),
      http.Response('{"error":"<html>Private gateway details</html>"}', 403),
      http.Response('{"error":"Private server exception"}', 500),
    ]) {
      expect(clinicClientError(response), isNull);
    }
  });
}
