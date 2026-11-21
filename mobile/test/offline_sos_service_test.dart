import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/services/offline_sos_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late DateTime now;
  late OfflineSosService sos;

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({
      'offline_emergency_contacts': '{"contact_phone":"123"}',
      'offline_sos_queue': '[{"latitude":1,"longitude":2}]',
    });
    now = DateTime.utc(2026, 11, 21);
    sos = OfflineSosService.test(() => now);
  });

  Future<SosSyncResult> sync(
    http.Client client, {
    String account = '1',
    bool online = true,
  }) => sos.sync(
    account: account,
    token: 'account-$account',
    client: client,
    isCurrent: () => true,
    online: online,
  );

  test('ignores unowned and other-account emergency data', () async {
    await sos.cacheEmergencyInfo('1', name: 'Fixture', phone: '456');
    await sos.queueSos('1', latitude: 16, longitude: 120);
    expect(await sos.readCachedEmergencyInfo('2'), isNull);
    expect((await sos.readCachedEmergencyInfo('1'))?['contact_phone'], '456');
    final client = MockClient(
      (_) async => throw StateError('Unexpected replay'),
    );
    expect((await sync(client, account: '2')).pending, 0);
    expect((await sync(client, online: false)).pending, 1);
    await sos.cacheEmergencyInfo('1');
    expect(await sos.readCachedEmergencyInfo('1'), isNull);
  });

  test(
    'keeps the same request across a lost response and obeys Retry-After',
    () async {
      await sos.queueSos('1', latitude: 16, longitude: 120);
      final ids = <String>[];
      final client = MockClient((request) async {
        expect(request.url.path, '/api/emergency/sos/requests');
        ids.add(jsonDecode(request.body)['client_sos_id'] as String);
        if (ids.length == 1) throw http.ClientException('Response lost');
        if (ids.length == 2) {
          return http.Response('', 429, headers: {'retry-after': '7'});
        }
        return http.Response('{"alertId":42,"replayed":true}', 200);
      });
      expect((await sync(client)).pending, 1);
      expect((await sync(client)).retryIn, const Duration(seconds: 15));
      now = now.add(const Duration(seconds: 15));
      expect((await sync(client)).retryIn, const Duration(seconds: 7));
      now = now.add(const Duration(seconds: 7));
      final result = await sync(client);
      expect(result.accepted, 1);
      expect(result.pending, 0);
      expect(ids.length, 3);
      expect(ids.toSet(), hasLength(1));
    },
  );

  test(
    'keeps auth failures queued and reports rejection and expiry separately',
    () async {
      await sos.queueSos('1', latitude: 16, longitude: 120);
      final auth = await sync(MockClient((_) async => http.Response('', 403)));
      expect(auth.reauthenticate, isTrue);
      expect(auth.pending, 1);
      expect(auth.accepted, 0);
      final rejected = await sync(
        MockClient((_) async => http.Response('', 400)),
      );
      expect(rejected.unsent, 1);
      expect(rejected.accepted, 0);
      await sos.queueSos('1', latitude: 16, longitude: 120);
      now = now.add(const Duration(minutes: 15));
      expect(
        (await sync(
          MockClient((_) async => throw StateError('Unexpected request')),
        )).unsent,
        1,
      );
    },
  );

  test(
    'coalesces active replay and preserves requests appended during it',
    () async {
      await sos.queueSos('1', latitude: 16, longitude: 120);
      final entered = Completer<void>();
      final release = Completer<void>();
      final client = MockClient((_) async {
        if (!entered.isCompleted) {
          entered.complete();
          await release.future;
        }
        return http.Response('{"alertId":42}', 201);
      });
      final first = sync(client);
      await entered.future;
      expect(identical(sync(client), first), isTrue);
      await sos.queueSos('1', latitude: 17, longitude: 120);
      release.complete();
      expect((await first).pending, 1);
      expect((await sync(client)).accepted, 1);
    },
  );
}
