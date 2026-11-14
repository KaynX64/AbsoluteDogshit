const consultationViews = [
  { key: 'active',    label: 'Queue',            icon: 'stethoscope' },
  { key: 'scheduled', label: 'Bookings',         icon: 'event' },
  { key: 'history',   label: 'History',          icon: 'history' },
  { key: 'archive',   label: 'EMR',              icon: 'folder_shared' },
  { key: 'analytics', label: 'Analytics',        icon: 'monitoring' },
];

const navByRole: Record<string, { key: string; label: string; icon: string }[]> = {
  ADMIN: [
    { key: 'users',     label: 'Users & roles',    icon: 'manage_accounts' },
    { key: 'audit',     label: 'Privacy & audit',  icon: 'shield_lock' },
    { key: 'telemetry', label: 'System health',    icon: 'dns' },
    { key: 'serverPolicy', label: 'Server Policy', icon: 'tune' },
    { key: 'terminal', label: 'Terminal', icon: 'terminal' },
    { key: 'analytics', label: 'Health analytics', icon: 'monitoring' },
    { key: 'incidents', label: 'Incident Records', icon: 'assignment' },
    { key: 'db',        label: 'Database Studio',  icon: 'database' },
  ],
  NURSE: [
    { key: 'triage',    label: 'Triage',           icon: 'local_hospital' },
    { key: 'expected',  label: 'Expected',         icon: 'monitor_heart' },
    { key: 'inventory', label: 'Inventory',        icon: 'medication' },
    { key: 'analytics', label: 'Analytics',        icon: 'monitoring' },
  ],
  DOCTOR: consultationViews,
  DENTIST: consultationViews,
  EMERGENCY_RESPONDER: [
    { key: 'dispatch',  label: 'Dispatch',         icon: 'emergency' },
  ],
};

export function consoleNavigation(role: string) {
  return navByRole[role] ?? navByRole.ADMIN;
}
