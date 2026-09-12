import 'package:flutter/material.dart';
import 'screens/login_screen.dart';

void main() {
  runApp(const ValetudoMobileApp());
}

class ValetudoMobileApp extends StatelessWidget {
  const ValetudoMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Valetudo HealthLink',
      theme: ThemeData(primarySwatch: Colors.teal, useMaterial3: true),
      home: const LoginScreen(),
    );
  }
}