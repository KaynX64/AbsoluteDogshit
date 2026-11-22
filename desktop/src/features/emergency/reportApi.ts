import { API_BASE_URL } from '../../config/api';
import { CLIENT_INSTANCE_ID } from '../../platform/realtime/clientInstance';

export class ReportApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) { super(message); this.status = status; this.code = code; }
}

export async function reportRequest<T>(path: string, init: RequestInit = {}, pdf = false): Promise<T> {
  const token = localStorage.getItem('valetudo_token');
  const response = await fetch(`${API_BASE_URL}/api/emergency${path}`, {
    ...init, cache: 'no-store',
    signal: AbortSignal.any([...(init.signal ? [init.signal] : []), AbortSignal.timeout(15000)]),
    headers: { Authorization: `Bearer ${token}`, 'X-Client-Instance-Id': CLIENT_INSTANCE_ID,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
  if (localStorage.getItem('valetudo_token') !== token) throw new DOMException('Session changed', 'AbortError');
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ReportApiError(body.error || 'Responder records are unavailable. Please retry.', response.status, body.code);
  }
  return (pdf ? response.blob() : response.json()) as Promise<T>;
}

export interface ReportSummary { pending: number; overdue: number; drafts: number; canViewFiled: boolean }
export interface HistoryRecord {
  alertId: number; status: string; patient: { userId: number; name: string; identifier: string; phone?: string };
  location: string | null; latitude: number | null; longitude: number | null;
  createdAt: string; acknowledgedAt: string | null; resolvedAt: string | null;
  reportId: number | null; filedAt: string | null; documentedByName: string | null;
  hasDraft: boolean; draftUpdatedAt: string | null; deferredAt: string | null; needsReport: boolean;
  timeline?: Array<{ status: string; at: string; actor: string | null }>;
}
export interface FiledReport { reportId: number; alertId: number; patientName: string; incidentDetails: string; treatmentNotes: string | null;
  resolvedAt: string; filedAt: string; documentedByName: string; pdfAvailable: boolean }
export interface RecordPage { records: HistoryRecord[]; nextCursor: string | null }
export interface ReportDraft { revision: number; incidentDetails: string; treatmentNotes: string; resolvedAt: string | null }

const dateTime = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
export const reportedDate = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? dateTime.format(new Date(value)) : 'Not recorded';
export const outcomeLabel = (value: string) => ({ triggered: 'Reported', acknowledged: 'Acknowledged', dispatched: 'Dispatched', resolved: 'Resolved', false_alarm: 'False alarm', report_filed: 'Report filed' }[value] || value);
export const needsAttention = (row: HistoryRecord) => row.needsReport && row.resolvedAt !== null && Date.now() - Date.parse(row.resolvedAt) > 86400000;
