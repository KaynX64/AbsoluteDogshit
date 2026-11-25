import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

import '../config/api_config.dart';

class ResponderQualificationService {
  ResponderQualificationService({required this.token, http.Client? client})
    : client = client ?? ApiConfig.client;
  final String token;
  final http.Client client;
  Uri url(String path) =>
      Uri.parse('${ApiConfig.baseUrl}/api/responder-qualifications$path');
  Map<String, String> get headers => {'Authorization': 'Bearer $token'};
  Future<dynamic> request(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
  }) async {
    final request = http.Request(method, url(path))..headers.addAll(headers);
    if (body != null) {
      request.headers['Content-Type'] = 'application/json';
      request.body = jsonEncode(body);
    }
    final response = await http.Response.fromStream(
      await client.send(request).timeout(const Duration(seconds: 20)),
    );
    final data = jsonDecode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(data['error'] ?? 'Unable to complete the request.');
    }
    return data;
  }

  Future<void> upload(
    int applicationId,
    String name,
    Uint8List bytes,
    String mime,
  ) async {
    if (bytes.length > 5 * 1024 * 1024) {
      throw Exception('Evidence must be no larger than 5 MB.');
    }
    final request =
        http.MultipartRequest(
            'POST',
            url('/applications/$applicationId/evidence'),
          )
          ..headers.addAll(headers)
          ..files.add(
            http.MultipartFile.fromBytes(
              'file',
              bytes,
              filename: name,
              contentType: MediaType.parse(mime),
            ),
          );
    final response = await http.Response.fromStream(
      await client.send(request).timeout(const Duration(seconds: 45)),
    );
    if (response.statusCode >= 400) {
      throw Exception(
        jsonDecode(response.body)['error'] ?? 'Evidence upload failed.',
      );
    }
  }

  Future<Uint8List> evidence(int id) async {
    final response = await client
        .get(url('/evidence/$id'), headers: headers)
        .timeout(const Duration(seconds: 30));
    if (response.statusCode != 200) {
      throw Exception('Evidence is unavailable or access was removed.');
    }
    return response.bodyBytes;
  }
}
