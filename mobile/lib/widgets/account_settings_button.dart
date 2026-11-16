import 'dart:async';

import 'package:flutter/material.dart';

import '../screens/change_password_screen.dart';
import '../theme/account_theme_controller.dart';

class AccountSettingsButton extends StatelessWidget {
  const AccountSettingsButton({super.key});

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: 'Account settings',
      constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
      icon: const Icon(Icons.settings_outlined),
      onPressed: () => showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        // Route colors are captured once. The sheet paints its live theme below.
        backgroundColor: Colors.transparent,
        elevation: 0,
        constraints: const BoxConstraints(maxWidth: 600),
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        clipBehavior: Clip.antiAlias,
        builder: (_) => const AccountSettingsSheet(),
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
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final headingStyle = theme.textTheme.titleSmall?.copyWith(
      fontWeight: FontWeight.w700,
    );
    return Material(
      key: const ValueKey('account-settings-surface'),
      color: scheme.surface,
      animationDuration: Duration.zero,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.9,
        ),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 10),
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
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 12, 12),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(11),
                      decoration: BoxDecoration(
                        color: scheme.primaryContainer,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Icon(
                        Icons.tune_rounded,
                        color: scheme.onPrimaryContainer,
                        size: 22,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Semantics(
                            header: true,
                            child: Text(
                              'Account settings',
                              style: theme.textTheme.titleLarge?.copyWith(
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            'Appearance and security',
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: scheme.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      tooltip: 'Close settings',
                      constraints: const BoxConstraints(
                        minWidth: 48,
                        minHeight: 48,
                      ),
                      onPressed: () => Navigator.pop(context),
                      icon: const Icon(Icons.close_rounded),
                    ),
                  ],
                ),
              ),
              Divider(height: 1, color: scheme.outlineVariant),
              Flexible(
                fit: FlexFit.loose,
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Semantics(
                        header: true,
                        child: Text('Appearance', style: headingStyle),
                      ),
                      const SizedBox(height: 12),
                      LayoutBuilder(
                        builder: (context, constraints) {
                          final stacked =
                              constraints.maxWidth < 300 ||
                              MediaQuery.textScalerOf(context).scale(14) > 20;
                          final choices = [
                            for (final dark in [false, true])
                              _ModeChoice(
                                key: ValueKey(
                                  'theme-mode-${dark ? 'dark' : 'light'}',
                                ),
                                dark: dark,
                                selected: selection.dark == dark,
                                onTap: controller.isBound
                                    ? () {
                                        if (selection.dark != dark) {
                                          unawaited(
                                            controller.select(dark: dark),
                                          );
                                        }
                                      }
                                    : null,
                              ),
                          ];
                          return stacked
                              ? Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  children: [
                                    choices.first,
                                    const SizedBox(height: 8),
                                    choices.last,
                                  ],
                                )
                              : Row(
                                  children: [
                                    Expanded(child: choices.first),
                                    const SizedBox(width: 10),
                                    Expanded(child: choices.last),
                                  ],
                                );
                        },
                      ),
                      const SizedBox(height: 22),
                      Semantics(
                        header: true,
                        child: Text('Color palette', style: headingStyle),
                      ),
                      const SizedBox(height: 10),
                      for (final preset in ThemePreset.values)
                        _ThemeChoice(
                          key: ValueKey('theme-preset-${preset.name}'),
                          label: preset.label,
                          description: preset.description,
                          selected: selection.preset == preset,
                          leading: _PaletteSwatch(preset: preset),
                          onTap: controller.isBound
                              ? () {
                                  if (selection.preset != preset) {
                                    unawaited(
                                      controller.select(preset: preset),
                                    );
                                  }
                                }
                              : null,
                        ),
                      const SizedBox(height: 6),
                      _ThemeSaveStatus(controller: controller),
                      const SizedBox(height: 22),
                      Semantics(
                        header: true,
                        child: Text('Security', style: headingStyle),
                      ),
                      const SizedBox(height: 10),
                      Material(
                        color: scheme.surfaceContainerLow,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
                          side: BorderSide(color: scheme.outlineVariant),
                        ),
                        clipBehavior: Clip.antiAlias,
                        child: ListTile(
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 5,
                          ),
                          leading: Icon(
                            Icons.lock_outline_rounded,
                            color: scheme.primary,
                          ),
                          title: const Text(
                            'Change password',
                            style: TextStyle(fontWeight: FontWeight.w600),
                          ),
                          subtitle: const Text('Update your account password'),
                          trailing: const Icon(Icons.chevron_right_rounded),
                          onTap: () => Navigator.of(context).push(
                            MaterialPageRoute<void>(
                              builder: (_) => const ChangePasswordScreen(),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ModeChoice extends StatelessWidget {
  const _ModeChoice({
    super.key,
    required this.dark,
    required this.selected,
    required this.onTap,
  });
  final bool dark;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return MergeSemantics(
      child: Semantics(
        checked: selected,
        inMutuallyExclusiveGroup: true,
        child: OutlinedButton.icon(
          style:
              OutlinedButton.styleFrom(
                minimumSize: const Size(0, 52),
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 12,
                ),
                backgroundColor: selected
                    ? scheme.primaryContainer
                    : scheme.surfaceContainerLow,
                foregroundColor: selected
                    ? scheme.onPrimaryContainer
                    : scheme.onSurface,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ).copyWith(
                side: WidgetStateProperty.resolveWith(
                  (states) => BorderSide(
                    color: states.contains(WidgetState.focused)
                        ? scheme.onSurface
                        : selected
                        ? scheme.primary
                        : scheme.outlineVariant,
                    width: states.contains(WidgetState.focused) ? 2 : 1,
                  ),
                ),
              ),
          onPressed: onTap,
          icon: ExcludeSemantics(
            child: Icon(
              dark ? Icons.dark_mode_outlined : Icons.light_mode_outlined,
              size: 20,
            ),
          ),
          label: Text(
            dark ? 'Dark' : 'Light',
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
          ),
        ),
      ),
    );
  }
}

class _ThemeChoice extends StatefulWidget {
  const _ThemeChoice({
    super.key,
    required this.label,
    required this.selected,
    required this.leading,
    required this.onTap,
    this.description,
  });
  final String label;
  final String? description;
  final bool selected;
  final Widget leading;
  final VoidCallback? onTap;

  @override
  State<_ThemeChoice> createState() => _ThemeChoiceState();
}

class _ThemeChoiceState extends State<_ThemeChoice> {
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final fill = widget.selected
        ? scheme.primaryContainer
        : scheme.surfaceContainerLow;
    final shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(14),
      side: BorderSide(
        color: _focused
            ? scheme.onSurface
            : widget.selected
            ? scheme.primary
            : scheme.outlineVariant,
        width: _focused ? 2 : 1,
      ),
    );
    return MergeSemantics(
      child: Semantics(
        checked: widget.selected,
        inMutuallyExclusiveGroup: true,
        child: Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Material(
            color: fill,
            shape: shape,
            clipBehavior: Clip.antiAlias,
            child: ListTile(
              enabled: widget.onTap != null,
              minTileHeight: 60,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 14,
                vertical: 2,
              ),
              titleTextStyle: Theme.of(context).textTheme.titleSmall?.copyWith(
                color: widget.selected
                    ? scheme.onPrimaryContainer
                    : scheme.onSurface,
              ),
              subtitleTextStyle: Theme.of(context).textTheme.bodySmall
                  ?.copyWith(
                    color: widget.selected
                        ? scheme.onPrimaryContainer
                        : scheme.onSurfaceVariant,
                  ),
              shape: shape,
              onFocusChange: (focused) => setState(() => _focused = focused),
              selected: widget.selected,
              selectedColor: scheme.onPrimaryContainer,
              selectedTileColor: fill,
              focusColor: scheme.onSurface.withValues(alpha: 0.10),
              leading: ExcludeSemantics(child: widget.leading),
              title: Text(
                widget.label,
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              subtitle: widget.description == null
                  ? null
                  : Text(widget.description!),
              trailing: widget.selected
                  ? const ExcludeSemantics(
                      child: Icon(Icons.check_circle_rounded),
                    )
                  : const SizedBox(width: 24),
              onTap: widget.onTap,
            ),
          ),
        ),
      ),
    );
  }
}

