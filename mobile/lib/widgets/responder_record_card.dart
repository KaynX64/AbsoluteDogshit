import 'package:material_ui/material_ui.dart';

import '../models/responder_records.dart';
import 'responder_style.dart';

class ResponderRecordCard extends StatelessWidget {
  const ResponderRecordCard({
    super.key,
    required this.record,
    required this.time,
    required this.onTap,
    this.deferredTime,
  });
  final ResponderRecord record;
  final String time;
  final String? deferredTime;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context), colors = theme.colorScheme;
    final row = record;
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 0,
      color: colors.surfaceContainerLowest,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(color: colors.outlineVariant),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(9),
                    decoration: BoxDecoration(
                      color: colors.primaryContainer,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(
                      row.pending
                          ? Icons.assignment_late_outlined
                          : Icons.history_rounded,
                      color: colors.onPrimaryContainer,
                      size: 20,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'SOS-${row.id}${row.reportId == null ? '' : ' · IR-${row.reportId}'}',
                      style: theme.textTheme.titleMedium,
                    ),
                  ),
                  Icon(
                    Icons.chevron_right_rounded,
                    color: colors.onSurfaceVariant,
                  ),
                ],
              ),
              const SizedBox(height: 14),
              Text(
                row.name,
                style: theme.textTheme.titleMedium?.copyWith(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                row.identifier,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: colors.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 12),
              _line(context, Icons.place_outlined, row.location),
              const SizedBox(height: 8),
              _line(context, Icons.schedule_rounded, time),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  ResponderBadge(
                    label: responderOutcome(row.status),
                    icon: row.status == 'false_alarm'
                        ? Icons.notifications_off_outlined
                        : Icons.task_alt_rounded,
                  ),
                  if (row.needsAttention)
                    const ResponderBadge(
                      label: 'Over 24 hours',
                      icon: Icons.schedule_rounded,
                      attention: true,
                    ),
                ],
              ),
              if (row.pending) ...[
                const SizedBox(height: 12),
                _line(
                  context,
                  Icons.desktop_windows_outlined,
                  'Complete this report in the desktop app.',
                ),
              ],
              if (row.hasDraft) ...[
                const SizedBox(height: 8),
                _line(
                  context,
                  Icons.edit_note_rounded,
                  'Draft saved on desktop',
                ),
              ],
              if (deferredTime != null) ...[
                const SizedBox(height: 8),
                Text(
                  'Last deferred $deferredTime',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: colors.onSurfaceVariant,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _line(BuildContext context, IconData icon, String text) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Padding(
        padding: const EdgeInsets.only(top: 2),
        child: Icon(
          icon,
          size: 16,
          color: Theme.of(context).colorScheme.onSurfaceVariant,
        ),
      ),
      const SizedBox(width: 8),
      Expanded(
        child: Text(
          text,
          style: Theme.of(context).textTheme.bodySmall
              ?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
        ),
      ),
    ],
  );
}
