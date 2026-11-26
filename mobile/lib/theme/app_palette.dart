import 'package:material_ui/material_ui.dart';

import 'account_theme_controller.dart';

/// Matches the desktop preset anchors; Flutter owns component and text contrast.
ThemeData buildAccountTheme(AccountThemeSelection selection) {
  final dark = selection.dark;
  final (primary, canvas, tint, text) = switch ((selection.preset, dark)) {
    (ThemePreset.brand, false) => (
      0xFF1F4A34,
      0xFFFAFBF9,
      0xFFE8EFE6,
      0xFF1A1F1B,
    ),
    (ThemePreset.brand, true) => (
      0xFF82B49A,
      0xFF101813,
      0xFF294838,
      0xFFE4ECE6,
    ),
    (ThemePreset.blossom, false) => (
      0xFFB4437B,
      0xFFFDF9FB,
      0xFFF2E6ED,
      0xFF231118,
    ),
    (ThemePreset.blossom, true) => (
      0xFFD38BAF,
      0xFF171016,
      0xFF462638,
      0xFFF0E7ED,
    ),
    (ThemePreset.sunrise, false) => (
      0xFFB17D23,
      0xFFFDFAF1,
      0xFFF1EAD8,
      0xFF211A0D,
    ),
    (ThemePreset.sunrise, true) => (
      0xFFD6B05B,
      0xFF111722,
      0xFF283E5B,
      0xFFE9EDF5,
    ),
  };
  final scheme = ColorScheme.fromSeed(
    seedColor: Color(primary),
    brightness: dark ? Brightness.dark : Brightness.light,
    primary: Color(primary),
    onPrimary: Color(primary).computeLuminance() > 0.179
        ? const Color(0xFF101813)
        : Colors.white,
    surface: Color(canvas),
    onSurface: Color(text),
    primaryContainer: Color(tint),
    onPrimaryContainer: Color(text),
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: Color(canvas),
    appBarTheme: AppBarTheme(
      backgroundColor: Color(canvas),
      foregroundColor: scheme.onSurface,
      elevation: 0,
      scrolledUnderElevation: 0,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Color(canvas),
      indicatorColor: scheme.primaryContainer,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: scheme.surfaceContainerLow,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(22)),
    ),
  );
}

/// Semantic bridge for the existing custom-painted mobile screens.
/// Emergency hues keep their meaning; QR and document paper stay explicitly white.
class AppPalette {
  AppPalette(this.theme);
  factory AppPalette.of(BuildContext context) => AppPalette(Theme.of(context));
  final ThemeData theme;
  ColorScheme get scheme => theme.colorScheme;
  bool get dark => theme.brightness == Brightness.dark;
  Color get surface => scheme.surfaceContainerLowest;
  Color get onPrimary => scheme.onPrimary;
  Color background(int argb) {
    if (argb == 0xFF7A2E26 || argb == 0xFFA03B30 || argb == 0xFFB43E32) {
      return Color(argb); // White labels on emergency actions retain contrast.
    }
    return color(argb);
  }

  Color color(int argb) {
    switch (argb) {
      case 0xFF284E3A:
      case 0xFF1F4A34:
        return scheme.primary;
      case 0xFFF7F9F6:
      case 0xFFF6F8F5:
        return theme.scaffoldBackgroundColor;
      case 0xFF191C1A:
      case 0xFF1A1F1B:
      case 0xFF4A4133:
        return scheme.onSurface;
      case 0xFF5A635B:
      case 0xFF506054:
      case 0xFF6B756C:
      case 0xFF94A396:
        return scheme.onSurfaceVariant;
      case 0xFFD6DFD5:
      case 0xFFE2EBE2:
      case 0xFFDCE8DB:
        return scheme.outlineVariant;
      case 0xFFE5EDE4:
      case 0xFFE2EBE1:
      case 0xFFE6DDCF:
      case 0xFFF2F7F1:
      case 0xFFEAF2E8:
        return scheme.primaryContainer;
      case 0xFF244333:
        // The health-pass hero always has white text, independently of mode.
        return Color.lerp(scheme.primary, Colors.black, dark ? 0.65 : 0.35)!;
    }
    final original = Color(argb);
    if (original.a < 1) return original; // Preserve shadow/overlay opacity.
    if (!dark) return original;
    final hsl = HSLColor.fromColor(original);
    if (hsl.lightness > 0.7) {
      return Color.lerp(original, scheme.surface, 0.88)!;
    }
    // Existing dark text in secondary colored cards needs a readable dark-mode tone.
    return hsl.withLightness(hsl.lightness.clamp(0.65, 0.85)).toColor();
  }
}
