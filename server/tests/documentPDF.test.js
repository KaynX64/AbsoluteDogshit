// Checks prescription, clearance, and incident report PDF rendering with representative fixtures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderIncidentReportPDF } from '../src/documents/pdf/templates/incidentReport.js';
import { renderPrescriptionPDF } from '../src/documents/pdf/templates/prescription.js';
import { renderClearancePDF } from '../src/documents/pdf/templates/clearance.js';

test('the prescription and clearance templates render signed-document PDF buffers', async () => {
  const fixture = {
    patient: { first_name: 'Fixture', last_name: 'Patient' },
    doctor: { first_name: 'Fixture', last_name: 'Clinician', role_code: 'DOCTOR', license_no: 'FIXTURE-1' },
    issued_at: '2026-01-01',
    expires_at: '2026-02-01',
    qr_token: 'fixture-token',
    verification_url: 'https://localhost/verify/fixture-token',
  };
  const documents = await Promise.all([
    renderPrescriptionPDF({ ...fixture, prescription_id: 7, items: [{ medicine_name: 'Fixture medicine',
      dosage: 'Fixture dose', frequency: 'Fixture frequency', route: 'Fixture route', duration_days: 1,
      quantity_prescribed: 1, quantity_dispensed: 0, is_outside: true }] }),
    renderClearancePDF({ ...fixture, clearance_id: 8, purpose: 'Fixture purpose', remarks: 'Fixture statement' }),
  ]);
  for (const pdf of documents) {
    assert.ok(Buffer.isBuffer(pdf));
    assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');
    assert.ok(pdf.length > 500);
  }
});

test('renderIncidentReportPDF generates a valid PDF buffer', async () => {
  const sampleData = {
    report_id: 12,
    alert_id: 45,
    patient: {
      first_name: 'Juan',
      last_name: 'Dela Cruz',
      id_no: 'PSU-2024-00123',
      role: 'STUDENT',
      affiliation: 'BS Computer Science',
      phone: '09123456789',
      blood_type: 'O+',
      allergies: 'Penicillin',
    },
    alert: {
      created_at: new Date('2026-11-07T10:00:00Z'),
      acknowledged_at: new Date('2026-11-07T10:01:30Z'),
      resolved_at: new Date('2026-11-07T10:14:00Z'),
      response_time_seconds: 840,
      notes: 'Reported dizziness and fall near College of Science building.',
      latitude: 16.0256,
      longitude: 120.2289,
    },
    report: {
      resolved_at: new Date('2026-11-07T10:14:00Z'),
      created_at: new Date('2026-11-07T10:15:30Z'),
      incident_details:
        'Patient slipped on wet corridor tiles resulting in a minor elbow contusion and brief disorientation. Conscious and responsive upon response team arrival.',
      treatment_notes:
        'Cleaned abrasion with saline solution and applied sterile dressing. Ice pack placed on left elbow. Monitored BP (118/76) and pulse (74 bpm) for 15 minutes. Patient was stable and released with advice to rest.',
    },
    documented_by: {
      first_name: 'Maria',
      last_name: 'Santos',
      license_no: 'RN-0098765',
    },
    assigned_responder: {
      first_name: 'Pedro',
      last_name: 'Reyes',
      license_no: 'ER-0043',
    },
    verification_url: 'https://localhost:5000/api/emergency/incident-reports/12/pdf',
  };

  const buffer = await renderIncidentReportPDF(sampleData);

  assert.ok(Buffer.isBuffer(buffer), 'Result should be a Node.js Buffer');
  assert.ok(buffer.length > 500, `Buffer size (${buffer.length}) should be non-trivial`);
  // Every valid PDF begins with %PDF-
  const header = buffer.subarray(0, 5).toString('ascii');
  assert.equal(header, '%PDF-', 'Buffer should start with PDF magic header');
});

test('renderIncidentReportPDF handles sparse and fallback data cleanly without throwing', async () => {
  const minimalData = {
    report_id: 1,
    alert_id: 2,
    patient: {
      first_name: 'Test',
      last_name: 'Patient',
    },
    alert: {},
    report: {
      resolved_at: new Date(),
      created_at: new Date(),
      incident_details: 'Minimal incident details test.',
      treatment_notes: null,
    },
    documented_by: {
      first_name: 'Admin',
      last_name: 'User',
    },
  };

  const buffer = await renderIncidentReportPDF(minimalData);
  assert.ok(Buffer.isBuffer(buffer));
  assert.ok(buffer.length > 500);
  assert.equal(buffer.subarray(0, 5).toString('ascii'), '%PDF-');
});
