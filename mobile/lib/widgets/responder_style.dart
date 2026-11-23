import 'package:flutter/material.dart';

/// Keeps the account font and palette while matching LeoVital's type hierarchy.
class ResponderStyle extends StatelessWidget {
  const ResponderStyle({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final text = theme.textTheme;
    final labels = text.labelLarge?.copyWith(
      fontSize: 13,
      fontWeight: FontWeight.w700,
      letterSpacing: 0,
    );
    return Theme(
      data: theme.copyWith(
        appBarTheme: theme.appBarTheme.copyWith(
          titleTextStyle: text.titleLarge?.copyWith(
            fontSize: 18,
            fontWeight: FontWeight.w800,
            color: theme.colorScheme.onSurface,
          ),
        ),
        textTheme: text.copyWith(
          headlineSmall: text.headlineSmall?.copyWith(
            fontSize: 24,
            fontWeight: FontWeight.w800,
            letterSpacing: -.6,
          ),
          titleLarge: text.titleLarge?.copyWith(
            fontSize: 18,
            fontWeight: FontWeight.w800,
            letterSpacing: -.3,
          ),
          titleMedium: text.titleMedium?.copyWith(
            fontSize: 15,
            fontWeight: FontWeight.w700,
            letterSpacing: 0,
          ),
          bodyMedium: text.bodyMedium?.copyWith(
            fontSize: 14,
            height: 1.45,
            letterSpacing: 0,
          ),
          bodySmall: text.bodySmall?.copyWith(
            fontSize: 12,
            height: 1.45,
            letterSpacing: 0,
          ),
          labelLarge: labels,
          labelMedium: text.labelMedium?.copyWith(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            letterSpacing: 0,
          ),
        ),
        navigationBarTheme: theme.navigationBarTheme.copyWith(
          labelTextStyle: WidgetStatePropertyAll(labels),
        ),
      ),
      child: child,
    );
  }
}

class ResponderBadge extends StatelessWidget {
  const ResponderBadge({
    super.key,
    required this.label,
    required this.icon,
    this.attention = false,
    this.danger = false,
  });
  final String label;
  final IconData icon;
  final bool attention;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context), colors = theme.colorScheme;
    final foreground = danger
        ? colors.onErrorContainer
        : attention
        ? colors.onTertiaryContainer
        : colors.onPrimaryContainer;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: danger
            ? colors.errorContainer
            : attention
            ? colors.tertiaryContainer
            : colors.primaryContainer,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: foreground),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              label,
              style: theme.textTheme.labelMedium?.copyWith(color: foreground),
            ),
          ),
        ],
      ),
    );
  }
}
