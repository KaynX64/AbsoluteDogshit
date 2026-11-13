// server/src/utils/mailer.js
import 'dotenv/config';
import nodemailer from 'nodemailer';

function requiredEnv(name) {
  const val = process.env[name];
  if (!val) {
    throw new Error(`[Mailer] Missing required environment variable: ${name}`);
  }
  return val;
}

// ── mailer.js:5-12 ─────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  requireTLS: true, // never send PHI mail in cleartext
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: requiredEnv('SMTP_PASS') }
    : undefined,
});

// ── SEC-07 Remediation: HTML-escape every dynamic email parameter ──
// patientName / doctorName come from user-controlled registration data and
// purpose (appointment_type) from the booking form. Concatenating them raw
// into the HTML body allowed markup & phishing-link injection into emails
// delivered to students and clinical staff (audit SEC-07, CVSS 6.1).
// Every dynamic interpolation below now passes through this escaper.
function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

export async function sendAppointmentEmail({ toEmail, patientName, doctorName, specialty, dateTime, purpose, type }) {
  let subject = '';
  let html = '';

  if (type === 'confirmation') {
    subject = '✅ PSU Infirmary: Consultation Appointment Confirmed';
    html = `
      <h2>Consultation Scheduled</h2>
      <p>Dear <b>${escapeHtml(patientName)}</b>,</p>
      <p>Your appointment at the PSU Lingayen Campus Infirmary has been confirmed.</p>
      <ul>
        <li><b>Practitioner:</b> Dr. ${escapeHtml(doctorName)} (${escapeHtml(specialty)})</li>
        <li><b>Date & Time:</b> ${escapeHtml(dateTime)}</li>
        <li><b>Purpose:</b> ${escapeHtml(purpose)}</li>
      </ul>
      <p><b>Reminders:</b></p>
      <ul>
        <li>Please arrive 10 minutes prior to your scheduled block.</li>
        <li>Present your <b>Dynamic QR Health Pass</b> from your mobile app upon arrival.</li>
      </ul>
    `;
  } else if (type === 'reminder') {
    subject = '⏰ Reminder: Upcoming Consultation at PSU Infirmary';
    html = `
      <h2>Appointment Reminder</h2>
      <p>Dear <b>${escapeHtml(patientName)}</b>,</p>
      <p>This is a reminder for your upcoming consultation today at <b>${escapeHtml(dateTime)}</b> with Dr. ${escapeHtml(doctorName)}.</p>
      <p>Location: PSU Lingayen Campus Infirmary.</p>
    `;
  } else if (type === 'cancellation') {
    subject = '⚠️ Consultation Appointment Cancelled';
    html = `
      <h2>Appointment Cancelled</h2>
      <p>Dear <b>${escapeHtml(patientName)}</b>,</p>
      <p>Your consultation appointment scheduled for <b>${escapeHtml(dateTime)}</b> has been cancelled.</p>
    `;
  }

  try {
    // If running in development without real SMTP credentials, log the email
    if (!process.env.SMTP_HOST) {
      console.log(`[Email Dispatch Simulation] ${type}`);
      return true;
    }
    await transporter.sendMail({
      from: '"PSU Lingayen HealthLink" <no-reply@psu.edu.ph>',
      to: toEmail,
      subject,
      html,
    });
    return true;
  } catch (err) {
    console.error('[Email Dispatch Error]:', err.code || err.name);
    return false;
  }
}
