/// Presentation of recorded prescriptions. Missing legacy details stay missing.
class PrescriptionItemView {
  PrescriptionItemView(this.item);
  final Map<dynamic, dynamic> item;
  static String recorded(dynamic value) =>
      value == null || value.toString().trim().isEmpty
      ? 'Not recorded'
      : value.toString();
  bool get structured => item['contract_version'].toString() == '2';
  bool get external => item['is_outside'] == true || item['is_outside'] == 1;
  String get name {
    final name = recorded(item['medicine_name']);
    final generic = item['generic_name']?.toString().trim() ?? '';
    return structured || generic.isEmpty ? name : '$name ($generic)';
  }

  String get dosage => recorded(item['dosage']);
  String get preparation =>
      'Strength: ${recorded(item['strength'])} • Form: ${recorded(item['form'])}';
  String get administration =>
      'Dose: $dosage • Route: ${recorded(item['route'])}';
  String get schedule => 'Schedule: ${recorded(item['frequency'])}';
  String get directions => 'Directions: ${recorded(item['instructions'])}';
  String get supply {
    final unit = structured
        ? recorded(item['quantity_unit'])
        : 'unit not recorded';
    final pack =
        structured && (item['pack_size']?.toString().isNotEmpty ?? false)
        ? ' (${item['pack_size']})'
        : '';
    return 'Supply: ${recorded(item['quantity_prescribed'] ?? item['quantity_dispensed'])} $unit$pack';
  }

  String get course {
    if (structured) {
      return [
        if (item['duration_days'] != null)
          'Duration: ${item['duration_days']} days',
        if (item['review_on']?.toString().isNotEmpty ?? false)
          'Review on: ${item['review_on']}',
      ].join(' • ');
    }
    return 'Duration: ${recorded(item['duration_days'])}${item['duration_days'] == null ? '' : ' days'}';
  }
}
