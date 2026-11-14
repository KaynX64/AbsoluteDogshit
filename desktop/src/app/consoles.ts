// All staff workspaces load together so later role switches can render immediately.
export { default as NurseConsole } from '../features/nurse/NurseConsole';
export { default as DoctorConsole } from '../features/consultations/DoctorConsole';
export { default as AdminConsole } from '../features/admin/AdminConsole';
export { default as ResponderConsole } from '../features/emergency/ResponderConsole';
export { default as IncidentReportModal } from '../features/emergency/IncidentReportModal';
