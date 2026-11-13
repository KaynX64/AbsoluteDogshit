type CachePage = { patients: unknown[]; emrRecords: unknown[] };

export async function saveBootstrapPages(
  fetchPage: (cursor: string | null) => Promise<Response>,
  savePage: (page: CachePage) => Promise<boolean>,
) {
  let cursor: string | null = null;
  let watermark: string | undefined;
  let patientCount = 0;
  let encounterCount = 0;
  const seen = new Set<string>();

  do {
    const response = await fetchPage(cursor);
    if (!response.ok) return null;
    const page = await response.json();
    const { patients, emrRecords, serverTime, nextCursor } = page ?? {};
    if (!Array.isArray(patients) || !Array.isArray(emrRecords) ||
        typeof serverTime !== 'string' || !Number.isFinite(Date.parse(serverTime)) ||
        (watermark !== undefined && serverTime !== watermark) ||
        (cursor !== null && nextCursor === undefined) ||
        (nextCursor != null && (typeof nextCursor !== 'string' || !nextCursor || seen.has(nextCursor)))) {
      throw new Error('Invalid offline bootstrap page.');
    }
    watermark = serverTime;
    if (!(await savePage({ patients, emrRecords }))) return null;
    patientCount += patients.length;
    encounterCount += emrRecords.length;
    if (nextCursor == null) {
      return { checkpoint: watermark, paged: nextCursor === null, patientCount, encounterCount };
    }
    cursor = nextCursor;
    seen.add(nextCursor);
  } while (cursor);

  return null;
}
