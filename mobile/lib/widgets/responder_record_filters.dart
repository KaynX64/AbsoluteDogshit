import 'package:material_ui/material_ui.dart';

class ResponderRecordFilters extends StatelessWidget {
  const ResponderRecordFilters({
    super.key,
    required this.search,
    required this.period,
    required this.outcome,
    required this.history,
    required this.onSearch,
    required this.onClear,
    required this.onPeriod,
    required this.onOutcome,
  });
  final TextEditingController search;
  final String period, outcome;
  final bool history;
  final ValueChanged<String> onSearch, onPeriod, onOutcome;
  final VoidCallback onClear;

  static const _dates = [
    ('all', 'All time', Icons.all_inclusive),
    ('30', 'Last 30 days', Icons.calendar_today_outlined),
    ('custom', 'Choose dates', Icons.date_range_outlined),
  ];
  static const _outcomes = [
    ('all', 'All outcomes', Icons.filter_list_rounded),
    ('resolved', 'Resolved', Icons.task_alt_rounded),
    ('false_alarm', 'False alarms', Icons.notifications_off_outlined),
  ];

  Future<void> _choose(BuildContext context, bool dates) async {
    final options = dates ? _dates : _outcomes;
    final value = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      useSafeArea: true,
      isScrollControlled: true,
      builder: (context) => SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                dates ? 'Filter by date' : 'Filter by outcome',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 12),
              for (final option in options)
                ListTile(
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                  selected: option.$1 == (dates ? period : outcome),
                  selectedTileColor: Theme.of(context)
                      .colorScheme
                      .primaryContainer,
                  selectedColor: Theme.of(context)
                      .colorScheme
                      .onPrimaryContainer,
                  leading: Icon(option.$3),
                  title: Text(option.$2),
                  trailing: option.$1 == (dates ? period : outcome)
                      ? const Icon(Icons.check_rounded)
                      : null,
                  onTap: () => Navigator.pop(context, option.$1),
                ),
            ],
          ),
        ),
      ),
    );
    if (context.mounted && value != null) {
      (dates ? onPeriod : onOutcome)(value);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context), colors = theme.colorScheme;
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: BorderSide(color: colors.outlineVariant),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ValueListenableBuilder<TextEditingValue>(
          valueListenable: search,
          builder: (context, value, _) => TextField(
            controller: search,
            style: theme.textTheme.bodyMedium,
            onChanged: onSearch,
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: 'Search records',
              hintStyle: theme.textTheme.bodyMedium?.copyWith(
                color: colors.onSurfaceVariant,
              ),
              prefixIcon: Icon(
                Icons.search_rounded,
                color: colors.primary,
                size: 22,
              ),
              suffixIcon: value.text.isEmpty
                  ? null
                  : IconButton(
                      tooltip: 'Clear search',
                      onPressed: onClear,
                      icon: const Icon(Icons.close_rounded, size: 20),
                    ),
              filled: true,
              fillColor: colors.surfaceContainerLow,
              isDense: true,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 14,
                vertical: 14,
              ),
              border: border,
              enabledBorder: border,
              focusedBorder: border.copyWith(
                borderSide: BorderSide(color: colors.primary, width: 1.5),
              ),
            ),
          ),
        ),
        const SizedBox(height: 10),
        LayoutBuilder(
          builder: (context, constraints) {
            final vertical =
                constraints.maxWidth < 340 ||
                MediaQuery.textScalerOf(context).scale(14) > 19;
            final dates = _button(
              context,
              _dates.firstWhere((item) => item.$1 == period).$2,
              Icons.date_range_outlined,
              'Filter by date',
              () => _choose(context, true),
            );
            final status = _button(
              context,
              _outcomes.firstWhere((item) => item.$1 == outcome).$2,
              Icons.filter_list_rounded,
              'Filter by outcome',
              () => _choose(context, false),
            );
            if (!history) return dates;
            return vertical
                ? Column(children: [dates, const SizedBox(height: 8), status])
                : Row(
                    children: [
                      Expanded(child: dates),
                      const SizedBox(width: 10),
                      Expanded(child: status),
                    ],
                  );
          },
        ),
      ],
    );
  }

  Widget _button(
    BuildContext context,
    String label,
    IconData icon,
    String tooltip,
    VoidCallback onPressed,
  ) => Tooltip(
    message: tooltip,
    child: OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(48),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        backgroundColor: Theme.of(context).colorScheme.surfaceContainerLowest,
        foregroundColor: Theme.of(context).colorScheme.onSurface,
        side: BorderSide(color: Theme.of(context).colorScheme.outlineVariant),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      child: Row(
        children: [
          Icon(icon, size: 18, color: Theme.of(context).colorScheme.primary),
          const SizedBox(width: 8),
          Expanded(child: Text(label)),
          const SizedBox(width: 4),
          const Icon(Icons.expand_more_rounded, size: 18),
        ],
      ),
    ),
  );
}
