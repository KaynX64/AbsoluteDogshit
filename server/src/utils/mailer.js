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

export async function sendAppointmentEmail({ toEmail, patientName, doctorName, specialty, dateTime, purpose, type }) {
  let subject = '';
  let html = '';

  if (type === 'confirmation') {
    subject = '✅ PSU Infirmary: Consultation Appointment Confirmed';
    html = `
      <h2>Consultation Scheduled</h2>
      <p>Dear <b>${patientName}</b>,</p>
      <p>Your appointment at the PSU Lingayen Campus Infirmary has been confirmed.</p>
      <ul>
        <li><b>Practitioner:</b> Dr. ${doctorName} (${specialty})</li>
        <li><b>Date & Time:</b> ${dateTime}</li>
        <li><b>Purpose:</b> ${purpose}</li>
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
      <p>Dear <b>${patientName}</b>,</p>
      <p>This is a reminder for your upcoming consultation today at <b>${dateTime}</b> with Dr. ${doctorName}.</p>
      <p>Location: PSU Lingayen Campus Infirmary.</p>
    `;
  } else if (type === 'cancellation') {
    subject = '⚠️ Consultation Appointment Cancelled';
    html = `
      <h2>Appointment Cancelled</h2>
      <p>Dear <b>${patientName}</b>,</p>
      <p>Your consultation appointment scheduled for <b>${dateTime}</b> has been cancelled.</p>
    `;
  }

  try {
    // If running in development without real SMTP credentials, log the email
    if (!process.env.SMTP_HOST) {
      console.log(`[Email Dispatch Simulation] To: ${toEmail} | Subject: ${subject}`);
      return;
    }
    await transporter.sendMail({
      from: '"PSU Lingayen HealthLink" <no-reply@psu.edu.ph>',
      to: toEmail,
      subject,
      html,
    });
  } catch (err) {
    console.error('[Email Dispatch Error]:', err.message);
  }
}