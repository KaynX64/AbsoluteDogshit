class ReportWorkSummary {
  const ReportWorkSummary({
    required this.pending,
    required this.overdue,
    required this.canViewFiled,
  });
  factory ReportWorkSummary.fromJson(Map<String, dynamic> data) =>
      ReportWorkSummary(
        pending: (data['pending'] as num).toInt(),
        overdue: (data['overdue'] as num).toInt(),
        canViewFiled: data['canViewFiled'] == true,
      );
  final int pending, overdue;
  final bool canViewFiled;
}

class ResponderRecord {
  ResponderRecord(this.data);
  final Map<String, dynamic> data;
  int get id => (data['alertId'] as num).toInt();
  int? get reportId => (data['reportId'] as num?)?.toInt();
  String get name => data['patient']?['name'] as String? ?? 'Campus member';
  String get identifier => data['patient']?['identifier'] as String? ?? '';
  String get status => data['status'] as String? ?? '';
  String get location => data['location'] as String? ?? 'Location not recorded';
  bool get pending => data['needsReport'] == true;
  bool get hasDraft => data['hasDraft'] == true;
  DateTime? date(String key) =>
      DateTime.tryParse(data[key]?.toString() ?? '')
          ?.toUtc()
          .add(const Duration(hours: 8));
  bool get needsAttention =>
      pending &&
      data['resolvedAt'] != null &&
      DateTime.now()
              .toUtc()
              .difference(DateTime.parse(data['resolvedAt'] as String))
              .inHours >=
          24;
}

String responderOutcome(String value) => switch (value) {
  'triggered' => 'Reported',
  'acknowledged' => 'Acknowledged',
  'dispatched' => 'Dispatched',
  'resolved' => 'Resolved',
  'false_alarm' => 'False alarm',
  'report_filed' => 'Report filed',
  _ => value,
};
