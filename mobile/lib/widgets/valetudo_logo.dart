// mobile/lib/widgets/valetudo_logo.dart
import 'package:flutter/material.dart';

/// Reusable Valetudo brand mark (lion + medical cross + heart).
///
/// Usage:
///   const ValetudoLogo(size: 36)                 // square, tight crop (header)
///   const ValetudoLogo(size: 130, padded: true)  // padded, on white card (splash)
class ValetudoLogo extends StatelessWidget {
  final double size;

  /// If true, shows the logo on a white rounded card with subtle shadow.
  /// Use for the splash screen. Leave false for headers.
  final bool padded;

  const ValetudoLogo({
    super.key,
    this.size = 36,
    this.padded = false,
  });

  @override
  Widget build(BuildContext context) {
    final image = ClipRRect(
      borderRadius: BorderRadius.circular(padded ? size * 0.17 : size * 0.22),
      child: Image.asset(
        'assets/valetudo_logo.png',
        width: size,
        height: size,
        fit: padded ? BoxFit.contain : BoxFit.cover,
        filterQuality: FilterQuality.high,
      ),
    );

    if (!padded) return image;

    return Container(
      width: size,
      height: size,
      padding: EdgeInsets.all(size * 0.05),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(size * 0.20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.10),
            blurRadius: size * 0.14,
            offset: Offset(0, size * 0.06),
          ),
        ],
      ),
      child: image,
    );
  }
}