class _PaletteSwatch extends StatelessWidget {
  const _PaletteSwatch({required this.preset});
  final ThemePreset preset;

  @override
  Widget build(BuildContext context) {
    // The same two-color palette swatches displayed by desktop SettingsMenu.
    final colors = switch (preset) {
      ThemePreset.brand => const [Color(0xFF1F4A34), Color(0xFF788F7B)],
      ThemePreset.blossom => const [Color(0xFFB44371), Color(0xFFE7A7C4)],
      ThemePreset.sunrise => const [Color(0xFFB17D23), Color(0xFF3E6FB0)],
    };
    final scheme = Theme.of(context).colorScheme;
    return SizedBox(
      width: 42,
      height: 26,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          for (var index = 0; index < colors.length; index++)
            Positioned(
              left: index * 18.0,
              top: 1,
              child: Container(
                width: 24,
                height: 24,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: colors[index],
                  border: Border.all(color: scheme.surface, width: 2),
                  boxShadow: [
                    BoxShadow(color: scheme.outlineVariant, spreadRadius: 1),
                  ],
                ),
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
    final status = switch (controller.state) {
      ThemeSaveState.saving => 'Saving to your account…',
      ThemeSaveState.saved => 'Saved to your account',
      ThemeSaveState.pending =>
        'Applied here. Waiting to sync with your account.',
      ThemeSaveState.storageError =>
        'Applied here. Could not save your preference on this device.',
      ThemeSaveState.idle => 'Sign in to save your theme',
    };
    final needsRetry =
        controller.state == ThemeSaveState.pending ||
        controller.state == ThemeSaveState.storageError;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Semantics(
              liveRegion: true,
              child: Row(
                children: [
                  Icon(
                    needsRetry
                        ? Icons.cloud_off_outlined
                        : controller.state == ThemeSaveState.saving
                        ? Icons.sync
                        : Icons.cloud_done_outlined,
                    color: scheme.onSurfaceVariant,
                    size: 18,
                  ),
                  const SizedBox(width: 9),
                  Expanded(
                    child: Text(
                      status,
                      style: Theme.of(context).textTheme.bodySmall
                          ?.copyWith(color: scheme.onSurfaceVariant),
                    ),
                  ),
                ],
              ),
            ),
            if (needsRetry)
              TextButton(
                style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
                onPressed: () => unawaited(controller.retry()),
                child: const Text('Retry saving'),
              ),
          ],
        ),
      ),
    );
  }
}
