// mobile/lib/utils/responsive.dart
import 'package:flutter/material.dart';

/// Responsive scaling helper.
///
/// Usage inside a screen's build():
///
///   @override
///   Widget build(BuildContext context) {
///     final rs = Rs.of(context);
///     return Padding(
///       padding: EdgeInsets.all(rs.w(24)),
///       child: Text('Hello', style: TextStyle(fontSize: rs.sp(15))),
///     );
///   }
///
/// All sizing decisions are based on the *shortest* screen dimension,
/// with a clamped scale factor so the UI never collapses on a 320dp
/// phone and never balloons on a 1000dp tablet.
class Rs {
  /// Design baseline (iPhone 14 / Pixel 6 logical width).
  static const double _baseW = 390;

  /// Scale is clamped so nothing goes microscopic or comical.
  static const double _minScale = 0.85;
  static const double _maxScale = 1.30;

  final double screenW;
  final double screenH;
  final double factor;
  final double textFactor;

  const Rs._({
    required this.screenW,
    required this.screenH,
    required this.factor,
    required this.textFactor,
  });

  factory Rs.of(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final raw = size.width / _baseW;
    final factor = raw.clamp(_minScale, _maxScale);

    // Font scaling is gentler than layout scaling, because the OS
    // already applies the user's accessibility text scale on top of
    // whatever we return. Overscaling fonts on a tablet produces
    // 40px body text, which looks broken.
    final textFactor = 1 + (factor - 1) * 0.70;

    return Rs._(
      screenW: size.width,
      screenH: size.height,
      factor: factor,
      textFactor: textFactor,
    );
  }

  // ── Breakpoints ─────────────────────────────────────────────────
  /// iPhone SE 1st-gen, older Galaxy A-series (~320dp).
  bool get isCompact => screenW < 360;

  /// Standard phone (360dp – 599dp). Covers Pixel, most modern Androids.
  bool get isPhone => screenW >= 360 && screenW < 600;

  /// Tablet, foldable inner screen, or landscape phone.
  bool get isTablet => screenW >= 600;

  /// Short viewport (landscape phone, split-screen).
  bool get isShort => screenH < 700;

  // ── Scale primitives ───────────────────────────────────────────
  /// Scale a horizontal size (SizedBox width, horizontal padding).
  double w(double v) => v * factor;

  /// Scale a vertical size (SizedBox height, vertical padding).
  double h(double v) => v * factor;

  /// Scale a radius / uniform padding / gap.
  double r(double v) => v * factor;

  /// Scale a font size.
  double sp(double v) => v * textFactor;

  // ── Breakpoint picker ──────────────────────────────────────────
  /// Choose a value based on the current breakpoint.
  ///
  ///   final columns = rs.pick(compact: 2, phone: 3, tablet: 5);
  T pick<T>({required T compact, required T phone, T? tablet}) {
    if (isTablet && tablet != null) return tablet;
    if (isCompact) return compact;
    return phone;
  }
}