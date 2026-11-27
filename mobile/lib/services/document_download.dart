import 'dart:io';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'clinic_api_errors.dart';

class DocumentDownloadException extends HttpException {
  const DocumentDownloadException._(super.message);
}

/// Streams to a partial file so incomplete documents are never opened.
Future<File> downloadDocument({
  required http.Client client,
  required Uri url,
  required String? token,
  required File destination,
}) async {
  final partial = File('${destination.path}.part');
  try {
    final request = http.Request('GET', url)
      ..headers['Authorization'] = 'Bearer $token';
    final response = await client
        .send(request)
        .timeout(const Duration(seconds: 15));
    if (response.statusCode != 200) {
      final status = response.statusCode;
      final bytes = <int>[];
      await for (final chunk in response.stream.timeout(
        const Duration(seconds: 10),
      )) {
        bytes.addAll(chunk.take(4096 - bytes.length));
        if (bytes.length == 4096) break;
      }
      if (status == 503) {
        try {
          final error = jsonDecode(utf8.decode(bytes));
          if (error is Map && error['retryAfterSeconds'] is int) {
            throw const DocumentDownloadException._(
              'The clinic is still preparing this PDF. Try again in a moment.',
            );
          }
        } on FormatException {
          // A gateway can return non-JSON. Use the status below.
        }
      }
      final message = clinicClientError(
        http.Response.bytes(bytes, status, headers: response.headers),
      );
      throw DocumentDownloadException._(
        message ?? clinicStatusMessage(status, operation: 'download the PDF'),
      );
    }
    var received = 0;
    await response.stream
        .timeout(const Duration(seconds: 30))
        .map((chunk) {
          received += chunk.length;
          return chunk;
        })
        .pipe(partial.openWrite());
    if (response.contentLength != null && received != response.contentLength) {
      throw const DocumentDownloadException._(
        'The PDF download was incomplete. Download it again.',
      );
    }
    return await partial.rename(destination.path);
  } catch (_) {
    if (await partial.exists()) await partial.delete();
    rethrow;
  }
}
