// Builds document verification and incident report URLs from the configured public API origin.

const API_BASE_URL = process.env.PUBLIC_API_BASE_URL || 'https://localhost:5000';

export const verificationUrl = token => `${API_BASE_URL}/api/documents/verify/${encodeURIComponent(token)}`;
export const incidentReportPdfUrl = reportId => `${API_BASE_URL}/api/emergency/incident-reports/${reportId}/pdf`;
