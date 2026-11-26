import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/widgets/sign_out_confirmation.dart';

void main() {
  testWidgets('sign out requires explicit confirmation', (tester) async {
    var signOuts = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () async {
                if (await confirmSignOut(context)) signOuts++;
              },
              child: const Text('Open sign-out prompt'),
            ),
          ),
        ),
      ),
    );

    Future<void> openPrompt() async {
      await tester.tap(find.text('Open sign-out prompt'));
      await tester.pumpAndSettle();
      expect(find.text('Sign out?'), findsOneWidget);
    }

    await openPrompt();
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(signOuts, 0);

    await openPrompt();
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(signOuts, 0);

    await openPrompt();
    await tester.tap(find.text('Sign out'));
    await tester.pumpAndSettle();
    expect(signOuts, 1);
  });
}
