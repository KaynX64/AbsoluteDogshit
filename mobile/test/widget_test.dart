import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/main.dart';

void main() {
  testWidgets('LeoVital app smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const ValetudoMobileApp());

    final app = tester.widget<MaterialApp>(find.byType(MaterialApp));
    expect(app.title, 'LeoVital HealthLink');
    expect(find.text('valetudo.'), findsOneWidget);
    expect(find.text('H E A L T H L I N K'), findsOneWidget);
  });
}