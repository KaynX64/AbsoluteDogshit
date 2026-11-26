// Sends patient and test appointment emails through the shared SMTP transport.
import 'dotenv/config';
import nodemailer from 'nodemailer';
import { renderAppointmentEmail } from '../appointments/emailTemplates.js';

const { SMTP_HOST: host, SMTP_USER: user, SMTP_PASS: pass } = process.env;
const port = Number(process.env.SMTP_PORT || 587);
const configured = host && (!user || pass) && Number.isInteger(port) && port > 0 && port <= 65535;
const transporter = configured ? nodemailer.createTransport({
  host, port, secure: port === 465, requireTLS: true,
  auth: user ? { user, pass } : undefined,
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 15_000,
}) : null;

export const isAppointmentSmtpConfigured = () => transporter !== null;

export async function sendAppointmentEmail({ toEmail, ...details }, { adminTest = false } = {}) {
  if (!transporter) {
    console.log(`[Email Dispatch Simulation] ${details.type}`);
    return false;
  }
  if (!toEmail) return false;

  try {
    const email = renderAppointmentEmail({ ...details, test: adminTest });
    const message = await transporter.sendMail({
      from: { name: 'LeoVital', address: 'no-reply@psu.edu.ph' },
      to: { address: toEmail, name: '' },
      ...email,
      subject: adminTest ? ` ${email.subject}` : email.subject,
    });
    return message.accepted.length === 1;
  } catch (error) {
    console.error('[Email Dispatch Error]:', error.code ?? error.name);
    return false;
  }
}
