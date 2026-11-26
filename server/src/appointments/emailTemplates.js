const clinic = 'Pangasinan State University Lingayen Campus Clinic';
const checkIn = 'Please arrive 10 minutes early and have your QR Health Pass ready in the LeoVital app for check-in.';
const templates = {
  confirmation: {
    subject: 'Appointment confirmed',
    preview: 'Your visit is booked. Here’s when to arrive and what to bring.',
    title: 'Your appointment is confirmed',
    intro: `Your appointment at the ${clinic} is booked.`,
    next: 'To review or cancel your booking, open My appointments in LeoVital.',
    accent: '#17624d',
    tint: '#e8f5ef',
  },
  reminder: {
    subject: 'Upcoming appointment reminder',
    preview: 'Check your appointment time and have your QR Health Pass ready.',
    title: 'Your appointment is coming up',
    intro: `Here’s a reminder about your upcoming visit to the ${clinic}.`,
    next: 'If your plans change, you can cancel your booking under My appointments in LeoVital.',
    accent: '#234b79',
    tint: '#edf4fc',
  },
  cancellation: {
    subject: 'Appointment cancelled',
    preview: 'Your booking was cancelled. You can choose a new time in LeoVital.',
    title: 'Your appointment was cancelled',
    intro: `Your appointment at the ${clinic} has been cancelled.`,
    next: 'If you still need a consultation, open LeoVital to book a new appointment.',
    accent: '#853f36',
    tint: '#fbefec',
  },
};

export const appointmentEmailTypes = Object.freeze(Object.keys(templates));

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

// Appointments store Philippine wall-clock time in a MySQL DATETIME with no offset.
// Use UTC only as the formatter's reference so neither host timezone can shift it.
const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeZone: 'UTC' });
const timeFormat = new Intl.DateTimeFormat('en-US', { timeStyle: 'short', timeZone: 'UTC' });

export function renderAppointmentEmail({ type, patientName, dateTime, test = false }) {
  if (!Object.hasOwn(templates, type)) throw new TypeError('Unknown appointment email type.');
  const template = templates[type];
  const date = new Date(`${dateTime.replace(' ', 'T')}Z`);
  const when = `${dateFormat.format(date)} at ${timeFormat.format(date)} (Philippine time)`;
  const cancelled = type === 'cancellation';
  const dateLabel = cancelled ? 'Original appointment' : 'When';
  const name = patientName?.trim();
  const greeting = name ? `Hi ${name},` : 'Hello,';
  const testNotice = 'Test email · Sample appointment';
  const text = [
    ...(test ? [testNotice] : []),
    template.title, greeting, template.intro,
    `${dateLabel} · ${when}${cancelled ? '' : `\nWhere · ${clinic}`}`,
    ...(!cancelled ? [checkIn] : []),
    template.next, `LeoVital\n${clinic}`,
  ].join('\n\n');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${template.subject} | LeoVital</title></head>
<body style="margin:0;background:#f2f5f4;color:#1d302b;font-family:Arial,sans-serif;line-height:1.55;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${test ? `${testNotice}. ` : ''}${template.preview}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f5f4;">
    <tr><td align="center" style="padding:20px 12px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #d8e3df;border-radius:16px;">
        <tr><td style="padding:22px 24px;border-bottom:1px solid #d8e3df;color:#17624d;font-size:23px;font-weight:bold;">LeoVital</td></tr>
        <tr><td style="padding:24px;font-size:16px;">
          ${test ? `<p style="margin:0 0 16px;padding:10px 14px;border-radius:6px;background:#fff2cc;color:#523a00;font-weight:bold;">${testNotice}</p>` : ''}
          <h1 style="margin:0 0 18px;color:${template.accent};font-size:27px;line-height:1.2;">${template.title}</h1>
          <p style="margin:0 0 12px;">${escapeHtml(greeting)}</p>
          <p style="margin:0 0 18px;">${template.intro}</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${template.tint};border-radius:10px;">
            <tr><td style="padding:14px 16px;"><strong>${dateLabel}</strong><br>${escapeHtml(when)}${cancelled ? '' : `<br><strong>Where</strong><br>${clinic}`}</td></tr>
          </table>
          ${cancelled ? '' : `<p style="margin:18px 0 0;">${checkIn.replace('QR Health Pass', '<strong>QR Health Pass</strong>')}</p>`}
          <p style="margin:18px 0 0;">${template.next.replace('My appointments', '<strong>My appointments</strong>')}</p>
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #d8e3df;color:#405650;font-size:14px;"><strong>LeoVital</strong><br>${clinic}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  return { subject: `LeoVital | ${template.subject}`, text, html };
}
