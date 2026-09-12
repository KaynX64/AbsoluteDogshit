import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/main.dart';

void main() {
  testWidgets('Valetudo app smoke test', (WidgetTester tester) async {
    // Build our app and trigger a frame.
    await tester.pumpWidget(const ValetudoMobileApp());

    // Verify that the login UI renders
    expect(find.text('Valetudo HealthLink'), findsOneWidget);
    expect(find.text('Sign In'), findsOneWidget);
  });
}