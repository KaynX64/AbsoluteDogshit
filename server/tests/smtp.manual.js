import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { config } from 'dotenv';
import nodemailer from 'nodemailer';

const { values: { send } } = parseArgs({ options: { send: { type: 'boolean' } } });
config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_TEST_RECIPIENTS } = process.env;
const port = Number(SMTP_PORT || 587);
const recipients = [...new Set((SMTP_TEST_RECIPIENTS ?? '').split(',')
  .map((address) => address.trim().toLowerCase()).filter(Boolean))];

if (!recipients.length || recipients.some((address) => !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address))) {
  console.error('Set SMTP_TEST_RECIPIENTS to a comma-separated list of email addresses in server/.env.');
  process.exitCode = 1;
} else if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Check SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS in server/.env.');
  process.exitCode = 1;
} else if (!send) {
  console.log(`SMTP test is configured for ${recipients.length} recipients. Add --send to send one test email per recipient.`);
} else {
  await sendTestEmails();
}

async function sendTestEmails() {
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  try {
    try {
      await transport.verify();
    } catch (error) {
      console.error(`SMTP verification failed (${error.code ?? error.name}). No emails were attempted.`);
      process.exitCode = 1;
      return;
    }

    let acceptedCount = 0;
    for (const [index, address] of recipients.entries()) {
      try {
        const { accepted } = await transport.sendMail({
          from: { name: 'LeoVital', address: SMTP_USER },
          to: address,
          subject: '[TEST] LeoVital | SMTP test',
          text: 'This is a test of the LeoVital email system. You can ignore this message.',
        });
        if (accepted.includes(address)) acceptedCount++;
        else console.error(`Recipient ${index + 1}: SMTP acceptance was not confirmed.`);
      } catch (error) {
        console.error(`Recipient ${index + 1}: SMTP acceptance was not confirmed (${error.code ?? error.name}).`);
      }
    }
    console.log(`SMTP accepted ${acceptedCount} of ${recipients.length} test emails.`);
    if (acceptedCount !== recipients.length) process.exitCode = 1;
  } finally {
    transport.close();
  }
}
