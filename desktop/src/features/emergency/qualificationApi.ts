import { API_BASE_URL } from '../../config/api';

export const qualificationBase = `${API_BASE_URL}/api/responder-qualifications`;
export const editableQualifications = ['draft', 'needs_information', 'training_required'];
export const openQualifications = [...editableQualifications, 'submitted', 'under_review'];
const labels: Record<string, string> = {
  draft: 'Draft', submitted: 'Awaiting review', under_review: 'Under review', needs_information: 'Changes requested',
  training_required: 'Training required', approved: 'Approved', rejected: 'Not approved', withdrawn: 'Withdrawn',
  community: 'Community responder', staff: 'Response staff', active: 'Active', suspended: 'Suspended', expired: 'Expired', revoked: 'Revoked',
  initial: 'Initial application', renewal: 'Renewal', not_assessed: 'Not assessed', passed: 'Passed', failed: 'Needs further training',
};
export const qualificationLabel = (value: string = '') => labels[value] || value.replaceAll('_', ' ');
export const qualificationDate = (value?: string) => value ? new Date(value).toLocaleDateString(undefined, { timeZone: 'Asia/Manila' }) : '—';
export class QualificationError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
export async function qualificationApi(path: string, method = 'GET', body?: unknown, signal?: AbortSignal) {
  const response = await fetch(qualificationBase + path, {
    method, signal, headers: { Authorization: `Bearer ${localStorage.getItem('valetudo_token')}`,
      ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
    body: body == null ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new QualificationError(data.error || 'Request failed.', response.status);
  return data;
}
export type QualificationDraft = {
  revision: number; userId: number; affiliation: string; training: string; level: string; accepted: boolean; assessment: any; reason: string;
};
export const qualificationDraft = (row: any): QualificationDraft => ({
  revision: row.revision, userId: Number(row.user_id), affiliation: row.form?.affiliation || '', training: row.form?.trainingHistory || '',
  level: row.requested_level || 'community', accepted: Boolean(row.responsibilities_accepted_at),
  assessment: row.assessment || { competencies: {}, result: 'not_assessed' }, reason: '',
});
