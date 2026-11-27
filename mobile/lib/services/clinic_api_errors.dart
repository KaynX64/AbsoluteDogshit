import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../config/api_config.dart';

/// Carries the status of a failed clinic API request without its response body.
class ClinicApiException implements Exception {
  const ClinicApiException(this.statusCode);

  final int statusCode;
}

String clinicFailureMessage(Object error, {required String operation}) {
  return switch (error) {
    ClinicApiException(:final statusCode) => clinicStatusMessage(
      statusCode,
      operation: operation,
    ),
    ApiConfigurationError() => 'This app build has an invalid clinic server address. Contact the clinic administrator.',
    TimeoutException() => 'The clinic server took too long to respond. Check your connection and try again.',
    TlsException(:final message, :final osError) => _tlsMessage(
      _reason(message, osError),
    ),
    // IOClient socket exceptions also implement http.ClientException.
    SocketException(:final message, :final osError) => _socketMessage(
      _reason(message, osError),
    ),
    http.ClientException() => 'The connection to the clinic server failed. Check your network and try again.',
    FormatException() || TypeError() => 'The clinic server sent an unreadable response. Contact the clinic if this continues.',
    _ => 'Could not $operation. Try again or contact the clinic for help.',
  };
}

String clinicStatusMessage(int status, {required String operation}) {
  return switch (status) {
    401 => 'Your session is no longer valid. Sign in again.',
    403 => 'Your account does not have access to this action. Contact the clinic if you need access.',
    404 => 'The requested clinic service or item was not found (HTTP 404).',
    408 ||
    504 => 'The clinic server timed out (HTTP $status). Try again in a moment.',
    429 => 'Too many requests. Wait a moment and try again.',
    502 || 503 =>
      'The clinic server is temporarily unavailable (HTTP $status). Try again in a moment.',
    >= 500 =>
      'The clinic server encountered an error (HTTP $status). Contact the clinic if this continues.',
    _ =>
      'Could not $operation (HTTP $status). Contact the clinic if this continues.',
  };
}

/// Reads the clinic API's user-facing error field from client-error responses.
String? clinicClientError(http.Response response) {
  if (response.statusCode < 400 || response.statusCode >= 500) return null;
  try {
    final data = jsonDecode(response.body);
    if (data is! Map<String, dynamic> || data['error'] is! String) return null;
    final message = (data['error'] as String).trim();
    if (message.isEmpty ||
        message.length > 250 ||
        RegExp(r'[\u0000-\u001F<>]').hasMatch(message) ||
        RegExp(r'^[A-Z][A-Z0-9_]+$').hasMatch(message)) {
      return null;
    }
    return message;
  } on FormatException {
    return null;
  }
}

// Match the native reason internally. OS messages can include addresses and
// implementation details, so the UI only receives fixed messages.
String _reason(String message, OSError? osError) =>
    '$message ${osError?.message ?? ''}'.toLowerCase().replaceAll('_', ' ');

String _tlsMessage(String reason) {
  if (reason.contains('hostname mismatch') ||
      reason.contains('ip address mismatch') ||
      reason.contains('does not match')) {
    return 'The clinic server certificate does not match the configured server address. Ask the clinic to check the address and certificate.';
  }
  if (reason.contains('expired')) {
    return 'The clinic server certificate has expired. Check your device date and time, then contact the clinic if they are correct.';
  }
  if (reason.contains('not yet valid')) {
    return 'The clinic server certificate is not valid yet. Check your device date and time, then contact the clinic if they are correct.';
  }
  if (reason.contains('self signed') ||
      reason.contains('unable to get local issuer') ||
      reason.contains('unable to get issuer certificate') ||
      reason.contains('unable to verify the first certificate') ||
      reason.contains('certificate untrusted')) {
    return 'This device does not trust the clinic server certificate. Ask the clinic to check the certificate and its chain.';
  }
  if (reason.contains('certificate verify failed') ||
      reason.contains('certificate verification failed')) {
    return 'This device could not verify the clinic server certificate. Check your device date and time, then ask the clinic to check the certificate.';
  }
  if (reason.contains('wrong version number') ||
      reason.contains('unknown protocol') ||
      reason.contains('unsupported protocol') ||
      reason.contains('protocol version')) {
    return 'The clinic server did not respond with compatible HTTPS. Ask the clinic to check the configured address and port.';
  }
  return 'The secure connection ended while setting up HTTPS. Try again, then ask the clinic to check the server’s HTTPS settings if it continues.';
}

String _socketMessage(String reason) {
  if (reason.contains('host lookup') ||
      reason.contains('no address associated with hostname') ||
      reason.contains('name or service not known') ||
      reason.contains('no such host')) {
    return 'The clinic server name could not be found. Check your network or ask the clinic to confirm the server address.';
  }
  if (reason.contains('connection refused') ||
      reason.contains('actively refused')) {
    return 'The clinic server refused the connection. Ask the clinic to check that the service is running on the configured port.';
  }
  if (reason.contains('timed out') || reason.contains('timeout')) {
    return 'The connection to the clinic server timed out. Check your network and try again.';
  }
  if (reason.contains('unreachable') || reason.contains('no route to host')) {
    return 'Your device cannot reach the clinic server on this network. Check that you are connected to the correct network.';
  }
  if (reason.contains('connection reset') ||
      reason.contains('forcibly closed') ||
      reason.contains('broken pipe')) {
    return 'The connection to the clinic server was interrupted. Check your network and try again.';
  }
  return 'Could not connect to the clinic server. Check your network and try again.';
}
