const campusClock = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

export function formatReportedTime(timestamp?: string | null): string {
  const instant = timestamp ? Date.parse(timestamp) : NaN;
  return Number.isNaN(instant) ? '—' : campusClock.format(instant);
}
