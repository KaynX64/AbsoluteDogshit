import 'package:material_ui/material_ui.dart';

/// A scrollable summary of the exact details that will be sent on confirmation.
class AppointmentBookingReview extends StatelessWidget {
  const AppointmentBookingReview({
    super.key,
    required this.clinician,
    required this.specialty,
    required this.purpose,
    required this.date,
    required this.time,
    required this.notes,
  });

  final String clinician;
  final String specialty;
  final String purpose;
  final DateTime date;
  final String time;
  final String notes;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    return AlertDialog(
      backgroundColor: colors.surface,
      surfaceTintColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      constraints: const BoxConstraints(maxWidth: 480),
      scrollable: true,
      icon: Icon(
        Icons.event_available_outlined,
        color: colors.primary,
        size: 32,
      ),
      title: const Text('Review your appointment'),
      titleTextStyle: theme.textTheme.titleLarge?.copyWith(
        color: colors.onSurface,
        fontWeight: FontWeight.w800,
      ),
      content: SizedBox(
        width: 400,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Check your visit details before confirming.',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: colors.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 20),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: colors.primaryContainer,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Your care team',
                    style: theme.textTheme.labelLarge?.copyWith(
                      color: colors.onPrimaryContainer,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    clinician,
                    style: theme.textTheme.titleMedium?.copyWith(
                      color: colors.onPrimaryContainer,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  if (specialty.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      specialty,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: colors.onPrimaryContainer,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 20),
            _ReviewDetail(
              icon: Icons.medical_services_outlined,
              label: 'Visit purpose',
              value: purpose,
            ),
            _ReviewDetail(
              icon: Icons.calendar_today_outlined,
              label: 'Date',
              value: MaterialLocalizations.of(context).formatFullDate(date),
            ),
            _ReviewDetail(
              icon: Icons.schedule_outlined,
              label: 'Time',
              value: time,
            ),
            const _ReviewDetail(
              icon: Icons.location_on_outlined,
              label: 'Location',
              value: 'PSU Lingayen Campus Infirmary',
            ),
            _ReviewDetail(
              icon: Icons.notes_outlined,
              label: 'Notes for your care team',
              value: notes.isEmpty ? 'No additional notes' : notes,
            ),
            Text(
              'Arrive 10 minutes early and bring your university ID and QR Health Pass.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: colors.onSurfaceVariant,
                height: 1.5,
              ),
            ),
          ],
        ),
      ),
      actionsPadding: const EdgeInsets.fromLTRB(24, 8, 24, 20),
      actionsOverflowButtonSpacing: 12,
      actions: [
        OutlinedButton(
          autofocus: true,
          style: OutlinedButton.styleFrom(minimumSize: const Size(0, 48)),
          onPressed: () => Navigator.pop(context, false),
          child: const Text('Edit details', textAlign: TextAlign.center),
        ),
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size(0, 48)),
          onPressed: () => Navigator.pop(context, true),
          child: const Text('Confirm appointment', textAlign: TextAlign.center),
        ),
      ],
    );
  }
}

class _ReviewDetail extends StatelessWidget {
  const _ReviewDetail({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Icon(icon, size: 22, color: colors.primary),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: colors.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  value,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: colors.onSurface,
                    fontWeight: FontWeight.w600,
                    height: 1.4,
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
