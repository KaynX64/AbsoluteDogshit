import 'dart:async';

import 'package:flutter/material.dart';

import '../screens/change_password_screen.dart';
import '../theme/account_theme_controller.dart';
import '../theme/app_palette.dart';

class AccountSettingsButton extends StatelessWidget {
  const AccountSettingsButton({super.key});

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: 'Account settings',
      constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
      icon: const Icon(Icons.settings_outlined),
      onPressed: () => Navigator.of(context).push(
        MaterialPageRoute<void>(builder: (_) => const AccountSettingsScreen()),
      ),
    );
  }
}

class AccountSettingsScreen extends StatelessWidget {
  const AccountSettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final selection = AccountThemeScope.of(context).selection;
    return _SettingsPage(
      title: 'Account settings',
      children: [
        ListTile(
          leading: const Icon(Icons.palette_outlined),
          title: const Text('Appearance'),
          subtitle: Text(
            '${selection.dark ? 'Dark' : 'Light'} · ${selection.preset.label}',
          ),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute<void>(builder: (_) => const AppearanceScreen()),
          ),
        ),
        ListTile(
          leading: const Icon(Icons.lock_outline),
          title: const Text('Change password'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (_) => const ChangePasswordScreen(),
            ),
          ),
        ),
      ],
    );
  }
}

class AppearanceScreen extends StatelessWidget {
  const AppearanceScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = AccountThemeScope.of(context);
    final selection = controller.selection;
    return _SettingsPage(
      title: 'Appearance',
      children: [
        _ThemeSaveStatus(controller: controller),
        const SizedBox(height: 16),
        const _SectionHeading('Preview'),
        _ThemePreview(selection: selection),
        const SizedBox(height: 16),
        const _SectionHeading('Display mode'),
        for (final dark in [false, true])
          _ThemeChoice(
            key: ValueKey('theme-mode-${dark ? 'dark' : 'light'}'),
            label: dark ? 'Dark' : 'Light',
            selected: selection.dark == dark,
            leading: Icon(
              dark ? Icons.dark_mode_outlined : Icons.light_mode_outlined,
            ),
            onTap: controller.isBound
                ? () {
                    if (selection.dark != dark) {
                      unawaited(controller.select(dark: dark));
                    }
                  }
                : null,
          ),
        const SizedBox(height: 16),
        const _SectionHeading('Color palette'),
        for (final preset in ThemePreset.values)
          _ThemeChoice(
            key: ValueKey('theme-preset-${preset.name}'),
            label: preset.label,
            description: preset.description,
            selected: selection.preset == preset,
            leading: _PaletteSwatches(
              scheme: buildAccountTheme(
                AccountThemeSelection(dark: selection.dark, preset: preset),
              ).colorScheme,
            ),
            onTap: controller.isBound
                ? () {
                    if (selection.preset != preset) {
                      unawaited(controller.select(preset: preset));
                    }
                  }
                : null,
          ),
      ],
    );
  }
}

class _SettingsPage extends StatelessWidget {
  const _SettingsPage({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(title),
        toolbarHeight: MediaQuery.textScalerOf(context)
            .scale(kToolbarHeight)
            .clamp(kToolbarHeight, 112.0),
      ),
      body: SafeArea(
        child: Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
              children: children,
            ),
          ),
        ),
      ),
    );
  }
}

class _SectionHeading extends StatelessWidget {
  const _SectionHeading(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      child: Semantics(
        header: true,
        child: Text(label, style: Theme.of(context).textTheme.titleMedium),
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
    return MergeSemantics(
      child: Semantics(
        checked: widget.selected,
        inMutuallyExclusiveGroup: true,
        child: ListTile(
          enabled: widget.onTap != null,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: _focused
                ? BorderSide(color: scheme.onSurface, width: 2)
                : BorderSide.none,
          ),
          onFocusChange: (focused) => setState(() => _focused = focused),
          selected: widget.selected,
          selectedColor: scheme.onPrimaryContainer,
          selectedTileColor: scheme.primaryContainer,
          focusColor: scheme.onSurface.withValues(alpha: 0.16),
          leading: ExcludeSemantics(child: widget.leading),
          title: Text(widget.label),
          subtitle: widget.description == null
              ? null
              : Text(widget.description!),
          trailing: widget.selected
              ? const ExcludeSemantics(child: Icon(Icons.check_rounded))
              : const SizedBox(width: 24),
          onTap: widget.onTap,
        ),
      ),
    );
  }
}

class _PaletteSwatches extends StatelessWidget {
  const _PaletteSwatches({required this.scheme});

  final ColorScheme scheme;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final color in [
          scheme.primary,
          scheme.primaryContainer,
          scheme.surface,
        ])
          Container(
            width: 14,
            height: 14,
            margin: const EdgeInsets.only(right: 2),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: color,
              border: Border.all(color: scheme.outline),
            ),
          ),
      ],
    );
  }
}

class _ThemePreview extends StatelessWidget {
  const _ThemePreview({required this.selection});

  final AccountThemeSelection selection;

  @override
  Widget build(BuildContext context) {
    final preview = buildAccountTheme(selection).colorScheme;
    return ExcludeSemantics(
      child: DecoratedBox(
        key: const ValueKey('appearance-preview'),
        decoration: BoxDecoration(
          color: preview.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: preview.outline),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'LeoVital HealthLink',
                style: Theme.of(context).textTheme.titleMedium
                    ?.copyWith(color: preview.onSurface),
              ),
              const SizedBox(height: 12),
              Container(
                height: 16,
                width: 112,
                decoration: BoxDecoration(
                  color: preview.primary,
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
            ],
          ),
        ),
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
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Semantics(
              liveRegion: true,
              child: Text(status, style: TextStyle(color: scheme.onSurface)),
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
