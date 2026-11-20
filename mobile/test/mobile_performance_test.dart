import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/screens/consultation_scheduler_screen.dart';
import 'package:mobile/screens/documents_viewer_screen.dart';
import 'package:mobile/screens/patient_portal_screen.dart';
import 'package:mobile/services/document_download.dart';
import 'package:mobile/services/mobile_session_data.dart';
import 'package:mobile/theme/account_theme_controller.dart';
import 'package:mobile/widgets/lazy_card_columns.dart';

import 'mobile_appearance_test.dart' show bookingFixtureClient;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('shares requests, expires data, invalidates, and rejects old session cache writes', () async {
    var now = DateTime(2026);
    var calls = 0;
    final pending = <Completer<http.Response>>[];
    final client = MockClient((request) {
      calls++;
      final response = Completer<http.Response>();
      pending.add(response);
      return response.future;
    });
    final data = MobileSessionData(client: client, now: () => now)..begin('a');
    addTearDown(data.clear);
    addTearDown(client.close);
    final first = data.get('/api/appointments/doctors', 'a');
    final second = data.get('/api/appointments/doctors', 'a');
    expect(identical(first, second), isTrue);
    await Future<void>.delayed(Duration.zero);
    pending[0].complete(http.Response('[1]', 200));
    expect(await first, [1]);
    expect(await data.get('/api/appointments/doctors', 'a'), [1]);
    expect(calls, 1);
    now = now.add(const Duration(minutes: 2));
    final expired = data.get('/api/appointments/doctors', 'a');
    await Future<void>.delayed(Duration.zero);
    data.begin('b');
    pending[1].complete(http.Response('[2]', 200));
    await expired;
    final fresh = data.get('/api/appointments/doctors', 'b');
    await Future<void>.delayed(Duration.zero);
    pending[2].complete(http.Response('[3]', 200));
    expect(await fresh, [3]);
    data.didHaveMemoryPressure();
    final afterPressure = data.get('/api/appointments/doctors', 'b');
    await Future<void>.delayed(Duration.zero);
    pending[3].complete(http.Response('[4]', 200));
    expect(await afterPressure, [4]);
    data.invalidate('/api/appointments/doctors');
    final invalidated = data.get('/api/appointments/doctors', 'b');
    await Future<void>.delayed(Duration.zero);
    pending[4].complete(http.Response('[5]', 200));
    expect(await invalidated, [5]);
    expect(calls, 5);
  });

  test(
    'preloads sequentially only with consent and stops across sessions',
    () async {
      final paths = <String>[];
      final doctors = Completer<http.Response>();
      final client = MockClient((request) async {
        paths.add(request.url.path);
        if (request.url.path.endsWith('doctors')) return doctors.future;
        return http.Response('[]', 200);
      });
      final data = MobileSessionData(client: client)..begin('a');
      addTearDown(data.clear);
      addTearDown(client.close);
      await data.preload();
      expect(paths, isEmpty);
      data.consented = true;
      final preload = data.preload();
      await Future<void>.delayed(Duration.zero);
      expect(paths, ['/api/appointments/doctors']);
      data.begin('b');
      doctors.complete(http.Response('[]', 200));
      await preload;
      expect(paths, ['/api/appointments/doctors']);
      data.consented = true;
      await data.preload();
      expect(paths.last, '/api/documents/prescriptions/my');
      expect(paths.length, 3);
    },
  );

  test(
    'theme save status and identical refresh do not notify appearance',
    () async {
      FlutterSecureStorage.setMockInitialValues({});
      final controller = AccountThemeController(
        client: MockClient(
          (request) async => http.Response(
            '{"theme_mode":"dark","theme_preset":"brand"}',
            200,
          ),
        ),
      );
      addTearDown(controller.dispose);
      await controller.bindAccount({'user_id': 1}, 'a');
      var changes = 0;
      controller.appearance.addListener(() => changes++);
      await controller.select(dark: true);
      expect(changes, 1);
      await controller.refresh();
      expect(changes, 1);
      expect(controller.state, ThemeSaveState.saved);
    },
  );

  test(
    'streams successful documents and cleans up failed partial downloads',
    () async {
      final dir = await Directory.systemTemp.createTemp('mobile-download-');
      addTearDown(() => dir.delete(recursive: true));
      final target = File('${dir.path}/prescription-1.pdf');
      final client = MockClient.streaming((request, body) async {
        expect(request.headers['Authorization'], 'Bearer a');
        return http.StreamedResponse(
          Stream.fromIterable([
            [37, 80],
            [68, 70],
          ]),
          200,
        );
      });
      addTearDown(client.close);
      await downloadDocument(
        client: client,
        url: Uri.parse('https://example.test/pdf'),
        token: 'a',
        destination: target,
      );
      expect(await target.readAsBytes(), [37, 80, 68, 70]);
      final failed = MockClient.streaming(
        (request, body) async => http.StreamedResponse(
          Stream<List<int>>.multi((controller) {
            controller.add([1, 2]);
            controller.addError(const HttpException('interrupted'));
            controller.close();
          }),
          200,
        ),
      );
      addTearDown(failed.close);
      await expectLater(
        downloadDocument(
          client: failed,
          url: Uri.parse('https://example.test/pdf'),
          token: 'a',
          destination: target,
        ),
        throwsA(isA<HttpException>()),
      );
      expect(await File('${target.path}.part').exists(), isFalse);
      expect(await target.readAsBytes(), [37, 80, 68, 70]);
    },
  );

  testWidgets('appointments preserve draft and reuse doctors after remount', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues({'jwt_token': 'tab-test'});
    final data = MobileSessionData.instance..begin('tab-test');
    addTearDown(data.clear);
    final fixture = bookingFixtureClient();
    var doctorRequests = 0;
    var slotRequests = 0;
    var historyRequests = 0;
    final client = MockClient((request) async {
      if (request.url.path.endsWith('/doctors')) doctorRequests++;
      if (request.url.path.endsWith('/slots')) slotRequests++;
      if (request.url.path.endsWith('/my')) historyRequests++;
      return fixture.get(request.url, headers: request.headers);
    });
    addTearDown(client.close);
    addTearDown(fixture.close);
    Future<void> mount(bool show) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: PageStorage(
              bucket: data.bucket,
              child: show
                  ? ConsultationSchedulerScreen(client: client)
                  : const SizedBox(),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
    }

    await mount(true);
    expect(doctorRequests, 1);
    expect(historyRequests, 0);
    // Enter through the controller so this test does not depend on viewport size.
    await tester.scrollUntilVisible(
      find.byType(TextField),
      250,
      scrollable: find
          .descendant(
            of: find.byKey(const PageStorageKey('booking')),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    final field = tester.widget<TextField>(find.byType(TextField).first);
    field.controller!.text = 'Keep this booking draft';
    await mount(false);
    await mount(true);
    expect(doctorRequests, 1);
    expect(slotRequests, 2);
    final restoredScroll = tester.state<ScrollableState>(
      find
          .descendant(
            of: find.byKey(const PageStorageKey('booking')),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    expect(restoredScroll.position.pixels, greaterThan(0));
    restoredScroll.position.jumpTo(0);
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.byType(TextField),
      250,
      scrollable: find
          .descendant(
            of: find.byKey(const PageStorageKey('booking')),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    expect(
      tester.widget<TextField>(find.byType(TextField).first).controller!.text,
      'Keep this booking draft',
    );
    await mount(false);
  });

  testWidgets(
    'documents fetch categories on demand and reuse data after remount',
    (tester) async {
      FlutterSecureStorage.setMockInitialValues({'jwt_token': 'docs-test'});
      final data = MobileSessionData.instance..begin('docs-test');
      addTearDown(data.clear);
      final paths = <String>[];
      final client = MockClient((request) async {
        paths.add(request.url.path);
        return http.Response('[]', 200);
      });
      addTearDown(client.close);
      Future<void> mount(bool show) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: PageStorage(
                bucket: data.bucket,
                child: show
                    ? DocumentsViewerScreen(client: client)
                    : const SizedBox(),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
      }

      await mount(true);
      expect(paths, ['/api/documents/prescriptions/my']);
      await mount(false);
      await mount(true);
      expect(paths.length, 1);
      await mount(false);
    },
  );

  testWidgets(
    'queue refresh bursts coalesce and polling pauses in background',
    (tester) async {
      FlutterSecureStorage.setMockInitialValues({'jwt_token': 'queue-test'});
      final data = MobileSessionData.instance..clear();
      final first = Completer<http.Response>();
      var queueCalls = 0;
      final client = MockClient((request) async {
        if (request.url.path.endsWith('/queue/my')) {
          queueCalls++;
          if (queueCalls == 1) return first.future;
          return http.Response('{"hasActiveTicket":false}', 200);
        }
        if (request.url.path.endsWith('/privacy/status')) {
          return http.Response('{"hasConsented":true}', 200);
        }
        if (request.url.path.endsWith('/token')) {
          return http.Response('{"qrToken":"fixture"}', 200);
        }
        return http.Response('{}', 200);
      });
      final controller = AccountThemeController(client: client);
      addTearDown(controller.dispose);
      addTearDown(client.close);
      addTearDown(data.clear);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpWidget(
        AccountThemeScope(
          controller: controller,
          child: MaterialApp(
            home: PatientPortalScreen(
              user: const {
                'user_id': 1,
                'first_name': 'Fixture',
                'roles': ['STUDENT'],
              },
              initialProfile: const {
                'user': {'user_id': 1},
                'healthProfile': {},
              },
              client: client,
            ),
          ),
        ),
      );
      await tester.pump();
      expect(queueCalls, 1);
      for (var i = 0; i < 3; i++) {
        tester.binding.handleAppLifecycleStateChanged(
          AppLifecycleState.inactive,
        );
        tester.binding.handleAppLifecycleStateChanged(
          AppLifecycleState.resumed,
        );
        await tester.pump();
      }
      expect(queueCalls, 1);
      first.complete(http.Response('{"hasActiveTicket":false}', 200));
      await tester.pumpAndSettle();
      expect(queueCalls, 2);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      await tester.pump(const Duration(seconds: 31));
      expect(queueCalls, 2);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();
      expect(queueCalls, 3);
      await tester.pumpWidget(const SizedBox());
      expect(tester.takeException(), isNull);
    },
  );

  for (final columns in [2, 3]) {
    testWidgets(
      'lazy $columns-column cards match original geometry and pixels',
      (tester) async {
        final boundary = GlobalKey();
        Widget card(int index) => Container(
          height: 65.0 + index % 4 * 24,
          decoration: BoxDecoration(
            color: Colors.primaries[index % Colors.primaries.length],
            borderRadius: BorderRadius.circular(14),
          ),
          child: Text('Card $index'),
        );
        Future<ui.Image> render(bool lazy) async {
          await tester.pumpWidget(
            MaterialApp(
              home: RepaintBoundary(
                key: boundary,
                child: Scaffold(
                  body: CustomScrollView(
                    slivers: [
                      if (lazy)
                        LazyCardColumns(
                          columnCount: columns,
                          itemCount: 12,
                          gap: 12,
                          itemBuilder: (_, index) => card(index),
                        )
                      else
                        SliverToBoxAdapter(
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              for (var col = 0; col < columns; col++)
                                Expanded(
                                  child: Padding(
                                    padding: EdgeInsets.only(
                                      right: col == columns - 1 ? 0 : 12,
                                    ),
                                    child: Column(
                                      children: [
                                        for (var i = col; i < 12; i += columns)
                                          Padding(
                                            padding: const EdgeInsets.only(
                                              bottom: 12,
                                            ),
                                            child: SizedBox(
                                              width: double.infinity,
                                              child: card(i),
                                            ),
                                          ),
                                      ],
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          );
          await tester.pumpAndSettle();
          return (boundary.currentContext!.findRenderObject()!
                  as RenderRepaintBoundary)
              .toImage();
        }

        final reference = await render(false);
        final result = await render(true);
        await expectLater(result, matchesReferenceImage(reference));
        result.dispose();
        reference.dispose();
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets('large grids build a bounded visible subset of cards', (
    tester,
  ) async {
    var builds = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: CustomScrollView(
            slivers: [
              LazyCardColumns(
                columnCount: 2,
                itemCount: 1000,
                gap: 12,
                itemBuilder: (_, index) {
                  builds++;
                  return SizedBox(
                    height: 120 + index % 4 * 10.0,
                    child: Text('$index'),
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(builds, lessThan(40));
    await tester.drag(find.byType(CustomScrollView), const Offset(0, -1000));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(builds, lessThan(100));
  });
}
