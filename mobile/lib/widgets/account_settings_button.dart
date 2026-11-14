import 'dart:async';

import 'package:flutter/material.dart';

import '../screens/change_password_screen.dart';
import '../theme/account_theme_controller.dart';
import '../theme/app_palette.dart';
import '../utils/responsive.dart';

class AccountSettingsButton extends StatelessWidget {
  const AccountSettingsButton({super.key, required this.initials});
  final String initials;

  @override
  Widget build(BuildContext context) {
    final diameter = Rs.of(context).w(36).clamp(32.0, 42.0);
    return IconButton(
      tooltip: 'Account settings',
      padding: EdgeInsets.zero,
      iconSize: diameter,
      onPressed: () => showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        // Route arguments are captured when opened; the sheet paints its live theme.
        backgroundColor: Colors.transparent,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        clipBehavior: Clip.antiAlias,
        builder: (_) => const AccountSettingsSheet(),
      ),
      icon: CircleAvatar(
        radius: diameter / 2,
        backgroundColor: Theme.of(context).colorScheme.primaryContainer,
        foregroundColor: Theme.of(context).colorScheme.onPrimaryContainer,
        child: Text(
          initials,
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800),
        ),
      ),
    );
  }
}

class AccountSettingsSheet extends StatelessWidget {
  const AccountSettingsSheet({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = AccountThemeScope.of(context);
    final selection = controller.selection;
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.surface,
      animationDuration: Duration.zero,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.9,
        ),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 10, 20, 24),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 560),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Center(
                      child: Container(
                        width: 36,
                        height: 4,
                        decoration: BoxDecoration(
                          color: scheme.outlineVariant,
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                    ),
                    const SizedBox(height: 18),
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: scheme.primaryContainer,
                            borderRadius: BorderRadius.circular(16),
                          ),
                          child: Icon(
                            Icons.tune_rounded,
                            color: scheme.onPrimaryContainer,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Account settings',
                                style: Theme.of(context).textTheme.titleLarge
                                    ?.copyWith(fontWeight: FontWeight.w800),
                              ),
                              const SizedBox(height: 3),
                              Text(
                                'Appearance and security',
                                style: Theme.of(context).textTheme.bodySmall
                                    ?.copyWith(color: scheme.onSurfaceVariant),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          tooltip: 'Close settings',
                          onPressed: () => Navigator.pop(context),
                          icon: const Icon(Icons.close_rounded),
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),
                    Text(
                      'Appearance',
                      style: Theme.of(context).textTheme.titleMedium
                          ?.copyWith(fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Choose how your app looks.',
                      style: Theme.of(context).textTheme.bodySmall
                          ?.copyWith(color: scheme.onSurfaceVariant),
                    ),
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        for (final dark in [false, true]) ...[
                          if (dark) const SizedBox(width: 10),
                          Expanded(
                            child: _AppearanceChoice(
                              key: ValueKey(
                                'theme-mode-${dark ? 'dark' : 'light'}',
                              ),
                              label: dark ? 'Dark' : 'Light',
                              selected: selection.dark == dark,
                              previewTheme: buildAccountTheme(
                                AccountThemeSelection(
                                  dark: dark,
                                  preset: selection.preset,
                                ),
                              ),
                              icon: dark
                                  ? Icons.dark_mode_outlined
                                  : Icons.light_mode_outlined,
                              onTap: () =>
                                  unawaited(controller.select(dark: dark)),
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 22),
                    Text(
                      'Color palette',
                      style: Theme.of(context).textTheme.titleSmall
                          ?.copyWith(fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        for (final preset in ThemePreset.values) ...[
                          if (preset != ThemePreset.brand)
                            const SizedBox(width: 8),
                          Expanded(
                            child: _AppearanceChoice(
                              key: ValueKey('theme-preset-${preset.name}'),
                              label: preset.label,
                              selected: selection.preset == preset,
                              previewTheme: buildAccountTheme(
                                AccountThemeSelection(
                                  dark: selection.dark,
                                  preset: preset,
                                ),
                              ),
                              onTap: () =>
                                  unawaited(controller.select(preset: preset)),
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 16),
                    _ThemeSaveStatus(controller: controller),
                    const SizedBox(height: 24),
                    Text(
                      'Security',
                      style: Theme.of(context).textTheme.titleSmall
                          ?.copyWith(fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 10),
                    Material(
                      color: scheme.surfaceContainerLow,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(18),
                        side: BorderSide(color: scheme.outlineVariant),
                      ),
                      clipBehavior: Clip.antiAlias,
                      child: ListTile(
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 6,
                        ),
                        leading: Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: scheme.primaryContainer,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Icon(
                            Icons.lock_outline_rounded,
                            color: scheme.onPrimaryContainer,
                            size: 21,
                          ),
                        ),
                        title: const Text(
                          'Change password',
                          style: TextStyle(fontWeight: FontWeight.w700),
                        ),
                        subtitle: const Text('Update your account password'),
                        trailing: const Icon(Icons.chevron_right_rounded),
                        onTap: () {
                          final navigator = Navigator.of(context);
                          navigator.pop();
                          navigator.push(
                            MaterialPageRoute<void>(
                              builder: (_) => const ChangePasswordScreen(),
                            ),
                          );
                        },
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _AppearanceChoice extends StatelessWidget {
  const _AppearanceChoice({
    super.key,
    required this.label,
    required this.selected,
    required this.previewTheme,
    required this.onTap,
    this.icon,
  });
  final String label;
  final bool selected;
  final ThemeData previewTheme;
  final VoidCallback onTap;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      button: true,
      selected: selected,
      child: Material(
        color: selected ? scheme.primaryContainer : scheme.surfaceContainerLow,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(
            color: selected ? scheme.primary : scheme.outlineVariant,
            width: selected ? 1.5 : 1,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                ExcludeSemantics(child: _ThemePreview(theme: previewTheme)),
                const SizedBox(height: 10),
                Row(
                  children: [
                    if (icon != null) ...[
                      Icon(icon, size: 16, color: scheme.onSurface),
                      const SizedBox(width: 6),
                    ],
                    Expanded(
                      child: Text(
                        label,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: scheme.onSurface,
                        ),
                      ),
                    ),
                    if (selected) ...[
                      const SizedBox(width: 3),
                      Icon(
                        Icons.check_circle_rounded,
                        size: 16,
                        color: scheme.primary,
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ThemePreview extends StatelessWidget {
  const _ThemePreview({required this.theme});
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    final scheme = theme.colorScheme;
    return Container(
      height: 54,
      padding: const EdgeInsets.all(7),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Row(
        children: [
          Container(
            width: 9,
            decoration: BoxDecoration(
              color: scheme.primaryContainer,
              borderRadius: BorderRadius.circular(3),
            ),
          ),
          const SizedBox(width: 5),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Align(
                  alignment: Alignment.centerLeft,
                  child: Container(
                    width: 22,
                    height: 4,
                    decoration: BoxDecoration(
                      color: scheme.primary,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 5),
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: scheme.surfaceContainerHigh,
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: Container(
                        width: 28,
                        height: 3,
                        color: scheme.onSurfaceVariant.withValues(alpha: 0.55),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ThemeSaveStatus extends StatelessWidget {
  const _ThemeSaveStatus({required this.controller});
  final AccountThemeController controller;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final needsRetry =
        controller.state == ThemeSaveState.pending ||
        controller.state == ThemeSaveState.storageError;
    final status = switch (controller.state) {
      ThemeSaveState.saving => 'Saving to your account…',
      ThemeSaveState.saved => 'Saved to your account',
      ThemeSaveState.pending => 'Applied here. Account save is pending.',
      ThemeSaveState.storageError =>
        'Applied here. Could not cache your preference.',
      ThemeSaveState.idle => 'Sign in to save your theme',
    };
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerLow,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Icon(
              needsRetry ? Icons.cloud_off_outlined : Icons.cloud_done_outlined,
              size: 18,
              color: scheme.onSurfaceVariant,
            ),
            const SizedBox(width: 9),
            Expanded(
              child: Text(
                status,
                style: Theme.of(context).textTheme.bodySmall
                    ?.copyWith(color: scheme.onSurfaceVariant),
              ),
            ),
            if (needsRetry)
              TextButton(
                onPressed: () => unawaited(controller.select()),
                child: const Text('Retry saving'),
              ),
          ],
        ),
      ),
    );
  }
}
