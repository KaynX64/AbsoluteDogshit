import 'package:flutter/foundation.dart';

enum ResponderDutyMode {
  onDuty('on_duty', 'On duty'),
  quiet('quiet', 'Quiet'),
  offDuty('off_duty', 'Off duty');

  const ResponderDutyMode(this.code, this.label);
  final String code;
  final String label;

  static ResponderDutyMode read(String? value) =>
      values.firstWhere((mode) => mode.code == value, orElse: () => onDuty);
}

enum IncidentStatus {
  triggered('Triggered'),
  acknowledged('Acknowledged'),
  dispatched('Dispatched'),
  resolved('Resolved'),
  falseAlarm('False alarm');

  const IncidentStatus(this.label);
  final String label;
  String get code => this == falseAlarm ? 'false_alarm' : name;
  bool get isClosed => index >= resolved.index;

  static IncidentStatus? read(Object? value) =>
      values.where((status) => status.code == value).firstOrNull;
}

class Incident {
  const Incident({
    required this.id,
    required this.userId,
    required this.status,
    required this.patientName,
    required this.roleLabel,
    this.identifier,
    this.phone,
    this.location,
    this.latitude,
    this.longitude,
    this.bloodType,
    this.allergies,
    this.medicalDetailsRedacted = true,
  });

  static int? readId(Object? value) {
    final id = int.tryParse('$value');
    return id != null && id > 0 ? id : null;
  }

  static Incident? parse(Map<dynamic, dynamic> value) {
    final id = readId(value['alertId'] ?? value['alert_id']);
    final userId = readId(value['userId'] ?? value['user_id']);
    final status = IncidentStatus.read(value['status']);
    if (id == null || userId == null || status == null) return null;
    String? label(Object? value) =>
        value is String && value.trim().isNotEmpty ? value.trim() : null;
    final name = [
      label(value['first_name']),
      label(value['last_name']),
    ].nonNulls.join(' ');
    final lat = double.tryParse('${value['latitude']}');
    final lng = double.tryParse('${value['longitude']}');
    final validLocation =
        lat != null &&
        lng != null &&
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng <= 180;
    final redacted = value['medicalDetailsRedacted'] != false;
    return Incident(
      id: id,
      userId: userId,
      status: status,
      patientName:
          label(value['patientName']) ??
          (name.isEmpty ? 'Campus member' : name),
      roleLabel: label(value['roleLabel']) ?? 'Campus member',
      identifier: label(value['studentNo'] ?? value['identifier_no']),
      phone: label(value['phone']),
      location: label(value['formattedAddress']),
      latitude: validLocation ? lat : null,
      longitude: validLocation ? lng : null,
      bloodType: redacted
          ? null
          : label(value['bloodType'] ?? value['blood_type']),
      allergies: redacted ? null : label(value['allergies']),
      medicalDetailsRedacted: redacted,
    );
  }

  final int id, userId;
  final IncidentStatus status;
  final String patientName, roleLabel;
  final String? identifier, phone, location, bloodType, allergies;
  final double? latitude, longitude;
  final bool medicalDetailsRedacted;

  Incident withStatus(IncidentStatus status) => Incident(
    id: id,
    userId: userId,
    status: status,
    patientName: patientName,
    roleLabel: roleLabel,
    identifier: identifier,
    phone: phone,
    location: location,
    latitude: latitude,
    longitude: longitude,
    bloodType: bloodType,
    allergies: allergies,
    medicalDetailsRedacted: medicalDetailsRedacted,
  );

  String get reportedLocation =>
      location ??
      (latitude == null
          ? 'Location unavailable'
          : '${latitude!.toStringAsFixed(5)}, ${longitude!.toStringAsFixed(5)}');
}

class ResponderRoster extends ChangeNotifier {
  final _incidents = <int, Incident>{};
  final _statuses = <int, IncidentStatus>{};
  final _changedAt = <int, int>{};
  final _muted = <int>{};
  int _revision = 0;
  int get revision => _revision;
  int? _userId;
  String? _tier;
  String? get tier => _tier;
  bool get eligible => _tier != null;
  bool qualified = false;
  bool loading = false;
  bool failed = false;
  ResponderDutyMode mode = ResponderDutyMode.onDuty;

  List<Incident> get incidents => _incidents.values.toList()
    ..sort((a, b) {
      final status = a.status.index.compareTo(b.status.index);
      return status == 0 ? b.id.compareTo(a.id) : status;
    });
  Incident? operator [](int id) => _incidents[id];
  bool isMuted(int id) => _muted.contains(id);
  bool get shouldRing =>
      eligible &&
      mode == ResponderDutyMode.onDuty &&
      _incidents.values.any(
        (incident) =>
            incident.status == IncidentStatus.triggered &&
            !isMuted(incident.id),
      );

  void begin(int? userId) {
    _userId = userId;
    mode = ResponderDutyMode.onDuty;
    setAccess(null, false);
  }

  void setAccess(String? tier, bool isQualified) {
    if (_tier != tier || tier == null) {
      _incidents.clear();
      _statuses.clear();
      _changedAt.clear();
      _muted.clear();
      loading = false;
      failed = false;
      _revision++;
    }
    _tier = tier;
    qualified = isQualified;
    notifyListeners();
  }

  void setMode(ResponderDutyMode value) {
    mode = value;
    if (value == ResponderDutyMode.offDuty) _incidents.clear();
    notifyListeners();
  }

  void setLoading(bool value, {bool error = false}) {
    loading = value;
    failed = error;
    notifyListeners();
  }

  void toggleMute(int id) {
    if (!_incidents.containsKey(id)) return;
    if (!_muted.remove(id)) _muted.add(id);
    notifyListeners();
  }

  void accept(Incident incident) {
    if (!eligible || mode == ResponderDutyMode.offDuty || !_allowed(incident)) {
      return;
    }
    final existing = _statuses[incident.id];
    if (existing?.isClosed == true || _incidents.containsKey(incident.id)) {
      return;
    }
    _store(incident);
    notifyListeners();
  }

  bool _allowed(Incident incident) =>
      incident.userId != _userId &&
      (_tier == 'clinical' || incident.medicalDetailsRedacted);

  void statusChanged(int id, IncidentStatus status) {
    if (!eligible) return;
    final previous = _statuses[id];
    if (previous != null &&
        (previous.isClosed || previous.index >= status.index)) {
      return;
    }
    _statuses[id] = status;
    _changedAt[id] = ++_revision;
    if (status.isClosed) {
      _incidents.remove(id);
      _muted.remove(id);
    } else if (_incidents[id] case final incident?) {
      _incidents[id] = incident.withStatus(status);
    }
    notifyListeners();
  }

  void reconcile(Iterable<Incident> snapshot, int requestedAt) {
    if (!eligible) return;
    final incoming = {
      for (final incident in snapshot)
        if (_allowed(incident)) incident.id: incident,
    };
    _incidents.removeWhere((id, incident) {
      if (incoming.containsKey(id) || (_changedAt[id] ?? 0) > requestedAt) {
        return false;
      }
      // A complete authorized snapshot no longer lists this incident.
      _statuses[id] = IncidentStatus.resolved;
      _muted.remove(id);
      return true;
    });
    for (final incident in incoming.values) {
      if (_statuses[incident.id]?.isClosed != true &&
          ((_changedAt[incident.id] ?? 0) <= requestedAt ||
              !_incidents.containsKey(incident.id))) {
        _store(incident);
      }
    }
    notifyListeners();
  }

  void _store(Incident incident) {
    final previous = _statuses[incident.id];
    final status = previous != null && previous.index > incident.status.index
        ? previous
        : incident.status;
    _statuses[incident.id] = status;
    _changedAt[incident.id] = ++_revision;
    if (!status.isClosed) _incidents[incident.id] = incident.withStatus(status);
  }
}
